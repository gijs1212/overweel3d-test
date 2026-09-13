alter table public.printer_queue_items
  drop constraint if exists printer_queue_items_calibration_enabled_check;

notify pgrst, 'reload schema';
