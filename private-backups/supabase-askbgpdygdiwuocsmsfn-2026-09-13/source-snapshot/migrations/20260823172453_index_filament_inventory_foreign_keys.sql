create index filament_inventory_filament_color_idx
  on public.filament_inventory (filament_color_id)
  where filament_color_id is not null;

create index filament_inventory_source_printer_idx
  on public.filament_inventory (source_printer_id)
  where source_printer_id is not null;
