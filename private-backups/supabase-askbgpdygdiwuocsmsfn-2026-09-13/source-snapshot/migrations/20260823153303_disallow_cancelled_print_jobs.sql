-- A print plate is never cancelled independently from its order. Its public
-- state is derived from the counters: completed, or the number of runs left.
-- Preserve both counters while reactivating legacy cancelled plate rows.

update public.print_jobs
set
  status = case
    when runs_completed >= runs_required then 'completed'
    else 'queued'
  end,
  completed_at = case
    when runs_completed >= runs_required then coalesce(completed_at, now())
    else null
  end
where status = 'cancelled';

alter table public.print_jobs drop constraint if exists print_jobs_status_check;
alter table public.print_jobs add constraint print_jobs_status_check
  check (status in (
    'queued',
    'suggested',
    'approved',
    'printing',
    'paused',
    'awaiting_next_run',
    'completed',
    'mismatch'
  ));
