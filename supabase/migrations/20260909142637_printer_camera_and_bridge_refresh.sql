-- A bridge keeps a separate recovery credential so it can replace an expired
-- status token without exposing either credential to the browser after setup.
alter table public.printers
  add column if not exists bridge_refresh_token_hash text,
  add column if not exists bridge_token_refreshed_at timestamptz,
  add column if not exists camera_status text not null default 'unavailable',
  add column if not exists camera_last_seen_at timestamptz,
  add column if not exists plate_check_status text not null default 'unknown';

alter table public.printers drop constraint if exists printers_bridge_refresh_token_hash_check;
alter table public.printers add constraint printers_bridge_refresh_token_hash_check
  check (bridge_refresh_token_hash is null or bridge_refresh_token_hash ~ '^[0-9a-f]{64}$');
alter table public.printers drop constraint if exists printers_camera_status_check;
alter table public.printers add constraint printers_camera_status_check
  check (camera_status in ('available', 'unavailable', 'error'));
alter table public.printers drop constraint if exists printers_plate_check_status_check;
alter table public.printers add constraint printers_plate_check_status_check
  check (plate_check_status in ('correct', 'attention', 'unknown'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('printer-camera', 'printer-camera', false, 5242880, array['image/jpeg', 'image/png'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Admins view printer camera" on storage.objects;
create policy "Admins view printer camera"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'printer-camera'
    and public.has_role((select auth.uid()), 'admin')
  );

notify pgrst, 'reload schema';
