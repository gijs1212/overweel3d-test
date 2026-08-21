-- Availability is catalogue information, not private data. Everyone may see
-- inactive colors on the palette page, while order forms explicitly request
-- active=true and all writes remain protected by the existing admin policy.
DROP POLICY IF EXISTS "Anyone can view active colors" ON public.filament_colors;
DROP POLICY IF EXISTS "Anyone can view colors" ON public.filament_colors;

CREATE POLICY "Anyone can view colors" ON public.filament_colors
  FOR SELECT
  TO anon, authenticated
  USING (true);
