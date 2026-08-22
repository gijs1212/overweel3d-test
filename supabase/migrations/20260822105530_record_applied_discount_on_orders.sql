ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS applied_discount_code text
  REFERENCES public.discount_codes(code) ON UPDATE CASCADE ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS orders_applied_discount_code_idx
  ON public.orders (applied_discount_code)
  WHERE applied_discount_code IS NOT NULL;

NOTIFY pgrst, 'reload schema';
