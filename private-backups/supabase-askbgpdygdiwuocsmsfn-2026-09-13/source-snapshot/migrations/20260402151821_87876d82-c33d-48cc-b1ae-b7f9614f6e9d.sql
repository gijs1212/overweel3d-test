
-- 1. Order Messages (Chat)
CREATE TABLE public.order_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('customer', 'admin')),
  sender_id UUID REFERENCES auth.users(id),
  message TEXT NOT NULL,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.order_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all messages"
ON public.order_messages
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Customers can view messages on their orders"
ON public.order_messages
FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.orders
  WHERE orders.id = order_messages.order_id
  AND orders.user_id = auth.uid()
));

CREATE POLICY "Customers can send messages on their orders"
ON public.order_messages
FOR INSERT
TO authenticated
WITH CHECK (
  sender_type = 'customer'
  AND sender_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.orders
    WHERE orders.id = order_messages.order_id
    AND orders.user_id = auth.uid()
  )
);

CREATE INDEX idx_order_messages_order ON public.order_messages(order_id, created_at);

-- 2. Plate tracking columns on orders
ALTER TABLE public.orders
ADD COLUMN parts_total INTEGER DEFAULT 0,
ADD COLUMN parts_per_plate INTEGER DEFAULT 1,
ADD COLUMN plates_completed INTEGER DEFAULT 0;

-- 3. Delivery Appointments
CREATE TABLE public.delivery_appointments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  proposed_date DATE NOT NULL,
  proposed_time_slot TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled')),
  proposed_by TEXT NOT NULL CHECK (proposed_by IN ('customer', 'admin')),
  customer_notes TEXT DEFAULT '',
  admin_notes TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.delivery_appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all appointments"
ON public.delivery_appointments
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Customers can view their order appointments"
ON public.delivery_appointments
FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.orders
  WHERE orders.id = delivery_appointments.order_id
  AND orders.user_id = auth.uid()
));

CREATE POLICY "Customers can propose appointments"
ON public.delivery_appointments
FOR INSERT
TO authenticated
WITH CHECK (
  proposed_by = 'customer'
  AND EXISTS (
    SELECT 1 FROM public.orders
    WHERE orders.id = delivery_appointments.order_id
    AND orders.user_id = auth.uid()
  )
);

CREATE POLICY "Customers can update their pending appointments"
ON public.delivery_appointments
FOR UPDATE
TO authenticated
USING (
  proposed_by = 'customer'
  AND status = 'pending'
  AND EXISTS (
    SELECT 1 FROM public.orders
    WHERE orders.id = delivery_appointments.order_id
    AND orders.user_id = auth.uid()
  )
);

CREATE TRIGGER update_delivery_appointments_updated_at
BEFORE UPDATE ON public.delivery_appointments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX idx_delivery_appointments_order ON public.delivery_appointments(order_id);

-- 4. Add delivery_email field to orders for admin-created orders
ALTER TABLE public.orders
ADD COLUMN delivery_email TEXT DEFAULT '';
