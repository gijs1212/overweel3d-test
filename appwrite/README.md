# Overweel3D op Appwrite

Versies:

- Appwrite-server: 2.4.0
- migratietool: 1.0.0
- centrale Appwrite Function: 1.3.0
- Appwrite-websiteadapter: 0.3.0
- Social Publisher: 3.1.0

De nieuwe implementatie staat los van de live PocketBase-versie. De bevroren
bronback-up staat onder `private-backups/` en wordt alleen-lezen gebruikt.

## Doelresources

- project: `6af9acde00152998cadb`
- database: `overweel3d-v2`
- openbare bucket: `public-media-v2`
- privébucket: `private-files-v2`
- Function: `overweel3d-api`

De database bevat de rechtstreeks gemigreerde PocketBase-collecties plus de synthetische
tabellen `profiles` en `user_roles`. Die laatste twee houden de bestaande
Supabase-compatibele website-interface werkend zonder dat de browser de
Appwrite Users-beheer-API hoeft te gebruiken.

## Controle

```powershell
python scripts/appwrite/migrate_pocketbase.py verify `
  --database overweel3d-v2 `
  --public-bucket public-media-v2 `
  --private-bucket private-files-v2

python scripts/appwrite/smoke_test.py
python scripts/appwrite/social_smoke_test.py
python scripts/appwrite/auth_smoke_test.py --email <admin-email>
npm test
npm run build
```

## Function opnieuw deployen

```powershell
python scripts/appwrite/deploy_function.py --runtime node-22
```

De lokale `.env.appwrite.local` bevat de tijdelijke migratiekey en staat door
`*.local` buiten versiebeheer. Trek deze key in zodra de resterende
acceptatietests en de uiteindelijke omschakeling zijn afgerond.

Voor e-mail gebruikt de Function de Resend Email API. Voeg later
`RESEND_API_KEY` en optioneel `RESEND_FROM` toe aan `.env.appwrite.local`.
Het deployscript zet de API-key als geheime Function-variable. Zonder key geeft
een mailactie bewust een duidelijke 503-fout in plaats van stil te mislukken.
`APPWRITE_FUNCTION_PUBLIC_URL` moet de rechtstreekse Function-domain bevatten;
die URL bedient privÃ©klantbestanden pas nadat het bestellingstoken en de
bestandskoppeling server-side zijn gecontroleerd. De Function draait iedere
vijftien minuten de offline-printercontrole en verlaten-winkelmandtaak.

Voor de OneDrive-koppeling zijn daarnaast `ONEDRIVE_CLIENT_ID`,
`ONEDRIVE_CLIENT_SECRET`, optioneel `ONEDRIVE_TENANT_ID` en
`ONEDRIVE_REDIRECT_URI` nodig. Bestaande tokens blijven in de gemigreerde tabel
`onedrive_tokens`; een verlopen access-token wordt via het refresh-token
vernieuwd.

## Uploadlimiet

De huidige Appwrite-server accepteert maximaal 30 MB per bestand. Alle 68
bestaande bronbestanden passen daarbinnen. Voor de gewenste 250 MB moet op de
Appwrite-host `_APP_STORAGE_LIMIT=262144000` worden ingesteld, waarna de stack
opnieuw wordt aangemaakt en beide buckets op 262144000 bytes worden gezet.

