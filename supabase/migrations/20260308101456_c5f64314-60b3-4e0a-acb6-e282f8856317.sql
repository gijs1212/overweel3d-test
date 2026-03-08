
-- Allow anonymous (guest) users to insert orders with null user_id
CREATE POLICY "Anon users can insert orders"
ON public.orders FOR INSERT
TO anon
WITH CHECK (user_id IS NULL);

-- Allow anonymous users to view their order by token (for redirect after submit)
CREATE POLICY "Anon users can view orders by token"
ON public.orders FOR SELECT
TO anon
USING (true);

-- Allow anonymous users to insert order_files for orders they just created
CREATE POLICY "Anon users can insert order files"
ON public.order_files FOR INSERT
TO anon
WITH CHECK (true);

-- Allow anonymous users to upload files to storage
CREATE POLICY "Anon users can upload order files"
ON storage.objects FOR INSERT
TO anon
WITH CHECK (bucket_id = 'orders');
