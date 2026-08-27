alter table public.printers
  add column if not exists offline_since timestamptz,
  add column if not exists offline_alert_sent_at timestamptz;

-- Normalize existing address data to the new model: shipping is required and
-- billing stays empty when it is the same address.
update public.profiles
set shipping_address = billing_address,
    billing_address = ''
where coalesce(trim(shipping_address), '') = ''
  and coalesce(trim(billing_address), '') <> '';

update public.profiles
set billing_address = ''
where coalesce(trim(shipping_address), '') <> ''
  and lower(trim(shipping_address)) = lower(trim(coalesce(billing_address, '')));

update public.orders
set shipping_address = billing_address,
    billing_address = ''
where coalesce(trim(shipping_address), '') = ''
  and coalesce(trim(billing_address), '') <> '';

update public.orders
set billing_address = ''
where coalesce(trim(shipping_address), '') <> ''
  and lower(trim(shipping_address)) = lower(trim(coalesce(billing_address, '')));

create or replace function public.claim_order_to_account(p_token text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_id uuid := auth.uid();
  current_owner uuid;
  target_order_id uuid;
begin
  if requester_id is null then
    raise exception 'U moet ingelogd zijn' using errcode = '42501';
  end if;
  if p_token is null or char_length(p_token) < 32 then
    raise exception 'Ongeldige bestellink' using errcode = '22023';
  end if;

  select id, user_id
  into target_order_id, current_owner
  from public.orders
  where customer_order_token = p_token
  for update;

  if not found then return false; end if;
  if current_owner = requester_id then return true; end if;

  -- Possession of the high-entropy customer order token is the authority to
  -- move the order. This deliberately permits a different account email.
  update public.orders
  set user_id = requester_id
  where id = target_order_id;

  insert into public.order_events (
    order_id, event_type, event_description, performed_by, visible_to_customer
  ) values (
    target_order_id,
    'account_link_changed',
    case when current_owner is null
      then 'Bestelling aan een klantaccount gekoppeld.'
      else 'Bestelling naar een ander klantaccount overgezet.'
    end,
    requester_id,
    false
  );

  return true;
end;
$$;

revoke all on function public.claim_order_to_account(text) from public, anon;
grant execute on function public.claim_order_to_account(text) to authenticated;

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'check-offline-printers-every-ten-minutes',
  '*/10 * * * *',
  $cron$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
      || '/functions/v1/check-offline-printers',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'publishable_key'),
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'publishable_key')
    ),
    body := jsonb_build_object('scheduled_at', now()),
    timeout_milliseconds := 10000
  ) as request_id;
  $cron$
);
