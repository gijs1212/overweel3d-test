create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select vault.create_secret(
  'https://askbgpdygdiwuocsmsfn.supabase.co',
  'project_url'
)
where not exists (select 1 from vault.decrypted_secrets where name = 'project_url');

select vault.create_secret(
  'sb_publishable_CUNLvx4UONiUiIiLzEgnmA__eIEpc_0',
  'publishable_key'
)
where not exists (select 1 from vault.decrypted_secrets where name = 'publishable_key');

select cron.schedule(
  'send-abandoned-cart-reminders-hourly',
  '17 * * * *',
  $cron$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
      || '/functions/v1/send-abandoned-cart-reminders',
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
