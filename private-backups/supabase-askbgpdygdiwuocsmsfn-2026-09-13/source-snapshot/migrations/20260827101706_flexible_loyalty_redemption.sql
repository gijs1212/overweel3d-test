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
  if points_to_redeem is null or points_to_redeem < 1 then
    raise exception 'Wissel minimaal één punt in.';
  end if;

  select p.loyalty_points, p.email into current_points, customer_email
  from public.profiles p where p.user_id = caller_id for update;
  if not found then raise exception 'Profiel niet gevonden.'; end if;
  if coalesce(current_points, 0) < points_to_redeem then raise exception 'Onvoldoende punten.'; end if;
  if coalesce(trim(customer_email), '') = '' then raise exception 'E-mailadres ontbreekt in uw profiel.'; end if;

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
