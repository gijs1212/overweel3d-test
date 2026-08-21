ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS color_slot_labels text[] NOT NULL DEFAULT '{}'::text[];

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_color_slot_labels_limit_check;
ALTER TABLE public.products ADD CONSTRAINT products_color_slot_labels_limit_check
  CHECK (cardinality(color_slot_labels) <= 12);

NOTIFY pgrst, 'reload schema';
