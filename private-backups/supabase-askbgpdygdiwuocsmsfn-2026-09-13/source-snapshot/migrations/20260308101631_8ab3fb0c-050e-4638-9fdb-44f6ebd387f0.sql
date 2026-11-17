
-- Create a proper sequence for order numbers
CREATE SEQUENCE IF NOT EXISTS public.order_number_seq START WITH 1 INCREMENT BY 1;

-- Set sequence to current max
SELECT setval('public.order_number_seq', COALESCE((
  SELECT MAX(CAST(REPLACE(order_number, 'OW3D-', '') AS INTEGER)) FROM public.orders
), 0));

-- Replace the function with a sequence-based one (no duplicates possible)
CREATE OR REPLACE FUNCTION public.generate_order_number()
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  new_number TEXT;
BEGIN
  new_number := 'OW3D-' || LPAD(nextval('public.order_number_seq')::TEXT, 5, '0');
  RETURN new_number;
END;
$function$;
