ALTER TABLE public.discount_codes
  ADD COLUMN IF NOT EXISTS source_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS discount_codes_one_reward_per_order_idx
  ON public.discount_codes (source_order_id)
  WHERE source_order_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
