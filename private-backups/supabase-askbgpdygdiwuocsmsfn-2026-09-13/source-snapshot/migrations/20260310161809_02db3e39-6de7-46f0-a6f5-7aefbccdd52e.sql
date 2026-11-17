CREATE TABLE public.exported_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  order_number text NOT NULL,
  download_url text NOT NULL,
  completed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(order_id)
);

ALTER TABLE public.exported_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can do everything with exported_orders"
ON public.exported_orders FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));