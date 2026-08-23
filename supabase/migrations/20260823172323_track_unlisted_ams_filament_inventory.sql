alter table public.filament_inventory
  add column id uuid default gen_random_uuid(),
  add column inventory_key text,
  add column material text,
  add column color_name text,
  add column color_hex text;

update public.filament_inventory inventory
set
  inventory_key = 'palette:' || color.id::text,
  material = color.material,
  color_name = color.name,
  color_hex = color.hex
from public.filament_colors color
where color.id = inventory.filament_color_id;

alter table public.filament_inventory drop constraint filament_inventory_pkey;
alter table public.filament_inventory alter column filament_color_id drop not null;
alter table public.filament_inventory alter column id set not null;
alter table public.filament_inventory alter column inventory_key set not null;
alter table public.filament_inventory add constraint filament_inventory_pkey primary key (id);
alter table public.filament_inventory add constraint filament_inventory_inventory_key_key unique (inventory_key);

comment on column public.filament_inventory.inventory_key is
  'Stable palette key when matched, otherwise normalized AMS material and hex. Replacement rolls overwrite this row.';

insert into public.filament_inventory (
  inventory_key,
  filament_color_id,
  material,
  color_name,
  color_hex,
  total_weight_grams,
  spool_capacity_grams,
  remaining_percent,
  source_printer_id,
  source_ams_unit,
  source_slot_number,
  tray_uuid,
  last_seen_at
)
select distinct on (coalesce('palette:' || color.id::text, 'ams:' || upper(slot.material) || ':' || upper(slot.color_hex)))
  coalesce('palette:' || color.id::text, 'ams:' || upper(slot.material) || ':' || upper(slot.color_hex)),
  color.id,
  coalesce(color.material, slot.material),
  coalesce(color.name, slot.color_name, slot.material || ' ' || slot.color_hex),
  coalesce(color.hex, slot.color_hex),
  coalesce(slot.remaining_grams, slot.spool_capacity_grams * slot.remaining_percent / 100, 0),
  slot.spool_capacity_grams,
  slot.remaining_percent,
  slot.printer_id,
  slot.ams_unit,
  slot.slot_number,
  slot.tray_uuid,
  slot.updated_at
from public.printer_ams_slots slot
left join public.filament_colors color
  on upper(color.material) = upper(slot.material)
 and upper(color.hex) = upper(slot.color_hex)
where slot.material is not null
  and slot.color_hex is not null
  and (slot.remaining_grams is not null or slot.remaining_percent is not null)
order by coalesce('palette:' || color.id::text, 'ams:' || upper(slot.material) || ':' || upper(slot.color_hex)), slot.updated_at desc
on conflict (inventory_key) do update set
  filament_color_id = excluded.filament_color_id,
  material = excluded.material,
  color_name = excluded.color_name,
  color_hex = excluded.color_hex,
  total_weight_grams = excluded.total_weight_grams,
  spool_capacity_grams = excluded.spool_capacity_grams,
  remaining_percent = excluded.remaining_percent,
  source_printer_id = excluded.source_printer_id,
  source_ams_unit = excluded.source_ams_unit,
  source_slot_number = excluded.source_slot_number,
  tray_uuid = excluded.tray_uuid,
  last_seen_at = excluded.last_seen_at;
