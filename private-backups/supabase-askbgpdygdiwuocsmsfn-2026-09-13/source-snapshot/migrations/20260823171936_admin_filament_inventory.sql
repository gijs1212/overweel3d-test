create table public.filament_inventory (
  filament_color_id uuid primary key references public.filament_colors(id) on delete cascade,
  total_weight_grams numeric not null default 0 check (total_weight_grams >= 0),
  spool_capacity_grams numeric not null default 1000 check (spool_capacity_grams > 0),
  remaining_percent numeric check (remaining_percent is null or remaining_percent between 0 and 100),
  source_printer_id uuid references public.printers(id) on delete set null,
  source_ams_unit integer,
  source_slot_number integer,
  tray_uuid text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.filament_inventory is
  'Admin-only live filament weight. Bambu AMS observations update weight but never color availability.';
comment on column public.filament_inventory.total_weight_grams is
  'Latest calculated weight of the roll currently observed for this color. A replacement roll resets this value.';

alter table public.filament_inventory enable row level security;

grant select on public.filament_inventory to authenticated;
grant all on public.filament_inventory to service_role;

create policy "Admins view filament inventory"
on public.filament_inventory
for select
to authenticated
using (public.has_role((select auth.uid()), 'admin'));

create trigger trg_filament_inventory_updated_at
before update on public.filament_inventory
for each row execute function public.touch_updated_at();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'filament_inventory'
     ) then
    alter publication supabase_realtime add table public.filament_inventory;
  end if;
end $$;

insert into public.app_settings (key, value, description)
values (
  'auto_pricing_test_config',
  '{
    "filament_price_per_kg": {"PLA": 24, "PETG": 27, "TPU": 35},
    "margin_percent": 30,
    "machine_hourly_rate": 1.5,
    "energy_watts": 120,
    "electricity_per_kwh": 0.4,
    "labor_hourly_rate": 25,
    "fixed_cost": 0.5,
    "failure_buffer_percent": 10,
    "vat_percent": 21,
    "slicer": {"layer_height_mm": 0.2, "infill_percent": 20, "wall_loops": 3, "supports_enabled": false}
  }'::jsonb,
  'Afgeschermde testinstellingen voor de automatische prijsberekening in het admin dashboard.'
)
on conflict (key) do nothing;

-- Seed the current AMS observations when their material and color code match a
-- palette entry exactly. The ingest function also supports close color matches.
insert into public.filament_inventory (
  filament_color_id,
  total_weight_grams,
  spool_capacity_grams,
  remaining_percent,
  source_printer_id,
  source_ams_unit,
  source_slot_number,
  tray_uuid,
  last_seen_at
)
select distinct on (color.id)
  color.id,
  coalesce(slot.remaining_grams, slot.spool_capacity_grams * slot.remaining_percent / 100, 0),
  slot.spool_capacity_grams,
  slot.remaining_percent,
  slot.printer_id,
  slot.ams_unit,
  slot.slot_number,
  slot.tray_uuid,
  slot.updated_at
from public.printer_ams_slots slot
join public.filament_colors color
  on upper(color.material) = upper(slot.material)
 and upper(color.hex) = upper(slot.color_hex)
where slot.remaining_grams is not null or slot.remaining_percent is not null
order by color.id, slot.updated_at desc
on conflict (filament_color_id) do update set
  total_weight_grams = excluded.total_weight_grams,
  spool_capacity_grams = excluded.spool_capacity_grams,
  remaining_percent = excluded.remaining_percent,
  source_printer_id = excluded.source_printer_id,
  source_ams_unit = excluded.source_ams_unit,
  source_slot_number = excluded.source_slot_number,
  tray_uuid = excluded.tray_uuid,
  last_seen_at = excluded.last_seen_at;
