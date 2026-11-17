-- Bambu Lab filament palette transcribed from the supplied inventory screenshot.
-- Physical duplicate spools are represented by one catalogue color; remaining
-- spool weight is deliberately not stored because filament_colors is a palette,
-- not a spool-inventory table.
INSERT INTO public.filament_colors (
  name,
  material,
  hex,
  description,
  sort_order,
  active
)
SELECT
  seed.name,
  seed.material,
  seed.hex,
  seed.description,
  seed.sort_order,
  true
FROM (VALUES
  ('Zwart', 'PLA', '#000000', 'Bambu Lab PLA Basic · 1,75 mm · artikelcode 10101', 10),
  ('Jadewit', 'PLA', '#FFFFFF', 'Bambu Lab PLA Basic · 1,75 mm · artikelcode 10100', 20),
  ('Blauw', 'PLA', '#0A2989', 'Bambu Lab PLA Basic · 1,75 mm · artikelcode 10601', 30),
  ('Zonnebloemgeel', 'PLA', '#FEC600', 'Bambu Lab PLA Basic · 1,75 mm · artikelcode 10402', 40),
  ('Bamboegroen', 'PLA', '#00AE42', 'Bambu Lab PLA Basic · 1,75 mm · artikelcode 10501', 50),
  ('Blauwgrijs', 'PLA', '#5B6579', 'Bambu Lab PLA Basic · 1,75 mm · artikelcode 10602', 60),
  ('Pompoenoranje', 'PLA', '#FF9016', 'Bambu Lab PLA Basic · 1,75 mm · artikelcode 10301', 70),
  ('Ice Blue (Translucent)', 'PLA', '#B8CDE9', 'Bambu Lab PLA Translucent · 1,75 mm · artikelcode 13610', 80),
  ('Reflex Blue', 'PETG', '#001A89', 'Bambu Lab PETG Basic · 1,75 mm · artikelcode 30603', 10)
) AS seed(name, material, hex, description, sort_order)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.filament_colors existing
  WHERE lower(existing.name) = lower(seed.name)
    AND lower(existing.material) = lower(seed.material)
);

-- Make the new colors available for existing products that support the same
-- material. IDs are resolved from the rows themselves, so this is replay-safe.
INSERT INTO public.product_color_availability (product_id, color_id, available)
SELECT product.id, color.id, true
FROM public.products product
JOIN public.filament_colors color ON EXISTS (
  SELECT 1
  FROM unnest(COALESCE(product.materials, '{}'::text[])) product_material
  WHERE lower(product_material) = lower(color.material)
)
WHERE color.active
  AND color.name IN (
    'Zwart', 'Jadewit', 'Blauw', 'Zonnebloemgeel', 'Bamboegroen',
    'Blauwgrijs', 'Pompoenoranje', 'Ice Blue (Translucent)', 'Reflex Blue'
  )
ON CONFLICT (product_id, color_id)
DO UPDATE SET available = true;
