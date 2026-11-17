-- Customer email preferences, idempotent welcome messages, campaign audit data,
-- and safe claiming of admin-created orders.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS newsletter_subscribed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS account_welcome_email_claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS account_welcome_email_sent_at timestamptz;

ALTER TABLE public.newsletter_subscriptions
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS welcome_email_claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS welcome_email_sent_at timestamptz;

ALTER TABLE public.newsletter_subscriptions
  DROP CONSTRAINT IF EXISTS newsletter_subscriptions_source_allowed;
ALTER TABLE public.newsletter_subscriptions
  ADD CONSTRAINT newsletter_subscriptions_source_allowed
  CHECK (source IN ('popup', 'footer', 'website', 'profile'));

CREATE UNIQUE INDEX IF NOT EXISTS newsletter_subscriptions_user_id_unique
  ON public.newsletter_subscriptions (user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_user_id
  ON public.orders (user_id)
  WHERE user_id IS NOT NULL;

REVOKE ALL ON FUNCTION public.subscribe_to_newsletter(text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.subscribe_to_newsletter(text, text) TO service_role;

-- Link existing newsletter rows to matching profiles without changing consent.
UPDATE public.newsletter_subscriptions AS subscription
SET user_id = profile.user_id
FROM public.profiles AS profile
WHERE subscription.user_id IS NULL
  AND lower(subscription.email) = lower(profile.email)
  AND NOT EXISTS (
    SELECT 1
    FROM public.newsletter_subscriptions AS linked
    WHERE linked.user_id = profile.user_id
  );

UPDATE public.profiles AS profile
SET newsletter_subscribed = subscription.active
FROM public.newsletter_subscriptions AS subscription
WHERE subscription.user_id = profile.user_id
  AND profile.newsletter_subscribed IS DISTINCT FROM subscription.active;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE existing_subscription_active boolean := false;
BEGIN
  SELECT active
  INTO existing_subscription_active
  FROM public.newsletter_subscriptions
  WHERE lower(email) = lower(coalesce(NEW.email, ''))
  LIMIT 1;

  INSERT INTO public.profiles (user_id, email, full_name, newsletter_subscribed)
  VALUES (
    NEW.id,
    coalesce(NEW.email, ''),
    coalesce(NEW.raw_user_meta_data ->> 'full_name', ''),
    coalesce(existing_subscription_active, false)
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'customer')
  ON CONFLICT (user_id, role) DO NOTHING;

  UPDATE public.newsletter_subscriptions
  SET user_id = NEW.id
  WHERE lower(email) = lower(coalesce(NEW.email, ''))
    AND user_id IS NULL;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.sync_newsletter_profile_preference()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.user_id IS NOT NULL THEN
    UPDATE public.profiles
    SET newsletter_subscribed = NEW.active
    WHERE user_id = NEW.user_id
      AND newsletter_subscribed IS DISTINCT FROM NEW.active;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_newsletter_profile_preference() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sync_newsletter_profile_preference ON public.newsletter_subscriptions;
CREATE TRIGGER trg_sync_newsletter_profile_preference
  AFTER INSERT OR UPDATE OF active, user_id ON public.newsletter_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_newsletter_profile_preference();

-- Service-only upsert used by the Edge Function. Public clients never receive
-- direct write permissions on newsletter_subscriptions.
CREATE OR REPLACE FUNCTION public.set_newsletter_subscription(
  p_email text,
  p_source text,
  p_active boolean,
  p_user_id uuid DEFAULT NULL
)
RETURNS TABLE(subscription_id uuid, welcome_needed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  normalized_email text := lower(btrim(p_email));
  normalized_source text := lower(coalesce(nullif(btrim(p_source), ''), 'website'));
BEGIN
  IF normalized_email IS NULL
    OR char_length(normalized_email) NOT BETWEEN 3 AND 254
    OR normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  THEN
    RAISE EXCEPTION 'Ongeldig e-mailadres' USING ERRCODE = '22023';
  END IF;

  IF normalized_source NOT IN ('popup', 'footer', 'website', 'profile') THEN
    normalized_source := 'website';
  END IF;

  RETURN QUERY
  INSERT INTO public.newsletter_subscriptions AS subscription (
    email, source, active, subscribed_at, unsubscribed_at, user_id
  )
  VALUES (
    normalized_email,
    normalized_source,
    p_active,
    now(),
    CASE WHEN p_active THEN NULL ELSE now() END,
    p_user_id
  )
  ON CONFLICT ((lower(email))) DO UPDATE
  SET
    active = EXCLUDED.active,
    unsubscribed_at = CASE WHEN EXCLUDED.active THEN NULL ELSE now() END,
    subscribed_at = CASE
      WHEN EXCLUDED.active AND NOT subscription.active THEN now()
      ELSE subscription.subscribed_at
    END,
    source = CASE WHEN EXCLUDED.active THEN EXCLUDED.source ELSE subscription.source END,
    user_id = COALESCE(subscription.user_id, EXCLUDED.user_id)
  RETURNING subscription.id,
    subscription.active AND subscription.welcome_email_sent_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.set_newsletter_subscription(text, text, boolean, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_newsletter_subscription(text, text, boolean, uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.claim_newsletter_welcome(p_subscription_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE claimed_id uuid;
BEGIN
  UPDATE public.newsletter_subscriptions
  SET welcome_email_claimed_at = clock_timestamp()
  WHERE id = p_subscription_id
    AND active
    AND welcome_email_sent_at IS NULL
    AND (
      welcome_email_claimed_at IS NULL
      OR welcome_email_claimed_at < clock_timestamp() - interval '15 minutes'
    )
  RETURNING id INTO claimed_id;
  RETURN claimed_id IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_newsletter_welcome(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_newsletter_welcome(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_account_welcome(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE claimed_id uuid;
BEGIN
  UPDATE public.profiles
  SET account_welcome_email_claimed_at = clock_timestamp()
  WHERE user_id = p_user_id
    AND account_welcome_email_sent_at IS NULL
    AND (
      account_welcome_email_claimed_at IS NULL
      OR account_welcome_email_claimed_at < clock_timestamp() - interval '15 minutes'
    )
  RETURNING id INTO claimed_id;
  RETURN claimed_id IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_account_welcome(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_account_welcome(uuid) TO service_role;

CREATE TABLE IF NOT EXISTS public.email_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  template_kind text NOT NULL,
  change_type text,
  audience text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'sending',
  recipient_count integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  CONSTRAINT email_campaigns_template_kind_check
    CHECK (template_kind IN ('color', 'material', 'article', 'custom')),
  CONSTRAINT email_campaigns_change_type_check
    CHECK (change_type IS NULL OR change_type IN ('new', 'removed')),
  CONSTRAINT email_campaigns_audience_check
    CHECK (audience IN ('newsletter', 'all_customers')),
  CONSTRAINT email_campaigns_status_check
    CHECK (status IN ('sending', 'sent', 'partial', 'failed')),
  CONSTRAINT email_campaigns_counts_nonnegative
    CHECK (recipient_count >= 0 AND sent_count >= 0 AND failed_count >= 0)
);

ALTER TABLE public.email_campaigns ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS email_campaigns_created_by_idx
  ON public.email_campaigns (created_by);

DROP POLICY IF EXISTS "Admins can view email campaigns" ON public.email_campaigns;
CREATE POLICY "Admins can view email campaigns"
  ON public.email_campaigns
  FOR SELECT
  TO authenticated
  USING (public.has_role((select auth.uid()), 'admin'));

REVOKE ALL ON TABLE public.email_campaigns FROM anon, authenticated;
GRANT SELECT ON TABLE public.email_campaigns TO authenticated;
GRANT ALL ON TABLE public.email_campaigns TO service_role;

-- A customer can claim an unlinked admin-created order only when both the
-- high-entropy order token and the authenticated account email match.
CREATE OR REPLACE FUNCTION public.claim_order_to_account(p_token text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  requester_id uuid := auth.uid();
  requester_email text;
  current_owner uuid;
  order_email text;
BEGIN
  IF requester_id IS NULL THEN
    RAISE EXCEPTION 'U moet ingelogd zijn' USING ERRCODE = '42501';
  END IF;
  IF p_token IS NULL OR char_length(p_token) < 32 THEN
    RAISE EXCEPTION 'Ongeldige bestellink' USING ERRCODE = '22023';
  END IF;

  SELECT lower(email) INTO requester_email
  FROM auth.users
  WHERE id = requester_id;

  SELECT user_id, lower(customer_email)
  INTO current_owner, order_email
  FROM public.orders
  WHERE customer_order_token = p_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;
  IF current_owner = requester_id THEN
    RETURN true;
  END IF;
  IF current_owner IS NOT NULL THEN
    RAISE EXCEPTION 'Deze bestelling is al aan een ander account gekoppeld' USING ERRCODE = '23505';
  END IF;
  IF requester_email IS NULL OR requester_email <> order_email THEN
    RAISE EXCEPTION 'Log in met hetzelfde e-mailadres als op de bestelling' USING ERRCODE = '42501';
  END IF;

  UPDATE public.orders
  SET user_id = requester_id
  WHERE customer_order_token = p_token
    AND user_id IS NULL;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_order_to_account(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_order_to_account(text) TO authenticated;

-- Harden the existing profile update policy with an explicit ownership check.
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);
