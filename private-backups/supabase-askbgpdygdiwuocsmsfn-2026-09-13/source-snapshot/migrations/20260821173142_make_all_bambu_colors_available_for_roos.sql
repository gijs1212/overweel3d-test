-- The roos can be ordered in every Bambu color supplied by the user,
-- including the PETG Reflex Blue option.
UPDATE public.products product
SET materials = CASE
  WHEN EXISTS (SELECT 1 FROM unnest(COALESCE(product.materials, '{}'::text[])) material WHERE lower(material) = 'petg')
    THEN product.materials
  ELSE array_append(COALESCE(product.materials, '{}'::text[]), 'petg')
END
WHERE lower(product.name) = 'roos';

INSERT INTO public.product_color_availability (product_id, color_id, available)
SELECT product.id, color.id, true
FROM public.products product
CROSS JOIN public.filament_colors color
WHERE lower(product.name) = 'roos'
  AND (
    (color.material = 'PLA' AND color.name IN (
      'Zwart', 'Jadewit', 'Blauw', 'Zonnebloemgeel', 'Bamboegroen',
      'Blauwgrijs', 'Pompoenoranje', 'Ice Blue (Translucent)'
    ))
    OR (color.material = 'PETG' AND color.name = 'Reflex Blue')
  )
ON CONFLICT (product_id, color_id)
DO UPDATE SET available = true;

UPDATE public.products product
SET colors = (
  SELECT array_agg(availability.color_id::text ORDER BY color.material, color.sort_order, color.name)
  FROM public.product_color_availability availability
  JOIN public.filament_colors color ON color.id = availability.color_id
  WHERE availability.product_id = product.id
    AND availability.available
)
WHERE lower(product.name) = 'roos';
