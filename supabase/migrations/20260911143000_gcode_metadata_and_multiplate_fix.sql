alter table public.printer_sd_files add column if not exists metadata_requested_plate_number integer;
alter table public.printer_sd_files drop constraint if exists printer_sd_files_metadata_requested_plate_number_check;
alter table public.printer_sd_files add constraint printer_sd_files_metadata_requested_plate_number_check
  check (metadata_requested_plate_number is null or metadata_requested_plate_number > 0);

drop function if exists public.request_printer_file_metadata(uuid);
create function public.request_printer_file_metadata(p_file_id uuid, p_plate_number integer default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare next_id bigint;
begin
  if not public.has_role((select auth.uid()), 'admin') then raise exception 'Alleen admins kunnen bestandsmetadata opvragen'; end if;
  if p_plate_number is not null and p_plate_number < 1 then raise exception 'Ongeldig plaatnummer'; end if;
  update public.printer_sd_files
  set metadata_request_id = metadata_request_id + 1, metadata_requested_plate_number = p_plate_number, metadata_last_error = null
  where id = p_file_id returning metadata_request_id into next_id;
  if next_id is null then raise exception 'Printbestand niet gevonden'; end if;
  return next_id;
end;
$$;
revoke all on function public.request_printer_file_metadata(uuid, integer) from public, anon;
grant execute on function public.request_printer_file_metadata(uuid, integer) to authenticated;
notify pgrst, 'reload schema';
