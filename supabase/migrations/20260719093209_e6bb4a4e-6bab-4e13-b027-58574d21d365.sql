
CREATE TABLE public.filament_colors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  material text NOT NULL,
  hex text NOT NULL DEFAULT '#808080',
  photos text[] NOT NULL DEFAULT '{}',
  description text NOT NULL DEFAULT '',
  sort_order int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.filament_colors TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.filament_colors TO authenticated;
GRANT ALL ON public.filament_colors TO service_role;

ALTER TABLE public.filament_colors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active colors" ON public.filament_colors
  FOR SELECT USING (active = true OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage colors" ON public.filament_colors
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.product_color_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  color_id uuid NOT NULL REFERENCES public.filament_colors(id) ON DELETE CASCADE,
  available boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, color_id)
);

GRANT SELECT ON public.product_color_availability TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_color_availability TO authenticated;
GRANT ALL ON public.product_color_availability TO service_role;

ALTER TABLE public.product_color_availability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view product color availability" ON public.product_color_availability
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage product color availability" ON public.product_color_availability
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_filament_colors_updated_at
  BEFORE UPDATE ON public.filament_colors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER trg_product_color_availability_updated_at
  BEFORE UPDATE ON public.product_color_availability
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX filament_colors_material_idx ON public.filament_colors(material);
CREATE INDEX pca_product_idx ON public.product_color_availability(product_id);
CREATE INDEX pca_color_idx ON public.product_color_availability(color_id);
