update public.app_settings
set
  value = jsonb_build_object(
    'filament_price_per_kg', coalesce(value -> 'filament_price_per_kg', '{"PLA":24,"PETG":27,"TPU":35}'::jsonb),
    'margin_percent', coalesce(value -> 'margin_percent', '30'::jsonb),
    'failure_buffer_percent', coalesce(value -> 'failure_buffer_percent', '10'::jsonb),
    'slicer', '{
      "layer_height_mm": 0.2,
      "nozzle_diameter_mm": 0.4,
      "line_width_mm": 0.42,
      "infill_percent": 20,
      "infill_pattern": "grid",
      "wall_loops": 3,
      "top_layers": 5,
      "bottom_layers": 4,
      "print_speed_mm_s": 150,
      "first_layer_speed_mm_s": 50,
      "supports_enabled": false,
      "support_density_percent": 15,
      "brim_width_mm": 0
    }'::jsonb || coalesce(value -> 'slicer', '{}'::jsonb)
  ),
  description = 'Afgeschermde admin-test: prijs op basis van filament, uitvalbuffer en marge; slicerinstellingen sturen alleen de modelschatting.',
  updated_at = now()
where key = 'auto_pricing_test_config';
