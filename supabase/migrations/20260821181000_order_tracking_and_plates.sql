-- Order link visits, independent plate/product totals and persistent per-plate state.
-- Legacy production columns remain in place so existing data and older exports keep working.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS link_first_viewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS link_last_viewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS link_view_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_plates integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_products integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS plate_print_statuses jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS confirmation_email_claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmation_email_sent_at timestamptz;

-- This legacy policy used USING (true), which exposed every order to the anon
-- REST API. Customer token access now goes exclusively through the allow-listed
-- get-order-by-token edge function.
DROP POLICY IF EXISTS "Anon users can view orders by token" ON public.orders;
DROP POLICY IF EXISTS "Anon users can insert orders" ON public.orders;

-- Backfill the new independent totals from the legacy fields without deleting or
-- changing those fields. The longest legacy plate representation wins.
UPDATE public.orders
SET total_products = GREATEST(COALESCE(parts_total, 0), COALESCE(quantity, 0), 0)
WHERE total_products = 0;

UPDATE public.orders
SET total_plates = GREATEST(
  COALESCE(plates_completed, 0),
  CASE
    WHEN COALESCE(parts_total, 0) > 0 AND COALESCE(parts_per_plate, 0) > 0
      THEN CEIL(parts_total::numeric / parts_per_plate)::integer
    ELSE 0
  END,
  CASE
    WHEN jsonb_typeof(plate_runs_completed) = 'array'
      THEN jsonb_array_length(plate_runs_completed)
    ELSE 0
  END,
  CASE
    WHEN jsonb_typeof(plate_runs_required_per_plate) = 'array'
      THEN jsonb_array_length(plate_runs_required_per_plate)
    ELSE 0
  END,
  0
)
WHERE total_plates = 0;

-- Preserve completed legacy plates as boolean statuses. New data only uses the
-- boolean array, so product counts never imply products per plate.
UPDATE public.orders AS o
SET plate_print_statuses = COALESCE(
  (
    SELECT jsonb_agg(
      CASE
        WHEN plate_index < COALESCE(o.plates_completed, 0) THEN true
        WHEN jsonb_typeof(o.plate_runs_completed) = 'array'
          AND COALESCE(
            CASE
              WHEN (o.plate_runs_completed ->> plate_index) ~ '^[0-9]+$'
                AND char_length(o.plate_runs_completed ->> plate_index) <= 9
                THEN (o.plate_runs_completed ->> plate_index)::integer
              ELSE 0
            END,
            0
          ) >= GREATEST(
            COALESCE(
              CASE
                WHEN jsonb_typeof(o.plate_runs_required_per_plate) = 'array'
                  AND (o.plate_runs_required_per_plate ->> plate_index) ~ '^[0-9]+$'
                  AND char_length(o.plate_runs_required_per_plate ->> plate_index) <= 9
                  THEN (o.plate_runs_required_per_plate ->> plate_index)::integer
                ELSE NULL
              END,
              NULLIF(o.plate_runs_required, 0),
              1
            ),
            1
          )
        THEN true
        ELSE false
      END
      ORDER BY plate_index
    )
    FROM generate_series(0, o.total_plates - 1) AS generated(plate_index)
  ),
  '[]'::jsonb
)
WHERE o.total_plates > 0
  AND (o.plate_print_statuses IS NULL OR o.plate_print_statuses = '[]'::jsonb);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_link_view_count_nonnegative'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_link_view_count_nonnegative CHECK (link_view_count >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_total_plates_nonnegative'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_total_plates_nonnegative CHECK (total_plates >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_total_products_nonnegative'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_total_products_nonnegative CHECK (total_products >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_plate_print_statuses_array'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_plate_print_statuses_array
      CHECK (
        jsonb_typeof(plate_print_statuses) = 'array'
        AND jsonb_array_length(plate_print_statuses) = total_plates
      );
  END IF;
END
$$;

-- Called only by the token edge function using the service role. Keeping the
-- mutation here makes first/last/count updates atomic, including concurrent opens.
CREATE OR REPLACE FUNCTION public.record_order_link_visit(p_token text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  updated_id uuid;
BEGIN
  UPDATE public.orders
  SET
    link_first_viewed_at = COALESCE(link_first_viewed_at, clock_timestamp()),
    link_last_viewed_at = clock_timestamp(),
    link_view_count = link_view_count + 1
  WHERE customer_order_token = p_token
  RETURNING id INTO updated_id;

  RETURN updated_id IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.record_order_link_visit(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_order_link_visit(text) TO service_role;

-- A short-lived database claim prevents two concurrent admin-create requests
-- from sending the same thank-you email. Resend also receives a stable
-- idempotency key in the edge function to cover retries after delivery.
CREATE OR REPLACE FUNCTION public.claim_order_confirmation(p_order_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  claimed_id uuid;
BEGIN
  UPDATE public.orders
  SET confirmation_email_claimed_at = clock_timestamp()
  WHERE id = p_order_id
    AND confirmation_email_sent_at IS NULL
    AND (
      confirmation_email_claimed_at IS NULL
      OR confirmation_email_claimed_at < clock_timestamp() - interval '15 minutes'
    )
  RETURNING id INTO claimed_id;

  RETURN claimed_id IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_order_confirmation(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_order_confirmation(uuid) TO service_role;

-- Safe replacement for the former anon INSERT ... RETURNING flow. The old anon
-- SELECT policy exposed every order because PostgreSQL policies cannot inspect a
-- URL filter. This function accepts a strict allow-list and returns only the new
-- id and high-entropy customer token.
CREATE OR REPLACE FUNCTION public.create_guest_order(p_order jsonb)
RETURNS TABLE(id uuid, customer_order_token text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  created_id uuid;
  created_token text;
BEGIN
  IF p_order IS NULL
    OR jsonb_typeof(p_order) <> 'object'
    OR octet_length(p_order::text) > 200000
    OR COALESCE(BTRIM(p_order ->> 'customer_name'), '') = ''
    OR char_length(BTRIM(p_order ->> 'customer_name')) > 200
    OR COALESCE(BTRIM(p_order ->> 'customer_email'), '') !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    OR char_length(BTRIM(p_order ->> 'customer_email')) > 254
    OR COALESCE(BTRIM(p_order ->> 'order_number'), '') !~ '^OW3D-[0-9]+$'
    OR char_length(p_order ->> 'order_number') > 40
    OR COALESCE(p_order ->> 'quantity', '') !~ '^[0-9]{1,7}$'
    OR COALESCE(p_order ->> 'instant_quote_price', '') !~ '^[0-9]{1,9}([.][0-9]{1,4})?$'
    OR COALESCE(p_order ->> 'order_method', 'file') NOT IN ('file', 'link', 'prebuilt', 'custom', 'mixed')
    OR char_length(COALESCE(p_order ->> 'phone', '')) > 100
    OR char_length(COALESCE(p_order ->> 'company_name', '')) > 200
    OR char_length(COALESCE(p_order ->> 'billing_address', '')) > 500
    OR char_length(COALESCE(p_order ->> 'shipping_address', '')) > 500
    OR char_length(COALESCE(p_order ->> 'notes', '')) > 10000
    OR char_length(COALESCE(p_order ->> 'file_links', '')) > 100000
    OR (
      p_order ? 'catalog_items'
      AND (
        jsonb_typeof(p_order -> 'catalog_items') <> 'array'
        OR octet_length((p_order -> 'catalog_items')::text) > 100000
      )
    )
  THEN
    RAISE EXCEPTION 'Invalid guest order data';
  END IF;

  INSERT INTO public.orders AS created_order (
    order_number,
    user_id,
    customer_email,
    customer_name,
    phone,
    company_name,
    billing_address,
    shipping_address,
    postal_code,
    city,
    country,
    material,
    color,
    quantity,
    notes,
    print_preferences,
    instant_quote_price,
    file_links,
    order_method,
    status
  ) VALUES (
    p_order ->> 'order_number',
    NULL,
    BTRIM(p_order ->> 'customer_email'),
    BTRIM(p_order ->> 'customer_name'),
    COALESCE(p_order ->> 'phone', ''),
    COALESCE(p_order ->> 'company_name', ''),
    COALESCE(p_order ->> 'billing_address', ''),
    COALESCE(p_order ->> 'shipping_address', p_order ->> 'billing_address', ''),
    COALESCE(p_order ->> 'postal_code', ''),
    COALESCE(p_order ->> 'city', ''),
    COALESCE(p_order ->> 'country', 'Nederland'),
    COALESCE(p_order ->> 'material', ''),
    COALESCE(p_order ->> 'color', ''),
    GREATEST(COALESCE((p_order ->> 'quantity')::integer, 1), 0),
    COALESCE(p_order ->> 'notes', ''),
    COALESCE(p_order ->> 'print_preferences', ''),
    GREATEST(COALESCE((p_order ->> 'instant_quote_price')::numeric, 0), 0),
    COALESCE(p_order ->> 'file_links', ''),
    COALESCE(p_order ->> 'order_method', 'file'),
    'submitted'::public.order_status
  )
  RETURNING created_order.id, created_order.customer_order_token
  INTO created_id, created_token;

  -- catalog_items is introduced by the immediately following catalog migration.
  -- Dynamic SQL lets this migration remain independently deployable while still
  -- retaining catalog selections when the guest function is called afterwards.
  IF p_order ? 'catalog_items'
    AND jsonb_typeof(p_order -> 'catalog_items') = 'array'
    AND EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'orders'
        AND column_name = 'catalog_items'
    )
  THEN
    EXECUTE 'UPDATE public.orders SET catalog_items = $1 WHERE id = $2'
      USING p_order -> 'catalog_items', created_id;
  END IF;

  RETURN QUERY SELECT created_id, created_token;
END;
$$;

REVOKE ALL ON FUNCTION public.create_guest_order(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_guest_order(jsonb) TO anon, authenticated, service_role;

CREATE INDEX IF NOT EXISTS idx_orders_link_last_viewed_at
  ON public.orders (link_last_viewed_at DESC)
  WHERE link_last_viewed_at IS NOT NULL;
