ALTER TABLE public.orders 
  ADD COLUMN IF NOT EXISTS customer_upload_requested boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS customer_upload_request_note text,
  ADD COLUMN IF NOT EXISTS customer_upload_requested_at timestamptz;

-- Allow the order owner to insert files when admin requested an upload
DROP POLICY IF EXISTS "Customers can upload files when requested" ON public.order_files;
CREATE POLICY "Customers can upload files when requested"
  ON public.order_files
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_files.order_id
        AND o.user_id = auth.uid()
        AND o.customer_upload_requested = true
    )
  );