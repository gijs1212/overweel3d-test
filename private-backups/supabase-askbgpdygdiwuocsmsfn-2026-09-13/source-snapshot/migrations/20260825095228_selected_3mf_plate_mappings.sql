alter table public.order_files
  add column if not exists customer_visible boolean not null default true,
  add column if not exists file_purpose text not null default 'order_attachment';

alter table public.order_files drop constraint if exists order_files_file_purpose_check;
alter table public.order_files add constraint order_files_file_purpose_check
  check (file_purpose in ('order_attachment','customer_upload','production_3mf','plate_preview'));

create table if not exists public.order_3mf_plate_mappings (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  order_file_id uuid not null references public.order_files(id) on delete cascade,
  source_plate_number integer not null check (source_plate_number > 0),
  logical_plate_number integer check (logical_plate_number is null or logical_plate_number > 0),
  source_file_name text not null default '',
  preview_storage_path text,
  colors jsonb not null default '[]'::jsonb check (jsonb_typeof(colors) = 'array'),
  runs_required integer not null default 1 check (runs_required > 0),
  runs_completed integer not null default 0 check (runs_completed >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(order_file_id, source_plate_number)
);

create unique index if not exists order_3mf_active_logical_plate_idx
  on public.order_3mf_plate_mappings(order_id, logical_plate_number)
  where active and logical_plate_number is not null;
create index if not exists order_3mf_source_match_idx
  on public.order_3mf_plate_mappings(order_id, order_file_id, source_plate_number)
  where active;

alter table public.order_3mf_plate_mappings enable row level security;
drop policy if exists "Admins manage 3MF plate mappings" on public.order_3mf_plate_mappings;
create policy "Admins manage 3MF plate mappings"
  on public.order_3mf_plate_mappings for all to authenticated
  using (public.has_role((select auth.uid()), 'admin'))
  with check (public.has_role((select auth.uid()), 'admin'));
grant select, insert, update, delete on public.order_3mf_plate_mappings to authenticated;

-- The order-level progress arrays are the customer-facing production status.
-- Raw jobs contain source filenames and original Bambu plate numbers and are
-- therefore admin-only.
drop policy if exists "Customers view own print jobs" on public.print_jobs;

drop trigger if exists update_order_3mf_plate_mappings_updated_at on public.order_3mf_plate_mappings;
create trigger update_order_3mf_plate_mappings_updated_at
before update on public.order_3mf_plate_mappings
for each row execute function public.update_updated_at();

alter table public.print_jobs
  add column if not exists plate_mapping_id uuid references public.order_3mf_plate_mappings(id) on delete set null,
  add column if not exists source_plate_number integer check (source_plate_number is null or source_plate_number > 0),
  add column if not exists active boolean not null default true;

alter table public.print_jobs drop constraint if exists print_jobs_order_id_plate_number_key;
drop index if exists print_jobs_order_id_plate_number_key;
create unique index if not exists print_jobs_active_order_plate_idx
  on public.print_jobs(order_id, plate_number)
  where active;
create unique index if not exists print_jobs_mapping_idx
  on public.print_jobs(plate_mapping_id)
  where plate_mapping_id is not null;
create index if not exists print_jobs_active_source_plate_idx
  on public.print_jobs(source_order_file_id, source_plate_number)
  where active;

create or replace function public.sync_print_job_plate_mapping_progress()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.plate_mapping_id is not null then
    update public.order_3mf_plate_mappings
    set runs_required = greatest(new.runs_required, new.runs_completed, 1),
        runs_completed = greatest(new.runs_completed, 0)
    where id = new.plate_mapping_id;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_print_job_plate_mapping_progress on public.print_jobs;
create trigger sync_print_job_plate_mapping_progress
after insert or update of runs_required, runs_completed on public.print_jobs
for each row execute function public.sync_print_job_plate_mapping_progress();

-- Existing production 3MF files become admin-only. Ordinary customer/admin
-- attachments retain their current customer visibility.
update public.order_files file
set customer_visible = false, file_purpose = 'production_3mf'
where file.storage_path like '%/production/%'
   or exists (select 1 from public.print_jobs job where job.source_order_file_id = file.id);

insert into public.order_3mf_plate_mappings (
  order_id, order_file_id, source_plate_number, logical_plate_number,
  source_file_name, colors, runs_required, runs_completed, active
)
select
  job.order_id,
  job.source_order_file_id,
  job.plate_number,
  job.plate_number,
  coalesce(nullif(job.expected_file_name, ''), file.original_filename),
  coalesce(job.colors, '[]'::jsonb),
  greatest(job.runs_required, 1),
  greatest(job.runs_completed, 0),
  job.active
from public.print_jobs job
join public.order_files file on file.id = job.source_order_file_id
where job.source_order_file_id is not null
on conflict (order_file_id, source_plate_number) do update
set runs_required = greatest(order_3mf_plate_mappings.runs_required, excluded.runs_required),
    runs_completed = greatest(order_3mf_plate_mappings.runs_completed, excluded.runs_completed);

update public.print_jobs job
set plate_mapping_id = mapping.id,
    source_plate_number = mapping.source_plate_number
from public.order_3mf_plate_mappings mapping
where mapping.order_id = job.order_id
  and mapping.order_file_id = job.source_order_file_id
  and mapping.logical_plate_number = job.plate_number;

drop policy if exists "Users can view own order files" on public.order_files;
create policy "Users can view own visible order files" on public.order_files
  for select to authenticated
  using (
    customer_visible
    and exists (
      select 1 from public.orders
      where orders.id = order_files.order_id
        and orders.user_id = (select auth.uid())
    )
  );

drop policy if exists "Authenticated users can view order files" on storage.objects;
create policy "Authenticated users view permitted order storage" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'orders'
    and (
      public.has_role((select auth.uid()), 'admin')
      or exists (
        select 1
        from public.order_files file
        join public.orders ordered on ordered.id = file.order_id
        where file.storage_path = storage.objects.name
          and file.customer_visible
          and ordered.user_id = (select auth.uid())
      )
      or exists (
        select 1
        from public.order_3mf_plate_mappings mapping
        join public.orders ordered on ordered.id = mapping.order_id
        where mapping.preview_storage_path = storage.objects.name
          and mapping.active
          and ordered.user_id = (select auth.uid())
      )
    )
  );

create or replace function public.save_order_3mf_plate_selection(
  p_order_id uuid,
  p_mappings jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_item jsonb;
  v_mapping public.order_3mf_plate_mappings%rowtype;
  v_order_file public.order_files%rowtype;
  v_logical integer := 0;
  v_statuses jsonb := '[]'::jsonb;
  v_runs jsonb := '[]'::jsonb;
  v_required jsonb := '[]'::jsonb;
  v_completed_plates integer := 0;
begin
  if (select auth.uid()) is null
     or not public.has_role((select auth.uid()), 'admin'::public.app_role) then
    raise exception 'Alleen een admin kan 3MF-platen selecteren' using errcode = '42501';
  end if;
  if jsonb_typeof(p_mappings) <> 'array' or jsonb_array_length(p_mappings) < 1 then
    raise exception 'Selecteer minimaal één plaat' using errcode = '22023';
  end if;
  if (
    select count(*) <> count(distinct ((value->>'orderFileId') || ':' || (value->>'sourcePlateNumber')))
    from jsonb_array_elements(p_mappings)
  ) then
    raise exception 'Dezelfde bronplaat is meer dan één keer geselecteerd' using errcode = '22023';
  end if;
  perform 1 from public.orders where id = p_order_id for update;
  if not found then raise exception 'Bestelling niet gevonden'; end if;

  -- Preserve counters from jobs before rebuilding the active logical order.
  update public.order_3mf_plate_mappings mapping
  set runs_required = greatest(mapping.runs_required, job.runs_required),
      runs_completed = greatest(mapping.runs_completed, job.runs_completed)
  from public.print_jobs job
  where mapping.id = job.plate_mapping_id and mapping.order_id = p_order_id;

  update public.order_3mf_plate_mappings
  set active = false, logical_plate_number = null
  where order_id = p_order_id;
  update public.print_jobs set active = false where order_id = p_order_id;
  with ranked as (
    select id, row_number() over (order by created_at, id) as position
    from public.print_jobs
    where order_id = p_order_id
  )
  update public.print_jobs job
  set plate_number = 1000000 + ranked.position
  from ranked
  where ranked.id = job.id;

  for v_item in select value from jsonb_array_elements(p_mappings)
  loop
    v_logical := v_logical + 1;
    if coalesce((v_item->>'sourcePlateNumber')::integer, 0) < 1 then
      raise exception 'Ongeldig bronplaatnummer' using errcode = '22023';
    end if;
    select * into v_order_file
    from public.order_files
    where id = (v_item->>'orderFileId')::uuid and order_id = p_order_id;
    if not found then raise exception '3MF-bestand hoort niet bij deze bestelling'; end if;

    insert into public.order_3mf_plate_mappings (
      order_id, order_file_id, source_plate_number, logical_plate_number,
      source_file_name, preview_storage_path, colors, runs_required, active
    ) values (
      p_order_id,
      v_order_file.id,
      (v_item->>'sourcePlateNumber')::integer,
      v_logical,
      coalesce(nullif(v_item->>'sourceFileName', ''), v_order_file.original_filename),
      nullif(v_item->>'previewStoragePath', ''),
      case when jsonb_typeof(v_item->'colors') = 'array' then v_item->'colors' else '[]'::jsonb end,
      greatest(coalesce((v_item->>'runsRequired')::integer, 1), 1),
      true
    )
    on conflict (order_file_id, source_plate_number) do update
    set logical_plate_number = excluded.logical_plate_number,
        source_file_name = excluded.source_file_name,
        preview_storage_path = coalesce(excluded.preview_storage_path, order_3mf_plate_mappings.preview_storage_path),
        colors = excluded.colors,
        runs_required = greatest(excluded.runs_required, order_3mf_plate_mappings.runs_required, order_3mf_plate_mappings.runs_completed, 1),
        active = true
    returning * into v_mapping;

    update public.order_files
    set customer_visible = false, file_purpose = 'production_3mf'
    where id = v_mapping.order_file_id;

    insert into public.print_jobs (
      order_id, plate_mapping_id, source_order_file_id, source_plate_number,
      plate_number, plate_name, expected_file_name, three_mf_storage_path,
      runs_required, runs_completed, colors, status, active
    ) values (
      p_order_id, v_mapping.id, v_mapping.order_file_id, v_mapping.source_plate_number,
      v_logical, 'Plaat ' || v_logical,
      v_order_file.original_filename, v_order_file.storage_path,
      v_mapping.runs_required, v_mapping.runs_completed, v_mapping.colors,
      case when v_mapping.runs_completed >= v_mapping.runs_required then 'completed' else 'queued' end,
      true
    )
    on conflict (plate_mapping_id) where plate_mapping_id is not null do update
    set plate_number = excluded.plate_number,
        plate_name = excluded.plate_name,
        source_order_file_id = excluded.source_order_file_id,
        source_plate_number = excluded.source_plate_number,
        expected_file_name = excluded.expected_file_name,
        three_mf_storage_path = excluded.three_mf_storage_path,
        runs_required = excluded.runs_required,
        runs_completed = excluded.runs_completed,
        colors = excluded.colors,
        status = excluded.status,
        printer_id = null,
        suggested_at = null,
        approved_at = null,
        approved_by = null,
        active = true;

    v_statuses := v_statuses || to_jsonb(v_mapping.runs_completed >= v_mapping.runs_required);
    v_runs := v_runs || to_jsonb(v_mapping.runs_completed);
    v_required := v_required || to_jsonb(v_mapping.runs_required);
    if v_mapping.runs_completed >= v_mapping.runs_required then
      v_completed_plates := v_completed_plates + 1;
    end if;
  end loop;

  update public.orders
  set total_plates = v_logical,
      plate_print_statuses = v_statuses,
      plate_runs_completed = v_runs,
      plate_runs_required_per_plate = v_required,
      plates_completed = v_completed_plates
  where id = p_order_id;

  return jsonb_build_object(
    'saved', true,
    'totalPlates', v_logical,
    'platePrintStatuses', v_statuses,
    'plateRunsCompleted', v_runs,
    'plateRunsRequired', v_required,
    'platesCompleted', v_completed_plates,
    'mappings', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', mapping.id,
        'orderFileId', mapping.order_file_id,
        'sourcePlateNumber', mapping.source_plate_number,
        'logicalPlateNumber', mapping.logical_plate_number,
        'sourceFileName', mapping.source_file_name,
        'previewStoragePath', mapping.preview_storage_path,
        'colors', mapping.colors,
        'runsRequired', mapping.runs_required,
        'runsCompleted', mapping.runs_completed
      ) order by mapping.logical_plate_number), '[]'::jsonb)
      from public.order_3mf_plate_mappings mapping
      where mapping.order_id = p_order_id and mapping.active
    )
  );
end;
$$;

revoke all on function public.save_order_3mf_plate_selection(uuid, jsonb) from public, anon;
grant execute on function public.save_order_3mf_plate_selection(uuid, jsonb) to authenticated;
