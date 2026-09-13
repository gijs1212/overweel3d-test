alter table public.printer_sd_files
  add column if not exists metadata_request_id bigint not null default 0,
  add column if not exists metadata_completed_request_id bigint not null default 0,
  add column if not exists metadata_last_error text;

create or replace function public.request_printer_file_metadata(p_file_id uuid)
returns bigint language plpgsql security definer set search_path = public as $$
declare next_id bigint;
begin
  if not public.has_role((select auth.uid()), 'admin') then
    raise exception 'Alleen admins kunnen bestandsmetadata opvragen';
  end if;
  update public.printer_sd_files set metadata_request_id = metadata_request_id + 1, metadata_last_error = null
  where id = p_file_id returning metadata_request_id into next_id;
  if next_id is null then raise exception 'Printbestand niet gevonden'; end if;
  return next_id;
end;
$$;
revoke all on function public.request_printer_file_metadata(uuid) from public, anon;
grant execute on function public.request_printer_file_metadata(uuid) to authenticated;
notify pgrst, 'reload schema';
