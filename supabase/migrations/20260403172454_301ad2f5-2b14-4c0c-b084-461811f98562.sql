
-- Products table for ready-made articles
CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  price numeric NOT NULL DEFAULT 0,
  materials text[] NOT NULL DEFAULT '{}',
  colors text[] NOT NULL DEFAULT '{}',
  photos text[] NOT NULL DEFAULT '{}',
  custom_text_enabled boolean NOT NULL DEFAULT false,
  custom_text_label text NOT NULL DEFAULT 'Aangepaste tekst',
  custom_text_max_length integer NOT NULL DEFAULT 50,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active products"
  ON public.products FOR SELECT
  USING (active = true);

CREATE POLICY "Admins can manage all products"
  ON public.products FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Add shipping and plate tracking columns to orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS shipping_carrier text DEFAULT '',
  ADD COLUMN IF NOT EXISTS tracking_code text DEFAULT '',
  ADD COLUMN IF NOT EXISTS shipping_cost numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS plate_runs_required integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS plate_runs_completed jsonb DEFAULT '[]';
