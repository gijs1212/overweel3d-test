-- Commerce, customer retention and production planning for Overweel3D.
-- All public-schema tables use RLS and explicit Data API grants.

create extension if not exists pg_cron;
create extension if not exists pg_net;

alter table public.discount_codes
  add column if not exists minimum_order_amount numeric not null default 0 check (minimum_order_amount >= 0),
  add column if not exists category_id uuid references public.product_categories(id) on delete cascade,
  add column if not exists stackable boolean not null default false,
  add column if not exists per_customer_limit integer check (per_customer_limit is null or per_customer_limit > 0),
  add column if not exists starts_at timestamptz;

alter table public.profiles
  add column if not exists loyalty_points integer not null default 0 check (loyalty_points >= 0);

alter table public.orders
  add column if not exists gift_card_code text,
  add column if not exists gift_card_amount numeric not null default 0 check (gift_card_amount >= 0),
  add column if not exists loyalty_points_awarded integer not null default 0 check (loyalty_points_awarded >= 0),
  add column if not exists filament_used_g numeric check (filament_used_g is null or filament_used_g >= 0),
  add column if not exists material_cost numeric check (material_cost is null or material_cost >= 0),
  add column if not exists print_duration_minutes integer check (print_duration_minutes is null or print_duration_minutes >= 0);

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  description text not null default '',
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.app_settings (key, value, description) values
  ('newsletter_enabled', 'true'::jsonb, 'Schakelt automatische en handmatige nieuwsbrieven in of uit.'),
  ('abandoned_cart_enabled', 'true'::jsonb, 'Schakelt herinneringen voor verlaten winkelmandjes in of uit.'),
  ('abandoned_cart_hours', '24'::jsonb, 'Aantal uren voordat een winkelmandherinnering wordt verstuurd.'),
  ('loyalty_points_per_euro', '1'::jsonb, 'Aantal loyaliteitspunten per uitgegeven euro.')
on conflict (key) do nothing;

create table if not exists public.discount_redemptions (
  id uuid primary key default gen_random_uuid(),
  discount_code_id uuid not null references public.discount_codes(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  customer_email text not null,
  discount_amount numeric not null default 0 check (discount_amount >= 0),
  created_at timestamptz not null default now(),
  unique (discount_code_id, order_id)
);
create index if not exists discount_redemptions_customer_idx on public.discount_redemptions(discount_code_id, lower(customer_email));

create table if not exists public.saved_carts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null default '',
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  subtotal numeric not null default 0 check (subtotal >= 0),
  status text not null default 'active' check (status in ('active','converted','abandoned')),
  reminder_count integer not null default 0 check (reminder_count >= 0),
  reminder_sent_at timestamptz,
  checkout_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);
create index if not exists saved_carts_reminder_idx on public.saved_carts(status, updated_at) where status = 'active';

create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null,
  sku text,
  size_label text,
  material_id text,
  price_adjustment numeric not null default 0,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, name)
);
create index if not exists product_variants_product_idx on public.product_variants(product_id, active, sort_order);

create table if not exists public.product_reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  title text not null default '',
  body text not null default '',
  photos jsonb not null default '[]'::jsonb check (jsonb_typeof(photos) = 'array'),
  verified boolean not null default false,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, order_id, user_id)
);
create index if not exists product_reviews_public_idx on public.product_reviews(product_id, status, created_at desc);

create table if not exists public.loyalty_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  points integer not null,
  kind text not null check (kind in ('earned','redeemed','adjustment')),
  description text not null default '',
  created_at timestamptz not null default now()
);
create unique index if not exists loyalty_order_kind_idx on public.loyalty_transactions(order_id, kind) where order_id is not null;
create index if not exists loyalty_user_idx on public.loyalty_transactions(user_id, created_at desc);

create table if not exists public.gift_cards (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  initial_balance numeric not null check (initial_balance > 0),
  current_balance numeric not null check (current_balance >= 0),
  assigned_to_email text,
  expires_at timestamptz,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.gift_card_redemptions (
  id uuid primary key default gen_random_uuid(),
  gift_card_id uuid not null references public.gift_cards(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric not null check (amount > 0),
  created_at timestamptz not null default now(),
  unique (gift_card_id, order_id)
);

create table if not exists public.printers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  model text not null default 'Bambu Lab P1S',
  device_serial text not null unique,
  bridge_token_hash text,
  status text not null default 'offline' check (status in ('offline','idle','printing','paused','error','maintenance')),
  current_file text,
  current_plate integer,
  progress numeric not null default 0 check (progress between 0 and 100),
  remaining_minutes integer,
  current_layer integer,
  total_layers integer,
  nozzle_temperature numeric,
  bed_temperature numeric,
  chamber_temperature numeric,
  maintenance_note text not null default '',
  last_seen_at timestamptz,
  raw_status jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.printer_ams_slots (
  id uuid primary key default gen_random_uuid(),
  printer_id uuid not null references public.printers(id) on delete cascade,
  ams_unit integer not null default 0,
  slot_number integer not null,
  material text,
  color_name text,
  color_hex text,
  tray_uuid text,
  remaining_grams numeric check (remaining_grams is null or remaining_grams >= 0),
  remaining_percent numeric check (remaining_percent is null or remaining_percent between 0 and 100),
  spool_capacity_grams numeric not null default 1000 check (spool_capacity_grams > 0),
  raw_status jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (printer_id, ams_unit, slot_number)
);

create table if not exists public.print_jobs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  printer_id uuid references public.printers(id) on delete set null,
  plate_number integer not null check (plate_number > 0),
  plate_name text not null default '',
  expected_file_name text not null default '',
  three_mf_storage_path text,
  three_mf_signature text,
  material text,
  colors jsonb not null default '[]'::jsonb check (jsonb_typeof(colors) = 'array'),
  estimated_duration_minutes integer check (estimated_duration_minutes is null or estimated_duration_minutes >= 0),
  estimated_filament_grams numeric check (estimated_filament_grams is null or estimated_filament_grams >= 0),
  runs_required integer not null default 1 check (runs_required > 0),
  runs_completed integer not null default 0 check (runs_completed >= 0),
  status text not null default 'queued' check (status in ('queued','approved','printing','paused','completed','mismatch','cancelled')),
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  observed_file_name text,
  comparison jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, plate_number)
);
create index if not exists print_jobs_queue_idx on public.print_jobs(status, scheduled_at, created_at);
create index if not exists print_jobs_printer_idx on public.print_jobs(printer_id, status);

create table if not exists public.print_runs (
  id uuid primary key default gen_random_uuid(),
  print_job_id uuid not null references public.print_jobs(id) on delete cascade,
  printer_id uuid not null references public.printers(id) on delete cascade,
  run_number integer not null check (run_number > 0),
  observed_file_name text,
  status text not null default 'printing' check (status in ('printing','completed','failed','cancelled')),
  filament_used_grams numeric check (filament_used_grams is null or filament_used_grams >= 0),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  raw_status jsonb not null default '{}'::jsonb,
  unique (print_job_id, run_number)
);

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array['app_settings','saved_carts','product_variants','product_reviews','gift_cards','printers','printer_ams_slots','print_jobs']
  loop
    execute format('drop trigger if exists touch_updated_at on public.%I', table_name);
    execute format('create trigger touch_updated_at before update on public.%I for each row execute function public.touch_updated_at()', table_name);
  end loop;
end $$;

create or replace function public.verify_product_review()
returns trigger language plpgsql set search_path = public as $$
begin
  new.user_id := auth.uid();
  new.verified := exists (
    select 1 from public.orders o
    where o.id = new.order_id
      and o.user_id = auth.uid()
      and o.status = 'completed'
      and exists (
        select 1 from jsonb_array_elements(coalesce(o.catalog_items, '[]'::jsonb)) item
        where item->>'productId' = new.product_id::text
      )
  );
  if not new.verified then
    raise exception 'Alleen voltooide, geverifieerde aankopen kunnen worden beoordeeld.';
  end if;
  return new;
end;
$$;
drop trigger if exists verify_product_review on public.product_reviews;
create trigger verify_product_review before insert on public.product_reviews
for each row execute function public.verify_product_review();

create or replace function public.award_order_loyalty_points()
returns trigger language plpgsql set search_path = public as $$
declare awarded integer;
begin
  if new.status = 'completed' and old.status is distinct from 'completed' and new.user_id is not null then
    awarded := greatest(0, floor(coalesce(new.final_price, 0)))::integer;
    if awarded > 0 then
      insert into public.loyalty_transactions (user_id, order_id, points, kind, description)
      values (new.user_id, new.id, awarded, 'earned', 'Punten voor bestelling ' || new.order_number)
      on conflict (order_id, kind) where order_id is not null do nothing;
      if found then
        update public.profiles set loyalty_points = loyalty_points + awarded where user_id = new.user_id;
        new.loyalty_points_awarded := awarded;
      end if;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists award_order_loyalty_points on public.orders;
create trigger award_order_loyalty_points before update of status on public.orders
for each row execute function public.award_order_loyalty_points();

create or replace function public.check_discount_code(code_text text, email_text text, order_amount numeric)
returns table (
  id uuid, code text, discount_type text, discount_value numeric, max_uses integer, times_used integer,
  expires_at timestamptz, starts_at timestamptz, assigned_to_email text, is_referral boolean,
  product_id uuid, category_id uuid, minimum_order_amount numeric, stackable boolean, per_customer_limit integer
)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  return query
  select d.id, d.code, d.discount_type, d.discount_value, d.max_uses, d.times_used,
    d.expires_at, d.starts_at, d.assigned_to_email, d.is_referral,
    d.product_id, d.category_id, d.minimum_order_amount, d.stackable, d.per_customer_limit
  from public.discount_codes d
  where upper(d.code) = upper(trim(code_text))
    and d.active
    and (d.starts_at is null or d.starts_at <= now())
    and (d.expires_at is null or d.expires_at > now())
    and (d.max_uses is null or d.times_used < d.max_uses)
    and (d.assigned_to_email is null or lower(d.assigned_to_email) = lower(trim(email_text)))
    and coalesce(order_amount, 0) >= d.minimum_order_amount
    and (d.per_customer_limit is null or (
      select count(*) from public.discount_redemptions r
      where r.discount_code_id = d.id and lower(r.customer_email) = lower(trim(email_text))
    ) < d.per_customer_limit)
  limit 1;
end;
$$;
revoke all on function public.check_discount_code(text,text,numeric) from public;
revoke execute on function public.check_discount_code(text,text,numeric) from anon;
grant execute on function public.check_discount_code(text,text,numeric) to authenticated;

create or replace function public.record_discount_redemption(code_text text, order_id_value uuid, discount_amount_value numeric)
returns boolean language plpgsql security definer set search_path = public as $$
declare d public.discount_codes%rowtype; o public.orders%rowtype;
begin
  if auth.uid() is null then return false; end if;
  select * into o from public.orders where id = order_id_value and (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));
  if o.id is null then raise exception 'Bestelling niet gevonden.'; end if;
  select * into d from public.discount_codes where upper(code) = upper(trim(code_text)) for update;
  if d.id is null or not d.active or (d.starts_at is not null and d.starts_at > now()) or (d.expires_at is not null and d.expires_at <= now()) then
    raise exception 'Kortingscode is niet geldig.';
  end if;
  if d.max_uses is not null and d.times_used >= d.max_uses then raise exception 'Kortingscode is maximaal gebruikt.'; end if;
  if d.per_customer_limit is not null and (select count(*) from public.discount_redemptions where discount_code_id = d.id and lower(customer_email) = lower(o.customer_email)) >= d.per_customer_limit then
    raise exception 'Kortingscode is voor deze klant maximaal gebruikt.';
  end if;
  insert into public.discount_redemptions(discount_code_id, order_id, user_id, customer_email, discount_amount)
  values (d.id, o.id, auth.uid(), o.customer_email, greatest(0, discount_amount_value));
  update public.discount_codes set times_used = times_used + 1 where id = d.id;
  return true;
end;
$$;
revoke all on function public.record_discount_redemption(text,uuid,numeric) from public;
revoke execute on function public.record_discount_redemption(text,uuid,numeric) from anon;
grant execute on function public.record_discount_redemption(text,uuid,numeric) to authenticated;

create or replace function public.check_gift_card(code_text text, email_text text)
returns table (code text, current_balance numeric, expires_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  return query select g.code, g.current_balance, g.expires_at from public.gift_cards g
  where upper(g.code) = upper(trim(code_text)) and g.active and g.current_balance > 0
    and (g.expires_at is null or g.expires_at > now())
    and (g.assigned_to_email is null or lower(g.assigned_to_email) = lower(trim(email_text))) limit 1;
end;
$$;
revoke all on function public.check_gift_card(text,text) from public;
revoke execute on function public.check_gift_card(text,text) from anon;
grant execute on function public.check_gift_card(text,text) to authenticated;

create or replace function public.redeem_gift_card(code_text text, order_id_value uuid, requested_amount numeric)
returns numeric language plpgsql security definer set search_path = public as $$
declare g public.gift_cards%rowtype; o public.orders%rowtype; used numeric;
begin
  if auth.uid() is null then raise exception 'Niet ingelogd.'; end if;
  select * into o from public.orders where id = order_id_value and (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));
  if o.id is null then raise exception 'Bestelling niet gevonden.'; end if;
  select * into g from public.gift_cards where upper(code) = upper(trim(code_text)) for update;
  if g.id is null or not g.active or g.current_balance <= 0 or (g.expires_at is not null and g.expires_at <= now()) then raise exception 'Cadeaubon is niet geldig.'; end if;
  if g.assigned_to_email is not null and lower(g.assigned_to_email) <> lower(o.customer_email) then raise exception 'Cadeaubon hoort bij een ander e-mailadres.'; end if;
  used := least(g.current_balance, greatest(0, requested_amount));
  if used <= 0 then return 0; end if;
  insert into public.gift_card_redemptions(gift_card_id, order_id, user_id, amount) values (g.id, o.id, auth.uid(), used);
  update public.gift_cards set current_balance = current_balance - used, active = current_balance - used > 0 where id = g.id;
  update public.orders set gift_card_code = g.code, gift_card_amount = used where id = o.id;
  return used;
end;
$$;
revoke all on function public.redeem_gift_card(text,uuid,numeric) from public;
revoke execute on function public.redeem_gift_card(text,uuid,numeric) from anon;
grant execute on function public.redeem_gift_card(text,uuid,numeric) to authenticated;

create or replace function public.convert_loyalty_points(points_to_redeem integer)
returns text language plpgsql security definer set search_path = public as $$
declare current_points integer; generated_code text; discount_euros numeric;
begin
  if auth.uid() is null then raise exception 'Niet ingelogd.'; end if;
  if points_to_redeem < 100 or points_to_redeem % 100 <> 0 then raise exception 'Wissel punten in per 100 punten.'; end if;
  select loyalty_points into current_points from public.profiles where user_id = auth.uid() for update;
  if coalesce(current_points, 0) < points_to_redeem then raise exception 'Onvoldoende punten.'; end if;
  discount_euros := points_to_redeem / 20.0;
  generated_code := 'LOYAL-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  update public.profiles set loyalty_points = loyalty_points - points_to_redeem where user_id = auth.uid();
  insert into public.loyalty_transactions(user_id, points, kind, description) values (auth.uid(), -points_to_redeem, 'redeemed', 'Ingewisseld voor kortingscode ' || generated_code);
  insert into public.discount_codes(code, discount_type, discount_value, max_uses, assigned_to_email, active, is_public, starts_at, expires_at)
  select generated_code, 'fixed', discount_euros, 1, email, true, false, now(), now() + interval '1 year' from public.profiles where user_id = auth.uid();
  return generated_code;
end;
$$;
revoke all on function public.convert_loyalty_points(integer) from public;
revoke execute on function public.convert_loyalty_points(integer) from anon;
grant execute on function public.convert_loyalty_points(integer) to authenticated;

alter table public.app_settings enable row level security;
alter table public.discount_redemptions enable row level security;
alter table public.saved_carts enable row level security;
alter table public.product_variants enable row level security;
alter table public.product_reviews enable row level security;
alter table public.loyalty_transactions enable row level security;
alter table public.gift_cards enable row level security;
alter table public.gift_card_redemptions enable row level security;
alter table public.printers enable row level security;
alter table public.printer_ams_slots enable row level security;
alter table public.print_jobs enable row level security;
alter table public.print_runs enable row level security;

create policy "Public settings are readable" on public.app_settings for select to anon, authenticated using (key in ('newsletter_enabled','abandoned_cart_enabled','loyalty_points_per_euro'));
create policy "Admins manage settings" on public.app_settings for all to authenticated using (public.has_role((select auth.uid()), 'admin')) with check (public.has_role((select auth.uid()), 'admin'));
create policy "Users view own discount redemptions" on public.discount_redemptions for select to authenticated using ((select auth.uid()) = user_id);
create policy "Admins manage discount redemptions" on public.discount_redemptions for all to authenticated using (public.has_role((select auth.uid()), 'admin')) with check (public.has_role((select auth.uid()), 'admin'));
create policy "Users manage own saved cart" on public.saved_carts for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Admins view saved carts" on public.saved_carts for select to authenticated using (public.has_role((select auth.uid()), 'admin'));
create policy "Anyone views active variants" on public.product_variants for select to anon, authenticated using (active or public.has_role((select auth.uid()), 'admin'));
create policy "Admins manage variants" on public.product_variants for all to authenticated using (public.has_role((select auth.uid()), 'admin')) with check (public.has_role((select auth.uid()), 'admin'));
create policy "Anyone views approved reviews" on public.product_reviews for select to anon, authenticated using (status = 'approved');
create policy "Users view own reviews" on public.product_reviews for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users create own reviews" on public.product_reviews for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users update own pending reviews" on public.product_reviews for update to authenticated using ((select auth.uid()) = user_id and status = 'pending') with check ((select auth.uid()) = user_id and status = 'pending');
create policy "Admins manage reviews" on public.product_reviews for all to authenticated using (public.has_role((select auth.uid()), 'admin')) with check (public.has_role((select auth.uid()), 'admin'));
create policy "Users view loyalty history" on public.loyalty_transactions for select to authenticated using ((select auth.uid()) = user_id);
create policy "Admins manage loyalty" on public.loyalty_transactions for all to authenticated using (public.has_role((select auth.uid()), 'admin')) with check (public.has_role((select auth.uid()), 'admin'));
create policy "Admins manage gift cards" on public.gift_cards for all to authenticated using (public.has_role((select auth.uid()), 'admin')) with check (public.has_role((select auth.uid()), 'admin'));
create policy "Users view own gift card usage" on public.gift_card_redemptions for select to authenticated using ((select auth.uid()) = user_id);
create policy "Admins manage gift card usage" on public.gift_card_redemptions for all to authenticated using (public.has_role((select auth.uid()), 'admin')) with check (public.has_role((select auth.uid()), 'admin'));
create policy "Admins manage printers" on public.printers for all to authenticated using (public.has_role((select auth.uid()), 'admin')) with check (public.has_role((select auth.uid()), 'admin'));
create policy "Admins manage AMS slots" on public.printer_ams_slots for all to authenticated using (public.has_role((select auth.uid()), 'admin')) with check (public.has_role((select auth.uid()), 'admin'));
create policy "Admins manage print jobs" on public.print_jobs for all to authenticated using (public.has_role((select auth.uid()), 'admin')) with check (public.has_role((select auth.uid()), 'admin'));
create policy "Customers view own print jobs" on public.print_jobs for select to authenticated using (exists (select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid())));
create policy "Admins manage print runs" on public.print_runs for all to authenticated using (public.has_role((select auth.uid()), 'admin')) with check (public.has_role((select auth.uid()), 'admin'));
create policy "Customers view own print runs" on public.print_runs for select to authenticated using (exists (select 1 from public.print_jobs j join public.orders o on o.id = j.order_id where j.id = print_job_id and o.user_id = (select auth.uid())));
create policy "Admins update profiles" on public.profiles for update to authenticated using (public.has_role((select auth.uid()), 'admin')) with check (public.has_role((select auth.uid()), 'admin'));

grant select on public.app_settings, public.product_variants, public.product_reviews to anon;
grant select on public.app_settings, public.product_variants, public.product_reviews, public.discount_redemptions, public.saved_carts, public.loyalty_transactions, public.gift_card_redemptions, public.printers, public.printer_ams_slots, public.print_jobs, public.print_runs to authenticated;
grant insert, update, delete on public.app_settings, public.discount_redemptions, public.saved_carts, public.product_variants, public.product_reviews, public.loyalty_transactions, public.gift_cards, public.gift_card_redemptions, public.printers, public.printer_ams_slots, public.print_jobs, public.print_runs to authenticated;
grant select on public.gift_cards to authenticated;

-- Review images live in the existing orders bucket under reviews/<user-id>/...
drop policy if exists "Public read approved review photos" on storage.objects;
create policy "Public read approved review photos" on storage.objects for select to anon, authenticated
using (
  bucket_id = 'orders' and name like 'reviews/%'
  and exists (
    select 1 from public.product_reviews review
    where review.status = 'approved' and review.photos ? storage.objects.name
  )
);

notify pgrst, 'reload schema';
