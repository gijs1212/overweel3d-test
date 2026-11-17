-- Remove legacy permissive catalogue policies and keep mutations admin-only.

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_options ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public select" ON public.products;
DROP POLICY IF EXISTS "authenticated insert" ON public.products;
DROP POLICY IF EXISTS "authenticated update" ON public.products;
DROP POLICY IF EXISTS "authenticated delete" ON public.products;
DROP POLICY IF EXISTS "Anyone can view active products" ON public.products;
DROP POLICY IF EXISTS "Admins can manage all products" ON public.products;

CREATE POLICY "Anyone can view active products" ON public.products
  FOR SELECT TO anon, authenticated
  USING (active OR public.has_role((SELECT auth.uid()), 'admin'));
CREATE POLICY "Admins can insert products" ON public.products
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role((SELECT auth.uid()), 'admin'));
CREATE POLICY "Admins can update products" ON public.products
  FOR UPDATE TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'admin'))
  WITH CHECK (public.has_role((SELECT auth.uid()), 'admin'));
CREATE POLICY "Admins can delete products" ON public.products
  FOR DELETE TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'admin'));

DROP POLICY IF EXISTS "public select" ON public.product_images;
DROP POLICY IF EXISTS "authenticated insert" ON public.product_images;
DROP POLICY IF EXISTS "authenticated update" ON public.product_images;
DROP POLICY IF EXISTS "authenticated delete" ON public.product_images;
DROP POLICY IF EXISTS "Anyone can view product images" ON public.product_images;
DROP POLICY IF EXISTS "Admins manage product images" ON public.product_images;

CREATE POLICY "Anyone can view product media" ON public.product_images
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins can insert product media" ON public.product_images
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role((SELECT auth.uid()), 'admin'));
CREATE POLICY "Admins can update product media" ON public.product_images
  FOR UPDATE TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'admin'))
  WITH CHECK (public.has_role((SELECT auth.uid()), 'admin'));
CREATE POLICY "Admins can delete product media" ON public.product_images
  FOR DELETE TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'admin'));

DROP POLICY IF EXISTS "Anyone can view active product options" ON public.product_options;
DROP POLICY IF EXISTS "Admins manage product options" ON public.product_options;

CREATE POLICY "Anyone can view active product options" ON public.product_options
  FOR SELECT TO anon, authenticated
  USING (active OR public.has_role((SELECT auth.uid()), 'admin'));
CREATE POLICY "Admins can insert product options" ON public.product_options
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role((SELECT auth.uid()), 'admin'));
CREATE POLICY "Admins can update product options" ON public.product_options
  FOR UPDATE TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'admin'))
  WITH CHECK (public.has_role((SELECT auth.uid()), 'admin'));
CREATE POLICY "Admins can delete product options" ON public.product_options
  FOR DELETE TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'admin'));

NOTIFY pgrst, 'reload schema';
