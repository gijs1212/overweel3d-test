create or replace function public.sync_filament_color_inventory()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
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
  ) values (
    'palette:' || new.id::text,
    new.id,
    new.material,
    new.name,
    new.hex,
    null,
    1000,
    null,
    now()
  )
  on conflict (inventory_key) do update set
    filament_color_id = excluded.filament_color_id,
    material = excluded.material,
    color_name = excluded.color_name,
    color_hex = excluded.color_hex;

  return new;
end;
$$;

drop trigger if exists sync_filament_color_inventory on public.filament_colors;
create trigger sync_filament_color_inventory
after insert or update of name, material, hex
on public.filament_colors
for each row
execute function public.sync_filament_color_inventory();
