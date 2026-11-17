revoke all on function public.refresh_printer_queue_color_status() from public, anon, authenticated;
create index if not exists printer_queue_created_by_idx on public.printer_queue_items (created_by);
