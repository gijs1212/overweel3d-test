alter table public.printer_sd_files
  add column if not exists detected_material text,
  add column if not exists detected_color_name text;

notify pgrst, 'reload schema';
