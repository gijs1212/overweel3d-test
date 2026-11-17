-- Complete, data-safe expansion of the ready-made product catalogue.

ALTER TABLE public.product_categories
  ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS material_mode text NOT NULL DEFAULT 'selected',
  ADD COLUMN IF NOT EXISTS color_selection_mode text NOT NULL DEFAULT 'single',
  ADD COLUMN IF NOT EXISTS color_required boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS colors_configured boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_colors integer NOT NULL DEFAULT 1;

UPDATE public.products
SET material_mode = CASE
  WHEN material_fixed THEN 'fixed'
  WHEN cardinality(materials) = 0 THEN 'all'
  ELSE 'selected'
END
WHERE material_mode = 'selected';

UPDATE public.products
SET color_selection_mode = 'multiple',
    max_colors = GREATEST(max_colors, 2)
WHERE multicolor_allowed;

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_material_mode_check;
ALTER TABLE public.products ADD CONSTRAINT products_material_mode_check
  CHECK (material_mode IN ('fixed', 'selected', 'all'));
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_color_selection_mode_check;
ALTER TABLE public.products ADD CONSTRAINT products_color_selection_mode_check
  CHECK (color_selection_mode IN ('single', 'multiple'));
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_max_colors_check;
ALTER TABLE public.products ADD CONSTRAINT products_max_colors_check
  CHECK (max_colors BETWEEN 1 AND 12);

CREATE TABLE IF NOT EXISTS public.product_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  alt_text text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, storage_path)
);

-- Older installations already have product_images with url/is_main/order.
-- Extend that table in place and preserve those values instead of replacing it.
ALTER TABLE public.product_images
  ADD COLUMN IF NOT EXISTS storage_path text,
  ADD COLUMN IF NOT EXISTS alt_text text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'product_images' AND column_name = 'url'
  ) THEN
    EXECUTE 'UPDATE public.product_images SET storage_path = COALESCE(storage_path, url)';
    EXECUTE 'ALTER TABLE public.product_images ALTER COLUMN url DROP NOT NULL';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'product_images' AND column_name = 'is_main'
  ) THEN
    EXECUTE 'UPDATE public.product_images SET is_primary = COALESCE(is_main, false) WHERE NOT is_primary';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'product_images' AND column_name = 'order'
  ) THEN
    EXECUTE 'UPDATE public.product_images SET sort_order = COALESCE("order", 0) WHERE sort_order = 0';
  END IF;
END
$$;

UPDATE public.product_images
SET
  created_at = COALESCE(created_at, now()),
  updated_at = COALESCE(updated_at, created_at, now());

ALTER TABLE public.product_images
  ALTER COLUMN product_id SET NOT NULL,
  ALTER COLUMN storage_path SET NOT NULL,
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN created_at SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS product_images_product_storage_path_idx
  ON public.product_images (product_id, storage_path);

CREATE UNIQUE INDEX IF NOT EXISTS product_images_one_primary_idx
  ON public.product_images (product_id) WHERE is_primary;
CREATE INDEX IF NOT EXISTS product_images_product_sort_idx
  ON public.product_images (product_id, sort_order);

INSERT INTO public.product_images (product_id, storage_path, sort_order, is_primary)
SELECT p.id, image.storage_path, image.ordinality - 1, image.ordinality = 1
FROM public.products p
CROSS JOIN LATERAL unnest(COALESCE(p.photos, '{}'::text[])) WITH ORDINALITY AS image(storage_path, ordinality)
WHERE image.storage_path <> ''
ON CONFLICT (product_id, storage_path) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.product_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'text',
  label text NOT NULL,
  description text NOT NULL DEFAULT '',
  required boolean NOT NULL DEFAULT false,
  choices jsonb NOT NULL DEFAULT '[]'::jsonb,
  max_length integer,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_options_type_check CHECK (type IN ('text', 'textarea', 'select', 'radio', 'checkbox', 'photo')),
  CONSTRAINT product_options_choices_array_check CHECK (jsonb_typeof(choices) = 'array'),
  CONSTRAINT product_options_max_length_check CHECK (max_length IS NULL OR max_length BETWEEN 1 AND 5000)
);

CREATE INDEX IF NOT EXISTS product_options_product_sort_idx
  ON public.product_options (product_id, sort_order);

-- Retain old JSON custom fields by converting them once into relational options.
INSERT INTO public.product_options (product_id, type, label, description, required, choices, max_length, sort_order)
SELECT
  p.id,
  CASE WHEN field.value->>'type' IN ('text', 'textarea', 'select', 'radio', 'checkbox', 'photo')
    THEN field.value->>'type' ELSE 'text' END,
  COALESCE(NULLIF(field.value->>'label', ''), 'Extra keuze'),
  COALESCE(field.value->>'help', ''),
  lower(COALESCE(field.value->>'required', 'false')) = 'true',
  CASE WHEN jsonb_typeof(field.value->'choices') = 'array' THEN field.value->'choices' ELSE '[]'::jsonb END,
  CASE
    WHEN COALESCE(field.value->>'maxLength', '') ~ '^[0-9]+$'
      THEN LEAST(5000::numeric, GREATEST(1::numeric, (field.value->>'maxLength')::numeric))::integer
    ELSE NULL
  END,
  field.ordinality - 1
FROM public.products p
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(COALESCE(p.custom_fields, '[]'::jsonb)) = 'array'
    THEN COALESCE(p.custom_fields, '[]'::jsonb) ELSE '[]'::jsonb END
) WITH ORDINALITY AS field(value, ordinality)
WHERE jsonb_typeof(COALESCE(p.custom_fields, '[]'::jsonb)) = 'array'
  AND NOT EXISTS (SELECT 1 FROM public.product_options existing WHERE existing.product_id = p.id);

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS catalog_items jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_catalog_items_array_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_catalog_items_array_check
  CHECK (jsonb_typeof(catalog_items) = 'array');

-- The catalogue uses the inventory palette populated by the dedicated filament
-- migrations. Do not restore the historical hard-coded colors here.

-- Resolve legacy color slugs to the database palette only when a product has no
-- explicit availability configuration yet.
INSERT INTO public.product_color_availability (product_id, color_id, available)
SELECT p.id, color.id, true
FROM public.products p
JOIN public.filament_colors color ON (
  cardinality(p.materials) = 0
  OR EXISTS (SELECT 1 FROM unnest(p.materials) material WHERE lower(material) = lower(color.material))
)
WHERE color.active
  AND NOT EXISTS (
    SELECT 1 FROM public.product_color_availability configured WHERE configured.product_id = p.id
  )
  AND (
    cardinality(p.colors) = 0
    OR color.id::text = ANY(p.colors)
    OR CASE lower(color.name)
      WHEN 'wit' THEN 'white' WHEN 'zwart' THEN 'black' WHEN 'blauw' THEN 'blue'
      WHEN 'groen' THEN 'green' WHEN 'bladgroen' THEN 'leafgreen' WHEN 'rood' THEN 'red'
      WHEN 'geel' THEN 'yellow' WHEN 'grijs' THEN 'grey' ELSE lower(color.name)
    END = ANY(p.colors)
  )
ON CONFLICT (product_id, color_id) DO NOTHING;

UPDATE public.products product
SET colors_configured = true
WHERE EXISTS (
  SELECT 1 FROM public.product_color_availability configured WHERE configured.product_id = product.id
);

ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_options ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view product images" ON public.product_images;
CREATE POLICY "Anyone can view product images" ON public.product_images
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Admins manage product images" ON public.product_images;
CREATE POLICY "Admins manage product images" ON public.product_images
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Anyone can view active product options" ON public.product_options;
CREATE POLICY "Anyone can view active product options" ON public.product_options
  FOR SELECT TO anon, authenticated
  USING (active OR public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins manage product options" ON public.product_options;
CREATE POLICY "Admins manage product options" ON public.product_options
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

GRANT SELECT ON public.product_images, public.product_options TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_images, public.product_options TO authenticated;
GRANT ALL ON public.product_images, public.product_options TO service_role;

DROP TRIGGER IF EXISTS trg_product_images_updated_at ON public.product_images;
CREATE TRIGGER trg_product_images_updated_at BEFORE UPDATE ON public.product_images
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
DROP TRIGGER IF EXISTS trg_product_options_updated_at ON public.product_options;
CREATE TRIGGER trg_product_options_updated_at BEFORE UPDATE ON public.product_options
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Product media stays in the existing private orders bucket. Public catalogue paths
-- can be read, while only admins can mutate them through the existing admin delete policy.
DROP POLICY IF EXISTS "Public read product catalogue media" ON storage.objects;
CREATE POLICY "Public read product catalogue media" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'orders' AND (name LIKE 'products/%' OR name LIKE 'colors/%'));

-- Catalogue prefixes may only be written by admins. Guest/authenticated order
-- uploads keep working for every other path in the bucket.
DROP POLICY IF EXISTS "Authenticated users can upload order files" ON storage.objects;
CREATE POLICY "Authenticated users can upload order files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'orders'
    AND (
      (name NOT LIKE 'products/%' AND name NOT LIKE 'colors/%')
      OR public.has_role(auth.uid(), 'admin')
    )
  );
DROP POLICY IF EXISTS "Anon users can upload order files" ON storage.objects;
CREATE POLICY "Anon users can upload order files" ON storage.objects
  FOR INSERT TO anon
  WITH CHECK (bucket_id = 'orders' AND name NOT LIKE 'products/%' AND name NOT LIKE 'colors/%');
DROP POLICY IF EXISTS "Anon users can upload to orders bucket" ON storage.objects;
CREATE POLICY "Anon users can upload to orders bucket" ON storage.objects
  FOR INSERT TO anon
  WITH CHECK (bucket_id = 'orders' AND name NOT LIKE 'products/%' AND name NOT LIKE 'colors/%');
