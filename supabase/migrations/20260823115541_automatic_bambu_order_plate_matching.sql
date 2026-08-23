-- Automatically propose an order/plate when a Bambu printer reports a file
-- that was parsed and uploaded from the order screen. Approval remains an
-- explicit admin action; only an approved run may change order counters.

alter table public.print_jobs
  add column if not exists source_order_file_id uuid references public.order_files(id) on delete set null,
  add column if not exists suggested_at timestamptz;

alter table public.print_jobs drop constraint if exists print_jobs_status_check;
alter table public.print_jobs add constraint print_jobs_status_check
  check (status in ('queued','suggested','approved','printing','paused','completed','mismatch','cancelled'));

create index if not exists print_jobs_unassigned_match_idx
  on public.print_jobs(status, plate_number, created_at)
  where printer_id is null and status = 'queued';

create index if not exists print_jobs_source_order_file_idx
  on public.print_jobs(source_order_file_id)
  where source_order_file_id is not null;

