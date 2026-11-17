# Overweel3D Supabase-back-up

Project: `overweel3d-2` (`askbgpdygdiwuocsmsfn`)

Gemaakt op: 13 september 2026

## Inhoud

- `data/`: JSON-export van alle 88 gevonden tabellen in de niet-systeem-schema's, waaronder `public`, `auth`, `storage`, `cron`, `net`, `realtime`, `vault` en `supabase_migrations`.
- `catalog/`: schema's, rollen, extensies, typen, kolommen, constraints, indexen, views, databasefuncties, triggers, RLS-policies, sequences, grants en Realtime-publicaties.
- `database-functions.sql`: SQL-definities van alle 159 niet-systeem-databasefuncties.
- `edge-functions/`: broncode en deploymentmetadata van alle 27 actieve Edge Functions zoals ze op het moment van export waren gedeployd.
- `source-snapshot/`: lokale Supabase-migraties, Edge Functions en `config.toml`.

## Belangrijk

Dit is een uitgebreide logische projectkopie via de beveiligde Supabase-beheerverbinding. De databasegegevens, Auth-tabellen, Storage-metadata en databasecode zijn opgenomen.

De binaire inhoud van de 69 bestanden in Supabase Storage is niet onderdeel van PostgreSQL en kan niet via een database-export worden opgehaald. De metadata ervan staat wel in `data/storage__objects.json`. Voor een losse kopie van die private bestanden is een service-role key of een door Supabase geautoriseerde Storage-download nodig.

Ook door Supabase beheerde platformgeheimen (Edge Function secrets, SMTP/OAuth-providergeheimen en databasewachtwoorden) zijn om veiligheidsredenen niet uitleesbaar en staan niet in een export. De code die die namen gebruikt is wel opgenomen.

Bewaar deze map privé: de export bevat persoonsgegevens en authenticatiegegevens. `private-backups/` staat daarom in `.gitignore`.
