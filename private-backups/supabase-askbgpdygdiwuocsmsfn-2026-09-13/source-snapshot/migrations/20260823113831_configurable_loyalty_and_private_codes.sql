insert into public.app_settings (key, value, description)
values
  ('loyalty_points_per_euro', '1'::jsonb, 'Aantal loyaliteitspunten per uitgegeven euro.'),
  ('loyalty_euros_per_point', '0.05'::jsonb, 'Aantal euro korting per ingewisseld loyaliteitspunt.')
on conflict (key) do nothing;

drop policy if exists "Public settings are readable" on public.app_settings;
create policy "Public settings are readable" on public.app_settings
for select to anon, authenticated
using (key in ('newsletter_enabled','abandoned_cart_enabled','loyalty_points_per_euro','loyalty_euros_per_point'));

drop policy if exists "Anyone can read active codes for validation" on public.discount_codes;
drop policy if exists "Admins can manage discount codes" on public.discount_codes;
drop policy if exists "Public can read public discount codes" on public.discount_codes;
drop policy if exists "Customers can read their private discount codes" on public.discount_codes;

create policy "Public can read public discount codes" on public.discount_codes
for select to anon, authenticated
using (active and is_public);

create policy "Customers can read their private discount codes" on public.discount_codes
for select to authenticated
using (
  active
  and assigned_to_email is not null
  and exists (
    select 1 from public.profiles p
    where p.user_id = (select auth.uid())
      and lower(p.email) = lower(discount_codes.assigned_to_email)
  )
);

create policy "Admins can manage discount codes" on public.discount_codes
for all to authenticated
using (public.has_role((select auth.uid()), 'admin'))
with check (public.has_role((select auth.uid()), 'admin'));

create or replace function public.award_order_loyalty_points()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  awarded integer;
  points_per_euro numeric := 1;
begin
  if new.status = 'completed' and old.status is distinct from 'completed' and new.user_id is not null then
    select case when jsonb_typeof(s.value) = 'number' then (s.value #>> '{}')::numeric else 1 end
      into points_per_euro
    from public.app_settings s
    where s.key = 'loyalty_points_per_euro';
    points_per_euro := greatest(0, coalesce(points_per_euro, 1));
    awarded := greatest(0, floor(coalesce(new.final_price, 0) * points_per_euro))::integer;
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

create or replace function public.convert_loyalty_points(points_to_redeem integer)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  current_points integer;
  generated_code text;
  discount_euros numeric;
  euros_per_point numeric := 0.05;
  customer_email text;
begin
  if caller_id is null then raise exception 'Niet ingelogd.'; end if;
  if points_to_redeem < 100 or points_to_redeem % 100 <> 0 then raise exception 'Wissel punten in per 100 punten.'; end if;

  select p.loyalty_points, p.email into current_points, customer_email
  from public.profiles p where p.user_id = caller_id for update;
  if coalesce(current_points, 0) < points_to_redeem then raise exception 'Onvoldoende punten.'; end if;

  select case when jsonb_typeof(s.value) = 'number' then (s.value #>> '{}')::numeric else 0.05 end
    into euros_per_point
  from public.app_settings s where s.key = 'loyalty_euros_per_point';
  euros_per_point := greatest(0.0001, coalesce(euros_per_point, 0.05));
  discount_euros := round(points_to_redeem * euros_per_point, 2);
  generated_code := 'LOYAL-' || upper(substr(replace(extensions.gen_random_uuid()::text, '-', ''), 1, 10));

  update public.profiles set loyalty_points = loyalty_points - points_to_redeem where user_id = caller_id;
  insert into public.loyalty_transactions(user_id, points, kind, description)
  values (caller_id, -points_to_redeem, 'redeemed', 'Ingewisseld voor kortingscode ' || generated_code);
  insert into public.discount_codes(
    code, discount_type, discount_value, max_uses, times_used, assigned_to_email,
    active, is_public, starts_at, expires_at, per_customer_limit, stackable
  ) values (
    generated_code, 'fixed', discount_euros, 1, 0, customer_email,
    true, false, now(), null, 1, false
  );
  return generated_code;
end;
$$;

revoke all on function public.convert_loyalty_points(integer) from public, anon;
grant execute on function public.convert_loyalty_points(integer) to authenticated;

notify pgrst, 'reload schema';
