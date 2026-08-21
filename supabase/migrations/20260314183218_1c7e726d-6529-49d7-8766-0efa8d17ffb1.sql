-- Allow anonymous uploads to orders bucket for custom order photos
CREATE POLICY "Anon users can upload to orders bucket"
ON storage.objects FOR INSERT
TO anon
WITH CHECK (bucket_id = 'orders');