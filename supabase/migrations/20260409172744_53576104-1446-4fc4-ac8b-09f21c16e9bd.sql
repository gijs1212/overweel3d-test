CREATE OR REPLACE FUNCTION public.increment_discount_usage(code_text text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.discount_codes
  SET times_used = times_used + 1
  WHERE code = code_text;
END;
$$;