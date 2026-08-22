ALTER TABLE public.discount_codes
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
