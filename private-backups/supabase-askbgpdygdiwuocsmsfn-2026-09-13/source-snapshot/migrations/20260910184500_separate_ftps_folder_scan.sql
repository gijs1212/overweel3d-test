alter table public.printers
  add column if not exists ftps_folder_scan_requested_at timestamptz;

notify pgrst, 'reload schema';
