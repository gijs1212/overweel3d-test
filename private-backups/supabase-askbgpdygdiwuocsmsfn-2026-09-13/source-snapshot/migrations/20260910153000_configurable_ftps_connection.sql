alter table public.printer_pairing_codes
  add column if not exists ftps_username text not null default 'bblp',
  add column if not exists ftps_port integer not null default 990;

alter table public.printer_pairing_codes
  drop constraint if exists printer_pairing_ftps_username_check,
  add constraint printer_pairing_ftps_username_check check (length(trim(ftps_username)) between 1 and 64),
  drop constraint if exists printer_pairing_ftps_port_check,
  add constraint printer_pairing_ftps_port_check check (ftps_port between 1 and 65535);

create or replace function public.redeem_printer_pairing_code(p_code_hash text, p_access_hash text, p_refresh_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare pairing public.printer_pairing_codes%rowtype; printer_serial text;
begin
  select * into pairing from public.printer_pairing_codes where code_hash = p_code_hash for update;
  if pairing.id is null or pairing.expires_at <= now() or pairing.redeemed_at is not null then return null; end if;
  update public.printers set bridge_token_hash = p_access_hash, bridge_refresh_token_hash = p_refresh_hash,
    bridge_token_refreshed_at = now() where id = pairing.printer_id returning device_serial into printer_serial;
  if printer_serial is null then return null; end if;
  update public.printer_pairing_codes set redeemed_at = now(), bambu_access_code = null,
    slicer_cert_pem = null, slicer_key_pem = null, slicer_crl_pem = null where id = pairing.id;
  return jsonb_build_object('printer_id', pairing.printer_id, 'bambu_serial', printer_serial,
    'bambu_host', pairing.bambu_host, 'bambu_access_code', pairing.bambu_access_code,
    'ftps_username', pairing.ftps_username, 'ftps_port', pairing.ftps_port);
end; $$;

revoke all on function public.redeem_printer_pairing_code(text, text, text) from public, anon, authenticated;
grant execute on function public.redeem_printer_pairing_code(text, text, text) to service_role;
notify pgrst, 'reload schema';
