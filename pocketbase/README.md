# Overweel3D PocketBase-serverlaag

De collectie- en datamigratie wordt uitgevoerd met:

```powershell
$env:POCKETBASE_ADMIN_TOKEN = "<PocketBase-superuser-token>"
node scripts/pocketbase-migrate.mjs
```

Plaats daarna `pb_hooks/overweel3d.pb.js` in de map `pb_hooks` naast het
PocketBase-programma en herstart PocketBase. Controleer vervolgens:

```text
GET https://api.gijsoverweel.nl/api/overweel3d/health
```

Een geldig antwoord bevat `"ok": true` en versie `1.3.0`.

## Serverintegraties

De herbouwde export-, OneDrive-, Home Assistant-, HEIC- en camerafuncties
gebruiken uitsluitend serverinstellingen. Stel waar van toepassing deze
omgevingsvariabelen in bij het PocketBase-proces:

```text
POCKETBASE_PUBLIC_URL=https://api.gijsoverweel.nl
OVERWEEL3D_EXPORT_API_KEY=<lange unieke sleutel voor n8n/export>
HOME_ASSISTANT_API_KEY=<lange unieke sleutel voor Home Assistant>
ONEDRIVE_CLIENT_ID=<Microsoft app client-id>
ONEDRIVE_CLIENT_SECRET=<Microsoft app client-secret>
ONEDRIVE_TENANT_ID=<Microsoft tenant-id>
ONEDRIVE_REDIRECT_URI=https://overweel3d.gijsoverweel.nl/auth/callback
HEIC_CONVERTER_URL=<optionele interne HEIC-naar-JPG HTTP-service>
```

`HEIC_CONVERTER_URL` is alleen nodig voor het eenmalig omzetten van oude
HEIC-bestanden die al in de opslag staan. Nieuwe HEIC-uploads worden door de
website vóór het uploaden naar JPG omgezet.

## Mail

Stel in het PocketBase-beheer onder **Settings > Mail settings** de SMTP-server
in en gebruik als afzender bijvoorbeeld `info@overweel3d.gijsoverweel.nl`.
Nieuwsbrief-, account-, contact- en bestelmail worden door de hook via die
centrale mailinstelling verstuurd.

## Beveiliging

- Zet het superuser-token nooit in de website of in Git.
- Bewaar `pb_data` in de serverback-up.
- Gebruik HTTPS voor de publieke PocketBase-URL.
- Verander het tijdelijke adminwachtwoord na de eerste succesvolle controle.
