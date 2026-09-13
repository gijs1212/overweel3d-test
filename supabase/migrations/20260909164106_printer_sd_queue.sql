alter table public.printers
  add column if not exists sd_card_last_seen_at timestamptz,
  add column if not exists plate_state_changed_at timestamptz;

create table if not exists public.printer_sd_files (
  id uuid primary key default gen_random_uuid(),
  printer_id uuid not null references public.printers(id) on delete cascade,
  path text not null check (length(trim(path)) > 0),
  display_name text not null check (length(trim(display_name)) > 0),
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  modified_at timestamptz,
  plates jsonb not null default '[]'::jsonb check (jsonb_typeof(plates) = 'array'),
  available boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (printer_id, path)
);

create table if not exists public.printer_queue_items (
  id uuid primary key default gen_random_uuid(),
  printer_id uuid not null references public.printers(id) on delete cascade,
  sd_file_id uuid references public.printer_sd_files(id) on delete set null,
  sd_file_path text not null check (length(trim(sd_file_path)) > 0),
  file_name text not null check (length(trim(file_name)) > 0),
  plate_number integer not null check (plate_number > 0),
  position bigint not null,
  required_colors jsonb not null default '[]'::jsonb check (jsonb_typeof(required_colors) = 'array'),
  ams_mapping integer[] not null default '{}',
  status text not null default 'queued' check (status in ('queued','blocked','starting','printing','completed','failed','paused')),
  blocked_reason text,
  calibration_enabled boolean not null default false check (calibration_enabled = false),
  command_claimed_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  bridge_error text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists printer_sd_files_printer_available_idx
  on public.printer_sd_files (printer_id, display_name) where available;
create unique index if not exists printer_queue_position_active_idx
  on public.printer_queue_items (printer_id, position)
  where status in ('queued','blocked','paused');
create index if not exists printer_queue_ready_idx
  on public.printer_queue_items (printer_id, position, created_at)
  where status = 'queued';
create index if not exists printer_queue_sd_file_idx on public.printer_queue_items (sd_file_id);
create index if not exists printer_queue_created_by_idx on public.printer_queue_items (created_by);

drop trigger if exists touch_updated_at on public.printer_sd_files;
create trigger touch_updated_at before update on public.printer_sd_files
for each row execute function public.touch_updated_at();
drop trigger if exists touch_updated_at on public.printer_queue_items;
create trigger touch_updated_at before update on public.printer_queue_items
for each row execute function public.touch_updated_at();

alter table public.printer_sd_files enable row level security;
alter table public.printer_queue_items enable row level security;

drop policy if exists "Admins manage printer SD files" on public.printer_sd_files;
create policy "Admins manage printer SD files" on public.printer_sd_files for all to authenticated
using (public.has_role((select auth.uid()), 'admin'))
with check (public.has_role((select auth.uid()), 'admin'));
drop policy if exists "Admins manage printer queue" on public.printer_queue_items;
create policy "Admins manage printer queue" on public.printer_queue_items for all to authenticated
using (public.has_role((select auth.uid()), 'admin'))
with check (public.has_role((select auth.uid()), 'admin'));

grant select, insert, update, delete on public.printer_sd_files, public.printer_queue_items to authenticated;
grant all on public.printer_sd_files, public.printer_queue_items to service_role;

create or replace function public.printer_queue_colors_available(p_item public.printer_queue_items)
returns boolean
language sql stable security definer set search_path = public
as $$
  select not exists (
    select 1
    from jsonb_array_elements(coalesce(p_item.required_colors, '[]'::jsonb)) requirement
    where not exists (
      select 1
      from public.printer_ams_slots slot
      where slot.printer_id = p_item.printer_id
        and (
          nullif(requirement->>'ams_unit', '') is null
          or slot.ams_unit = (requirement->>'ams_unit')::integer
        )
        and (
          nullif(requirement->>'slot_number', '') is null
          or slot.slot_number = (requirement->>'slot_number')::integer
        )
        and (
          nullif(requirement->>'color_hex', '') is null
          or lower(left(coalesce(slot.color_hex, ''), 7)) = lower(left(requirement->>'color_hex', 7))
        )
        and (
          nullif(requirement->>'material', '') is null
          or lower(coalesce(slot.material, '')) = lower(requirement->>'material')
        )
    )
  );
$$;
revoke all on function public.printer_queue_colors_available(public.printer_queue_items) from public, anon, authenticated;
grant execute on function public.printer_queue_colors_available(public.printer_queue_items) to service_role;

create or replace function public.refresh_printer_queue_color_status()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare affected_printer uuid := coalesce(new.printer_id, old.printer_id);
begin
  update public.printer_queue_items item
  set status = case when public.printer_queue_colors_available(item) then 'queued' else 'blocked' end,
      blocked_reason = case when public.printer_queue_colors_available(item) then null else 'Vereist filament zit niet correct in de AMS.' end
  where item.printer_id = affected_printer and item.status in ('queued','blocked');
  return null;
end;
$$;

drop trigger if exists refresh_queue_after_ams_change on public.printer_ams_slots;
create trigger refresh_queue_after_ams_change
after insert or update or delete on public.printer_ams_slots
for each row execute function public.refresh_printer_queue_color_status();
revoke all on function public.refresh_printer_queue_color_status() from public, anon, authenticated;

create or replace function public.claim_next_printer_queue_item(p_printer_id uuid)
returns public.printer_queue_items
language plpgsql security definer set search_path = public
as $$
declare claimed public.printer_queue_items; resolved_mapping integer[];
begin
  if auth.role() <> 'service_role' then raise exception 'Niet toegestaan'; end if;

  update public.printer_queue_items item
  set status = case when public.printer_queue_colors_available(item) then 'queued' else 'blocked' end,
      blocked_reason = case when public.printer_queue_colors_available(item) then null else 'Vereist filament zit niet correct in de AMS.' end
  where item.printer_id = p_printer_id and item.status in ('queued','blocked');

  select * into claimed
  from public.printer_queue_items
  where printer_id = p_printer_id and status = 'queued'
  order by position, created_at
  for update skip locked
  limit 1;

  if claimed.id is null then return null; end if;
  select coalesce(array_agg(chosen.tray_index order by requirement.ordinality), '{}'::integer[])
  into resolved_mapping
  from jsonb_array_elements(coalesce(claimed.required_colors, '[]'::jsonb)) with ordinality requirement(value, ordinality)
  cross join lateral (
    select slot.ams_unit * 4 + slot.slot_number - 1 as tray_index
    from public.printer_ams_slots slot
    where slot.printer_id = claimed.printer_id
      and (nullif(requirement.value->>'ams_unit', '') is null or slot.ams_unit = (requirement.value->>'ams_unit')::integer)
      and (nullif(requirement.value->>'slot_number', '') is null or slot.slot_number = (requirement.value->>'slot_number')::integer)
      and (nullif(requirement.value->>'color_hex', '') is null or lower(left(coalesce(slot.color_hex, ''), 7)) = lower(left(requirement.value->>'color_hex', 7)))
      and (nullif(requirement.value->>'material', '') is null or lower(coalesce(slot.material, '')) = lower(requirement.value->>'material'))
    order by slot.ams_unit, slot.slot_number
    limit 1
  ) chosen;
  update public.printer_queue_items
  set status = 'starting', command_claimed_at = now(), bridge_error = null, ams_mapping = resolved_mapping
  where id = claimed.id
  returning * into claimed;
  return claimed;
end;
$$;
revoke all on function public.claim_next_printer_queue_item(uuid) from public, anon, authenticated;
grant execute on function public.claim_next_printer_queue_item(uuid) to service_role;

create or replace function public.reorder_printer_queue(p_printer_id uuid, p_item_ids uuid[])
returns void
language plpgsql security definer set search_path = public
as $$
declare item_id uuid; item_count integer; requested_count integer; ordinal integer := 0;
begin
  if not public.has_role((select auth.uid()), 'admin') then raise exception 'Niet toegestaan'; end if;
  select count(*) into item_count from public.printer_queue_items
    where printer_id = p_printer_id and status in ('queued','blocked','paused');
  select count(distinct value) into requested_count from unnest(p_item_ids) value;
  if item_count <> coalesce(array_length(p_item_ids, 1), 0) or requested_count <> item_count then
    raise exception 'De wachtrij is intussen gewijzigd. Vernieuw en probeer opnieuw.';
  end if;
  foreach item_id in array p_item_ids loop
    ordinal := ordinal + 1;
    update public.printer_queue_items set position = -ordinal where id = item_id and printer_id = p_printer_id and status in ('queued','blocked','paused');
    if not found then raise exception 'Ongeldig wachtrij-item'; end if;
  end loop;
  update public.printer_queue_items set position = -position * 1000
    where printer_id = p_printer_id and position < 0;
end;
$$;
revoke all on function public.reorder_printer_queue(uuid,uuid[]) from public, anon;
grant execute on function public.reorder_printer_queue(uuid,uuid[]) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'printer_queue_items') then
      alter publication supabase_realtime add table public.printer_queue_items;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'printer_sd_files') then
      alter publication supabase_realtime add table public.printer_sd_files;
    end if;
  end if;
end $$;

notify pgrst, 'reload schema';
