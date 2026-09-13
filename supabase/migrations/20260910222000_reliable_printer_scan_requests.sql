alter table public.printers
  add column if not exists ftps_scan_request_id bigint not null default 0,
  add column if not exists ftps_folder_scan_request_id bigint not null default 0,
  add column if not exists ftps_scan_completed_request_id bigint not null default 0,
  add column if not exists ftps_folder_scan_completed_request_id bigint not null default 0;

create or replace function public.request_printer_ftps_scan(
  p_printer_id uuid,
  p_kind text,
  p_scan_paths jsonb default null
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  next_id bigint;
begin
  if not public.has_role((select auth.uid()), 'admin') then
    raise exception 'Alleen admins kunnen een printerscan starten';
  end if;
  if p_kind = 'files' then
    if jsonb_typeof(p_scan_paths) <> 'array' or jsonb_array_length(p_scan_paths) not between 1 and 25 then
      raise exception 'Kies minimaal één en maximaal 25 scanmappen';
    end if;
    update public.printers set
      ftps_scan_paths = p_scan_paths,
      ftps_scan_requested_at = clock_timestamp(),
      ftps_scan_request_id = ftps_scan_request_id + 1
    where id = p_printer_id
    returning ftps_scan_request_id into next_id;
  elsif p_kind = 'folders' then
    update public.printers set
      ftps_folder_scan_requested_at = clock_timestamp(),
      ftps_folder_scan_request_id = ftps_folder_scan_request_id + 1
    where id = p_printer_id
    returning ftps_folder_scan_request_id into next_id;
  else
    raise exception 'Onbekend scantype';
  end if;
  if next_id is null then raise exception 'Printer niet gevonden'; end if;
  return next_id;
end;
$$;

revoke all on function public.request_printer_ftps_scan(uuid, text, jsonb) from public, anon;
grant execute on function public.request_printer_ftps_scan(uuid, text, jsonb) to authenticated;
notify pgrst, 'reload schema';
