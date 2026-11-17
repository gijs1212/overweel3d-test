create table if not exists public.materials (
  id text primary key,
  name text not null unique,
  price_per_gram numeric not null default 0 check (price_per_gram >= 0),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.materials (id, name, price_per_gram, sort_order)
values ('pla', 'PLA', 0.08, 0), ('petg', 'PETG', 0.09, 10), ('tpu', 'TPU', 0.12, 20)
on conflict (id) do update set name = excluded.name;

alter table public.materials enable row level security;
drop policy if exists "Anyone can view active materials" on public.materials;
drop policy if exists "Admins manage materials" on public.materials;
create policy "Anyone can view active materials" on public.materials for select
  using (active or public.has_role((select auth.uid()), 'admin'));
create policy "Admins manage materials" on public.materials for all to authenticated
  using (public.has_role((select auth.uid()), 'admin'))
  with check (public.has_role((select auth.uid()), 'admin'));
grant select on public.materials to anon;
grant select, insert, update, delete on public.materials to authenticated;
grant all on public.materials to service_role;

alter table public.product_options
  add column if not exists is_addon boolean not null default false,
  add column if not exists price_adjustment numeric not null default 0,
  add column if not exists color_slots integer not null default 0,
  add column if not exists color_slot_labels jsonb not null default '[]'::jsonb;

alter table public.product_options drop constraint if exists product_options_price_adjustment_check;
alter table public.product_options add constraint product_options_price_adjustment_check check (price_adjustment >= 0);
alter table public.product_options drop constraint if exists product_options_color_slots_check;
alter table public.product_options add constraint product_options_color_slots_check check (color_slots between 0 and 12);
alter table public.product_options drop constraint if exists product_options_color_slot_labels_check;
alter table public.product_options add constraint product_options_color_slot_labels_check check (jsonb_typeof(color_slot_labels) = 'array');

alter table public.printers
  add column if not exists connection_mode text not null default 'lan_bridge';
alter table public.printers drop constraint if exists printers_connection_mode_check;
alter table public.printers add constraint printers_connection_mode_check check (connection_mode in ('lan_bridge', 'bambu_connect'));

drop trigger if exists touch_updated_at on public.materials;
create trigger touch_updated_at before update on public.materials
for each row execute function public.touch_updated_at();
