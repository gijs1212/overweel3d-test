alter table public.printer_sd_files
  add column if not exists detected_filaments jsonb not null default '[]'::jsonb;

alter table public.printer_sd_files
  drop constraint if exists printer_sd_files_detected_filaments_array;

alter table public.printer_sd_files
  add constraint printer_sd_files_detected_filaments_array
  check (jsonb_typeof(detected_filaments) = 'array' and jsonb_array_length(detected_filaments) <= 32);
