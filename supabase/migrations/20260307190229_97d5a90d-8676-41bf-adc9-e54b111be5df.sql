
-- Create order status enum
CREATE TYPE public.order_status AS ENUM (
  'draft',
  'submitted',
  'under_review',
  'waiting_for_approval',
  'approved_by_customer',
  'rejected_by_customer',
  'waiting_for_payment',
  'in_production',
  'completed',
  'cancelled'
);

-- Create app role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'customer');

-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  full_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT DEFAULT '',
  company_name TEXT DEFAULT '',
  billing_address TEXT DEFAULT '',
  shipping_address TEXT DEFAULT '',
  postal_code TEXT DEFAULT '',
  city TEXT DEFAULT '',
  country TEXT DEFAULT 'Nederland',
  vat_number TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- User roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

-- Orders table
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT NOT NULL UNIQUE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  customer_email TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  phone TEXT DEFAULT '',
  company_name TEXT DEFAULT '',
  billing_address TEXT DEFAULT '',
  shipping_address TEXT DEFAULT '',
  postal_code TEXT DEFAULT '',
  city TEXT DEFAULT '',
  country TEXT DEFAULT 'Nederland',
  vat_number TEXT DEFAULT '',
  material TEXT DEFAULT '',
  color TEXT DEFAULT '',
  quantity INTEGER DEFAULT 1,
  notes TEXT DEFAULT '',
  print_preferences TEXT DEFAULT '',
  instant_quote_price NUMERIC(10,2),
  final_price NUMERIC(10,2),
  tikkie_link TEXT,
  status order_status NOT NULL DEFAULT 'submitted',
  customer_order_token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  customer_visible_notes TEXT DEFAULT '',
  internal_notes TEXT DEFAULT '',
  submitted_at TIMESTAMPTZ DEFAULT now(),
  approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Order files table
CREATE TABLE public.order_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
  storage_path TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  file_size BIGINT DEFAULT 0,
  mime_type TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Order events table
CREATE TABLE public.order_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
  event_type TEXT NOT NULL,
  event_description TEXT DEFAULT '',
  performed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  visible_to_customer BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Security definer function for role checking
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', '')
  );
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'customer');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Generate order number function
CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  new_number TEXT;
  counter INTEGER;
BEGIN
  SELECT COUNT(*) + 1 INTO counter FROM public.orders;
  new_number := 'OW3D-' || LPAD(counter::TEXT, 5, '0');
  RETURN new_number;
END;
$$;

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_events ENABLE ROW LEVEL SECURITY;

-- Profiles RLS
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- User roles RLS
CREATE POLICY "Users can view own roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can manage roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Orders RLS
CREATE POLICY "Users can view own orders" ON public.orders
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert orders" ON public.orders
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can do everything with orders" ON public.orders
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Order files RLS
CREATE POLICY "Users can view own order files" ON public.order_files
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders WHERE orders.id = order_files.order_id AND orders.user_id = auth.uid()));

CREATE POLICY "Users can insert order files" ON public.order_files
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.orders WHERE orders.id = order_files.order_id AND orders.user_id = auth.uid()));

CREATE POLICY "Admins can do everything with order files" ON public.order_files
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Order events RLS
CREATE POLICY "Users can view visible events" ON public.order_events
  FOR SELECT TO authenticated
  USING (
    visible_to_customer = true AND
    EXISTS (SELECT 1 FROM public.orders WHERE orders.id = order_events.order_id AND orders.user_id = auth.uid())
  );

CREATE POLICY "Admins can do everything with events" ON public.order_events
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Storage bucket for order files
INSERT INTO storage.buckets (id, name, public) VALUES ('orders', 'orders', false);

-- Storage RLS policies
CREATE POLICY "Authenticated users can upload order files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'orders');

CREATE POLICY "Authenticated users can view order files" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'orders');

CREATE POLICY "Admins can manage all storage" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'orders' AND public.has_role(auth.uid(), 'admin'));
