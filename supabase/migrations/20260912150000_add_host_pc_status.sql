alter table public.printers
  add column if not exists host_pc_status text not null default 'unknown',
  add column if not exists host_pc_checked_at timestamptz,
  add column if not exists host_pc_uptime_seconds numeric;

alter table public.printers drop constraint if exists printers_host_pc_status_check;
alter table public.printers add constraint printers_host_pc_status_check
  check (host_pc_status in ('unknown', 'on', 'off'));

comment on column public.printers.host_pc_status is
  'Bereikbaarheid van de Windows-host bij de laatste handmatige printstartcontrole.';
