# Migratiestatus Edge Functions

Alle 28 voormalige Supabase Edge Functions hebben nu een PocketBase-route of
een functioneel vervangende bridge-route. Er zijn geen HTTP 501-stubs meer.

## PocketBase-functieroute

Deze functies zijn beschikbaar via
`POST /api/overweel3d/functions/<functienaam>`:

- `cleanup-exported-order`
- `cleanup-legacy-heic`
- `complete-order`
- `download-order-file` (metadata en download-URL)
- `exchange-onedrive-token`
- `export-order`
- `generate-blog-post`
- `generate-content-marketing`
- `generate-invoice`
- `get-order-by-token`
- `home-assistant-api`
- `manage-newsletter`
- `printer-pair`
- `process-referral-reward`
- `send-abandoned-cart-reminders`
- `send-account-welcome`
- `send-chat-notification`
- `send-contact-message`
- `send-marketing-email`
- `send-order-email`
- `send-order-notification`
- `update-order-status`
- `upload-to-onedrive`

De binaire downloadroute is daarnaast beschikbaar als
`GET /api/overweel3d/functions/download-order-file?file_id=<id>`.

## Printerbridge

De onderstaande voormalige Edge Functions zijn vervangen door beveiligde
routes onder `/api/overweel3d/bridge/*`:

- `bridge-token-refresh`
- `printer-status-ingest`
- `printer-queue-bridge`

`printer-camera-ingest` gebruikt vanwege de binaire afbeeldingsbody de route
`POST /api/overweel3d/printer-camera-ingest`.

`check-offline-printers` blijft beschikbaar via de algemene functieroute en kan
door een PocketBase-cron of externe scheduler worden aangeroepen.

## Configuratie

OneDrive, orderexport en Home Assistant gebruiken afzonderlijke secrets die
alleen op de PocketBase-server worden ingesteld. Zie `README.md`. De oude
HEIC-opruimfunctie ondersteunt standaard een veilige `dry_run`; voor het
daadwerkelijk omzetten van bestaande bestanden is een interne
`HEIC_CONVERTER_URL` nodig. Nieuwe HEIC-foto's worden in de browser als JPG
geüpload.
