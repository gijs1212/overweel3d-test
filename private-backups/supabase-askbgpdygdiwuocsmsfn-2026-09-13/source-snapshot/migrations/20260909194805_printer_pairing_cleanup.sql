select cron.schedule(
  'cleanup_printer_pairing_secrets',
  '*/5 * * * *',
  $cleanup$
    update public.printer_pairing_codes
    set bambu_access_code = null,
        slicer_cert_pem = null,
        slicer_key_pem = null,
        slicer_crl_pem = null
    where expires_at <= now()
      and (
        bambu_access_code is not null
        or slicer_cert_pem is not null
        or slicer_key_pem is not null
        or slicer_crl_pem is not null
      );
  $cleanup$
)
where not exists (
  select 1 from cron.job where jobname = 'cleanup_printer_pairing_secrets'
);
