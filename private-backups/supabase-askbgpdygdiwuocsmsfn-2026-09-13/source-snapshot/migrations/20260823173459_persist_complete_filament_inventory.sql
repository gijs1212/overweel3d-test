alter table public.filament_inventory
  alter column total_weight_grams drop not null,
  add column manual_weight_grams numeric check (manual_weight_grams is null or manual_weight_grams >= 0);

comment on column public.filament_inventory.manual_weight_grams is
  'Optional admin correction. When set, the UI uses this value instead of the live AMS estimate.';

grant update (manual_weight_grams) on public.filament_inventory to authenticated;

create policy "Admins correct filament inventory weight"
on public.filament_inventory
for update
to authenticated
using (public.has_role((select auth.uid()), 'admin'))
with check (public.has_role((select auth.uid()), 'admin'));

-- Every catalogue color belongs in filament management, even before it is
-- observed by a weighing AMS. Its weight then remains explicitly unknown.
insert into public.filament_inventory (
  inventory_key,
  filament_color_id,
  material,
  color_name,
  color_hex,
  total_weight_grams,
  spool_capacity_grams,
  remaining_percent,
  last_seen_at
)
select
  'palette:' || color.id::text,
  color.id,
  color.material,
  color.name,
  color.hex,
  null,
  1000,
  null,
  now()
from public.filament_colors color
on conflict (inventory_key) do update set
  filament_color_id = excluded.filament_color_id,
  material = excluded.material,
  color_name = excluded.color_name,
  color_hex = excluded.color_hex;
