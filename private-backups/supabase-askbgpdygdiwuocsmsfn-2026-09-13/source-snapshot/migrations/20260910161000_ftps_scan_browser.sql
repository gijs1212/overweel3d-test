alter table public.printers
  add column if not exists ftps_scan_paths jsonb not null default '["/", "/cache"]'::jsonb,
  add column if not exists ftps_directory_listing jsonb not null default '[]'::jsonb,
  add column if not exists ftps_last_error text,
  add column if not exists ftps_scan_requested_at timestamptz;

alter table public.printers
  drop constraint if exists printers_ftps_scan_paths_check,
  add constraint printers_ftps_scan_paths_check check (
    jsonb_typeof(ftps_scan_paths) = 'array' and jsonb_array_length(ftps_scan_paths) between 1 and 25
  ),
  drop constraint if exists printers_ftps_directory_listing_check,
  add constraint printers_ftps_directory_listing_check check (
    jsonb_typeof(ftps_directory_listing) = 'array' and jsonb_array_length(ftps_directory_listing) <= 5000
  );

notify pgrst, 'reload schema';
