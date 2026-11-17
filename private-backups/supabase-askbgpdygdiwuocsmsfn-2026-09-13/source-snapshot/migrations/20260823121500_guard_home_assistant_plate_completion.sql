-- Never let a manual integration action count more runs than requested.
alter table public.print_jobs
  add constraint print_jobs_runs_within_required
  check (runs_completed <= runs_required);
