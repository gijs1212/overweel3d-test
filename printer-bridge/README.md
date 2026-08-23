# Overweel3D P1S bridge

## Bambu-account (aanbevolen, geen Developer Mode)

Voeg de printer in **Admin → Printproductie** toe met “Bambu Connect-account”.
Alle Docker-bestanden staan op de Home Assistant-host in
`/mnt/data/supervisor/share/overweel3d`. De accountgegevens, printergegevens,
Supabase-koppeling en cloudregio staan op verzoek rechtstreeks bovenaan
`bambu_cloud_bridge.py`; er is geen `.env`-bestand nodig.

Bouw daarna de container en sla eenmalig de Bambu-sessie op:

```sh
cd /mnt/data/supervisor/share/overweel3d
mkdir -p data
chown 10001:10001 data
chmod 700 data
docker compose build
docker compose run --rm bambu-bridge python /app/bambu_cloud_bridge.py --login-only
```

De container vraagt interactief om de e-mailcode die Bambu verstuurt. Het
toegangstoken wordt alleen in
`/mnt/data/supervisor/share/overweel3d/data/bambu-session.json` opgeslagen;
uw wachtwoord wordt nooit gevraagd of opgeslagen. Start de bridge daarna op de
achtergrond:

```sh
docker compose up -d
docker compose logs -f bambu-bridge
```

Na een herstart van Windows, Docker, NAS of Raspberry Pi start de container dankzij
`restart: unless-stopped` automatisch opnieuw. Stoppen kan met `docker compose down`.
Laat de map `data` staan om ingelogd te blijven. Verwijder alleen
`data/bambu-session.json` wanneer u de opgeslagen Bambu-sessie bewust wilt wissen.

De bridge leest printnaam, actieve plaat, voortgang, temperaturen en AMS-status.
Omdat Bambu geen ondersteunde openbare consumenten-Cloud-API documenteert, kan een
toekomstige wijziging door Bambu een update van deze bridge vereisen.

Krijgt u `HTTP Error 403: Forbidden`, dan hoort het vaste token niet meer bij de
printerregistratie op de website. Klik in **Admin → Printproductie** bij de printer
op **Nieuw bridge-token**, vervang daarna de waarde van `BRIDGE_TOKEN` bovenaan
`bambu_cloud_bridge.py` en voer `docker compose build --no-cache` en
`docker compose up -d --force-recreate` uit. Het oude token wordt direct ongeldig
en het nieuwe wordt maar één keer getoond.

Een herkende bestandsnaam en plaat worden alleen als koppelvoorstel getoond. Een
admin moet de bestelling en plaat expliciet bevestigen voordat die printuitvoering
mag meetellen. Wanneer een plaat meerdere keren nodig is, wordt deze bevestiging
voor iedere uitvoering opnieuw gevraagd.

## Lokale LAN-bridge (Developer Mode)

Deze lokale bridge leest uitsluitend statusinformatie uit de P1S. De website kan geen print starten, pauzeren of stoppen.

1. Geef de P1S een vast IP-adres in de router.
2. Schakel op de printer **LAN Mode / Developer Mode** in en noteer de LAN access code.
3. Voeg de printer toe via **Admin → Printproductie** en kopieer de eenmalige bridgegegevens.
4. Stel deze omgevingsvariabelen in:

```text
BAMBU_HOST=192.168.1.50
BAMBU_ACCESS_CODE=12345678
BAMBU_SERIAL=01P...
SUPABASE_URL=https://askbgpdygdiwuocsmsfn.supabase.co
OVERWEEL_PRINTER_ID=...
OVERWEEL_BRIDGE_TOKEN=...
```

5. Start op een pc, NAS of Raspberry Pi met Python 3.11+: `python p1s_bridge.py`.

De access code en het volledige serienummer blijven lokaal. Alleen genormaliseerde printer- en AMS-status gaat via TLS naar Supabase.
