drop policy if exists "Admins view filament inventory" on public.filament_inventory;
drop policy if exists "Admins correct filament inventory weight" on public.filament_inventory;

create policy "Admins manage filament inventory"
on public.filament_inventory
for all
to authenticated
using (public.has_role((select auth.uid()), 'admin'))
with check (public.has_role((select auth.uid()), 'admin'));

grant select, insert, update, delete on public.filament_inventory to authenticated;

create or replace function public.promote_inventory_to_filament_color(
  p_inventory_id uuid,
  p_name text,
  p_material text,
  p_hex text,
  p_description text default '',
  p_active boolean default true
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  source_inventory public.filament_inventory%rowtype;
  new_color_id uuid;
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'Alleen administrators kunnen een voorraadrol als kleur toevoegen.' using errcode = '42501';
  end if;

  if nullif(trim(p_name), '') is null then
    raise exception 'Vul een kleurnaam in.' using errcode = '22023';
  end if;
  if nullif(trim(p_material), '') is null then
    raise exception 'Vul een materiaal in.' using errcode = '22023';
  end if;
  if trim(p_hex) !~* '^#[0-9a-f]{6}$' then
    raise exception 'Gebruik een geldige hexcode, bijvoorbeeld #1A2B3C.' using errcode = '22023';
  end if;

  select *
  into source_inventory
  from public.filament_inventory
  where id = p_inventory_id
  for update;

  if not found then
    raise exception 'De voorraadregel bestaat niet meer.' using errcode = 'P0002';
  end if;
  if source_inventory.filament_color_id is not null then
    raise exception 'Deze voorraadregel is al aan een kleur gekoppeld.' using errcode = '23505';
  end if;
  if exists (
    select 1
    from public.filament_colors color
    where lower(trim(color.name)) = lower(trim(p_name))
      and upper(trim(color.material)) = upper(trim(p_material))
  ) then
    raise exception 'Deze kleurnaam bestaat al voor dit materiaal.' using errcode = '23505';
  end if;

  insert into public.filament_colors (
    name, material, hex, description, sort_order, active
  ) values (
    trim(p_name), upper(trim(p_material)), upper(trim(p_hex)), trim(coalesce(p_description, '')),
    coalesce((select max(color.sort_order) + 1 from public.filament_colors color), 0),
    p_active
  )
  returning id into new_color_id;

  -- The catalogue trigger creates the palette row. Copy the AMS observation
  -- into that row before removing the former unlisted-AMS row.
  update public.filament_inventory
  set
    total_weight_grams = source_inventory.total_weight_grams,
    manual_weight_grams = source_inventory.manual_weight_grams,
    spool_capacity_grams = source_inventory.spool_capacity_grams,
    remaining_percent = source_inventory.remaining_percent,
    source_printer_id = source_inventory.source_printer_id,
    source_ams_unit = source_inventory.source_ams_unit,
    source_slot_number = source_inventory.source_slot_number,
    tray_uuid = source_inventory.tray_uuid,
    last_seen_at = source_inventory.last_seen_at
  where inventory_key = 'palette:' || new_color_id::text;

  delete from public.filament_inventory where id = source_inventory.id;

  insert into public.product_color_availability (product_id, color_id, available)
  select product.id, new_color_id, true
  from public.products product
  where cardinality(coalesce(product.materials, '{}'::text[])) = 0
     or exists (
       select 1
       from unnest(coalesce(product.materials, '{}'::text[])) product_material
       where upper(trim(product_material)) = upper(trim(p_material))
     )
  on conflict (product_id, color_id) do update set available = excluded.available;

  return new_color_id;
end;
$$;

revoke all on function public.promote_inventory_to_filament_color(uuid, text, text, text, text, boolean) from public, anon;
grant execute on function public.promote_inventory_to_filament_color(uuid, text, text, text, text, boolean) to authenticated;
