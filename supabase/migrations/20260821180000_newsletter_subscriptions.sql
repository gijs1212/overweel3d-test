-- Canonical newsletter subscriptions table.
-- The earlier newsletter_subscribers table is left intact so existing data is
-- never removed. Its rows are copied once into this table below.
CREATE TABLE IF NOT EXISTS public.newsletter_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  source text NOT NULL DEFAULT 'website',
  active boolean NOT NULL DEFAULT true,
  subscribed_at timestamptz NOT NULL DEFAULT now(),
  unsubscribed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT newsletter_subscriptions_email_length
    CHECK (char_length(email) BETWEEN 3 AND 254),
  CONSTRAINT newsletter_subscriptions_source_length
    CHECK (char_length(source) BETWEEN 1 AND 50),
  CONSTRAINT newsletter_subscriptions_unsubscribe_state
    CHECK (
      (active AND unsubscribed_at IS NULL)
      OR (NOT active)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS newsletter_subscriptions_email_unique
  ON public.newsletter_subscriptions (lower(email));

CREATE INDEX IF NOT EXISTS newsletter_subscriptions_active_subscribed_at_idx
  ON public.newsletter_subscriptions (subscribed_at DESC)
  WHERE active;

ALTER TABLE public.newsletter_subscriptions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.newsletter_subscriptions FROM anon, authenticated;
GRANT SELECT, UPDATE, DELETE ON TABLE public.newsletter_subscriptions TO authenticated;
GRANT ALL ON TABLE public.newsletter_subscriptions TO service_role;

DROP POLICY IF EXISTS "Admins can view newsletter subscriptions" ON public.newsletter_subscriptions;
CREATE POLICY "Admins can view newsletter subscriptions"
  ON public.newsletter_subscriptions
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins can update newsletter subscriptions" ON public.newsletter_subscriptions;
CREATE POLICY "Admins can update newsletter subscriptions"
  ON public.newsletter_subscriptions
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins can delete newsletter subscriptions" ON public.newsletter_subscriptions;
CREATE POLICY "Admins can delete newsletter subscriptions"
  ON public.newsletter_subscriptions
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP TRIGGER IF EXISTS trg_newsletter_subscriptions_updated_at ON public.newsletter_subscriptions;
CREATE TRIGGER trg_newsletter_subscriptions_updated_at
  BEFORE UPDATE ON public.newsletter_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- Public visitors subscribe through this narrow function instead of receiving
-- table permissions. It normalizes input, validates it server-side and makes
-- repeat signups idempotent without revealing whether an address already exists.
CREATE OR REPLACE FUNCTION public.subscribe_to_newsletter(
  _email text,
  _source text DEFAULT 'website'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  normalized_email text := lower(btrim(_email));
  normalized_source text := left(coalesce(nullif(btrim(_source), ''), 'website'), 50);
BEGIN
  IF normalized_email IS NULL
    OR char_length(normalized_email) NOT BETWEEN 3 AND 254
    OR normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  THEN
    RAISE EXCEPTION 'Ongeldig e-mailadres' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.newsletter_subscriptions (
    email,
    source,
    active,
    subscribed_at,
    unsubscribed_at
  )
  VALUES (
    normalized_email,
    normalized_source,
    true,
    now(),
    NULL
  )
  ON CONFLICT ((lower(email))) DO UPDATE
  SET
    active = true,
    unsubscribed_at = NULL,
    subscribed_at = CASE
      WHEN public.newsletter_subscriptions.active THEN public.newsletter_subscriptions.subscribed_at
      ELSE now()
    END,
    source = CASE
      WHEN public.newsletter_subscriptions.active THEN public.newsletter_subscriptions.source
      ELSE EXCLUDED.source
    END;
END;
$$;

REVOKE ALL ON FUNCTION public.subscribe_to_newsletter(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.subscribe_to_newsletter(text, text) TO anon, authenticated, service_role;

-- Preserve signups collected through the previous table when that migration
-- has already been applied. The dynamic statement also keeps this migration
-- safe for installations where the legacy table never existed.
DO $$
BEGIN
  IF to_regclass('public.newsletter_subscribers') IS NOT NULL THEN
    EXECUTE $copy$
      INSERT INTO public.newsletter_subscriptions (
        id,
        email,
        source,
        active,
        subscribed_at,
        unsubscribed_at,
        created_at,
        updated_at
      )
      SELECT
        id,
        lower(btrim(email)),
        left(coalesce(nullif(btrim(source), ''), 'website'), 50),
        active,
        created_at,
        CASE WHEN active THEN NULL ELSE updated_at END,
        created_at,
        updated_at
      FROM public.newsletter_subscribers
      WHERE email IS NOT NULL
        AND char_length(lower(btrim(email))) BETWEEN 3 AND 254
        AND lower(btrim(email)) ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      ON CONFLICT ((lower(email))) DO NOTHING
    $copy$;
  END IF;
END;
$$;
