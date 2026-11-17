-- Replace the selectable palette with the 19 visible filament rolls from the
-- supplied inventory screenshot. The collapsed ABS group is intentionally not
-- included because its individual colors are not visible in the source.
BEGIN;

DELETE FROM public.product_color_availability;
DELETE FROM public.filament_colors;

INSERT INTO public.filament_colors (
  name,
  material,
  hex,
  description,
  sort_order,
  active
)
VALUES
  ('Zwart (710 g)', 'PLA', '#000000', 'Bambu Lab PLA Basic · 1,75 mm · artikelcode 10101 · 710 g resterend van 1000 g', 10, true),
  ('Jadewit (60 g)', 'PLA', '#FFFFFF', 'Bambu Lab PLA Basic · 1,75 mm · artikelcode 10100 · 60 g resterend van 1000 g', 20, true),
  ('Blauw (500 g)', 'PLA', '#0A2989', 'Bambu Lab PLA Basic · 1,75 mm · artikelcode 10601 · 500 g resterend van 1000 g', 30, true),
  ('Zonnebloemgeel', 'PLA', '#FEC600', 'Bambu Lab PLA Basic · 1,75 mm · artikelcode 10402 · 320 g resterend van 1000 g', 40, true),
  ('Bamboegroen', 'PLA', '#00AE42', 'Bambu Lab PLA Basic · 1,75 mm · artikelcode 10501 · 10 g resterend van 250 g', 50, true),
  ('Blauwgrijs', 'PLA', '#5B6579', 'Bambu Lab PLA Basic · 1,75 mm · artikelcode 10602 · 540 g resterend van 1000 g', 60, true),
  ('Blauw (AMS A2)', 'PLA', '#0A2989', 'Bambu Lab PLA Basic · 1,75 mm · artikelcode 10601 · printer Gijs · AMS A2 · 200 g resterend van 1000 g', 70, true),
  ('Zwart (880 g)', 'PLA', '#000000', 'Bambu Lab PLA Basic · 1,75 mm · artikelcode 10101 · 880 g resterend van 1000 g', 80, true),
  ('Pompoenoranje', 'PLA', '#FF9016', 'Bambu Lab PLA Basic · 1,75 mm · artikelcode 10301 · 970 g resterend van 1000 g', 90, true),
  ('Jadewit (AMS A3)', 'PLA', '#FFFFFF', 'Bambu Lab PLA Basic · 1,75 mm · artikelcode 10100 · printer Gijs · AMS A3 · 820 g resterend van 1000 g', 100, true),
  ('Zwart TPU', 'TPU', '#161616', 'Generic TPU · 1,75 mm · 500 g voorraad volgens aangeleverde lijst', 110, true),
  ('Reflex Blue', 'PETG', '#001A89', 'Bambu Lab PETG Basic · 1,75 mm · artikelcode 30603 · 1000 g resterend van 1000 g', 120, true),
  ('Groen', 'PLA', '#057F4B', 'Generic PLA · 1,75 mm · voorraadrol uit aangeleverde lijst', 130, true),
  ('Roze (AMS A1)', 'PLA', '#F95073', 'Generic PLA · 1,75 mm · printer Gijs · AMS A1 · voorraadrol uit aangeleverde lijst', 140, true),
  ('Ice Blue (Translucent)', 'PLA', '#B8CDE9', 'Bambu Lab PLA Translucent · 1,75 mm · artikelcode 13610 · 870 g resterend van 1000 g', 150, true),
  ('Zwart PETG (rol 1)', 'PETG', '#161616', 'Generic PETG · 1,75 mm · eerste zwarte voorraadrol uit aangeleverde lijst', 160, true),
  ('Zwart PETG (rol 2)', 'PETG', '#161616', 'Generic PETG · 1,75 mm · tweede zwarte voorraadrol uit aangeleverde lijst', 170, true),
  ('Rood PETG', 'PETG', '#F72323', 'Generic PETG · 1,75 mm · voorraadrol uit aangeleverde lijst', 180, true),
  ('Jadewit PETG', 'PETG', '#FFFFFF', 'Generic PETG · 1,75 mm · artikelcode 10100 · voorraadrol uit aangeleverde lijst', 190, true);

-- Every catalog product (currently the object "roos") receives the replacement
-- palette. Availability can still be changed per color from the admin screen.
INSERT INTO public.product_color_availability (product_id, color_id, available)
SELECT product.id, color.id, true
FROM public.products AS product
CROSS JOIN public.filament_colors AS color;

UPDATE public.products AS product
SET
  colors = palette.color_ids,
  materials = CASE
    WHEN lower(product.name) = 'roos'
      THEN ARRAY(SELECT DISTINCT material FROM unnest(product.materials || ARRAY['tpu']) AS material)
    ELSE product.materials
  END,
  updated_at = now()
FROM (
  SELECT array_agg(id::text ORDER BY sort_order, name) AS color_ids
  FROM public.filament_colors
) AS palette;

COMMIT;
