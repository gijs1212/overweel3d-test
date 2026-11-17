# PocketBase → Appwrite migratie

Deze map bevat de idempotente migratie voor Overweel3D. De basisimport gebruikt
altijd een bevroren PocketBase-back-up en wijzigt de live database niet. Na die
basisimport kopieert `sync_live_pocketbase.py` uitsluitend nieuwere en gewijzigde
live records en bestanden naar Appwrite; ook dit script schrijft nooit naar
PocketBase en verwijdert geen Appwrite-runtimegegevens.

## Configuratie

Geheimen staan lokaal in `.env.appwrite.local` in de projectroot. Het bestand
valt onder `*.local` in `.gitignore` en mag nooit worden gecommit.

## Gebruik

```powershell
python scripts/appwrite/migrate_pocketbase.py inspect
python scripts/appwrite/migrate_pocketbase.py provision
python scripts/appwrite/migrate_pocketbase.py users
python scripts/appwrite/migrate_pocketbase.py data
python scripts/appwrite/migrate_pocketbase.py files
python scripts/appwrite/migrate_pocketbase.py verify
python scripts/appwrite/sync_live_pocketbase.py
```

`all` voert alle stappen in deze volgorde uit. Iedere stap kan veilig opnieuw
worden gestart. Het eindrapport staat naast de uitgepakte snapshot als
`appwrite-migration-report.json`.

De wachtwoordhashes komen uitsluitend uit de bevroren SQLite-momentopname,
omdat PocketBase ze niet via de beheer-API blootstelt. De incrementele sync
laat de reeds gecontroleerde Appwrite-gebruikers daarom intact.

