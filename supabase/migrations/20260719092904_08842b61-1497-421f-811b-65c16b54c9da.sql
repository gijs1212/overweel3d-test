
ALTER TABLE public.discount_codes
  ADD COLUMN IF NOT EXISTS is_referral boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS owner_email text,
  ADD COLUMN IF NOT EXISTS owner_name text,
  ADD COLUMN IF NOT EXISTS reward_percentage numeric,
  ADD COLUMN IF NOT EXISTS parent_code_id uuid REFERENCES public.discount_codes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_to_email text;

CREATE INDEX IF NOT EXISTS discount_codes_assigned_to_email_idx ON public.discount_codes(assigned_to_email);
CREATE INDEX IF NOT EXISTS discount_codes_owner_email_idx ON public.discount_codes(owner_email);
