alter table public.printers
  add column if not exists print_start_request_id bigint not null default 0,
  add column if not exists print_start_completed_request_id bigint not null default 0;

create or replace function public.request_printer_queue_start(p_printer_id uuid)
returns bigint language plpgsql security definer set search_path = public as $$
declare next_id bigint;
begin
  if not public.has_role((select auth.uid()), 'admin') then
    raise exception 'Alleen admins kunnen een printerstart aanvragen';
  end if;
  if not exists (
    select 1 from public.printer_queue_items
    where printer_id = p_printer_id and status in ('queued', 'blocked')
  ) then
    raise exception 'Er staat geen print klaar';
  end if;
  update public.printers
  set print_start_request_id = print_start_request_id + 1
  where id = p_printer_id
  returning print_start_request_id into next_id;
  if next_id is null then raise exception 'Printer niet gevonden'; end if;
  return next_id;
end;
$$;
revoke all on function public.request_printer_queue_start(uuid) from public, anon;
grant execute on function public.request_printer_queue_start(uuid) to authenticated;
notify pgrst, 'reload schema';
