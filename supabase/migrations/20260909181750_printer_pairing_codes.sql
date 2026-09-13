create table public.printer_pairing_codes (
  id uuid primary key default gen_random_uuid(),
  printer_id uuid not null references public.printers(id) on delete cascade,
  code_hash text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  bambu_host text,
  bambu_access_code text,
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index printer_pairing_codes_expiry_idx
  on public.printer_pairing_codes (expires_at)
  where redeemed_at is null;

alter table public.printer_pairing_codes enable row level security;
revoke all on table public.printer_pairing_codes from public, anon, authenticated;
grant all on table public.printer_pairing_codes to service_role;
create policy "No direct pairing-code access"
  on public.printer_pairing_codes for all to anon, authenticated
  using (false)
  with check (false);

create or replace function public.redeem_printer_pairing_code(
  p_code_hash text,
  p_access_hash text,
  p_refresh_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  pairing public.printer_pairing_codes%rowtype;
  printer_serial text;
begin
  select * into pairing
  from public.printer_pairing_codes
  where code_hash = p_code_hash
  for update;

  if pairing.id is null or pairing.redeemed_at is not null or pairing.expires_at <= now() then
    return null;
  end if;

  update public.printers
  set bridge_token_hash = p_access_hash,
      bridge_refresh_token_hash = p_refresh_hash,
      bridge_token_refreshed_at = now()
  where id = pairing.printer_id
  returning device_serial into printer_serial;

  if printer_serial is null then
    return null;
  end if;

  update public.printer_pairing_codes
  set redeemed_at = now(), bambu_access_code = null
  where id = pairing.id;

  return jsonb_build_object(
    'printer_id', pairing.printer_id,
    'bambu_serial', printer_serial,
    'bambu_host', pairing.bambu_host,
    'bambu_access_code', pairing.bambu_access_code
  );
end;
$$;

revoke all on function public.redeem_printer_pairing_code(text, text, text) from public, anon, authenticated;
grant execute on function public.redeem_printer_pairing_code(text, text, text) to service_role;

notify pgrst, 'reload schema';
