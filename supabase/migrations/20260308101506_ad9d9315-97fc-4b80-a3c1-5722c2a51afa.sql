
-- Drop overly permissive policies and replace with scoped ones
DROP POLICY IF EXISTS "Anon users can view orders by token" ON public.orders;
DROP POLICY IF EXISTS "Anon users can insert order files" ON public.order_files;

-- Anon can only SELECT orders (the edge function handles token-based access with service role)
-- No need for anon SELECT on orders - the edge function get-order-by-token handles this

-- Anon can insert order_files only for orders with null user_id (guest orders)
CREATE POLICY "Anon users can insert order files"
ON public.order_files FOR INSERT
TO anon
WITH CHECK (EXISTS (
  SELECT 1 FROM public.orders 
  WHERE orders.id = order_files.order_id 
  AND orders.user_id IS NULL
));
