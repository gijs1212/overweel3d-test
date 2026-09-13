# Overweel3D P1S bridge

## Rechtstreekse VM-agent voor officiële Bambu Connect

De VM-agent laat de HA-add-on een Windows-pc en VM alleen voor
een wachtrijprint activeren. De bestaande
`input_button.volgende_plaat_printen` is de trigger. Installatie en alle nog in
te vullen paden, adressen en UI-selectoren staan in
[`vmware-runner/README.md`](vmware-runner/README.md).

## Windows Bambu Cloud-debugtest

`windows_cloud_print_debug.py` maakt bij iedere uitvoering een gedateerd
logbestand. Zonder `--send` wordt alleen ingelogd en de JSON gecontroleerd.
Een echte start vereist zowel `--send` als het interactief typen van `PRINT`.

```powershell
cd printer-bridge
python windows_cloud_print_debug.py --email "naam@example.com" --serial "01P..." --file "model.gcode.3mf" --plate 1 --ams 0 --send
```

De logs verschijnen standaard in `printer-bridge/logs`. Het Bambu-token wordt
niet gelogd en wordt in `%LOCALAPPDATA%\Overweel3D` hergebruikt.

## Windows SD-kaarttest via FTPS en Bambu Connect

`windows_bambu_connect_test.py` verbindt standaard via implicit FTPS met de P1S,
scant de SD-kaart recursief en laat een `.3mf`, `.gcode.3mf` of `.gcode` kiezen.
Het gekozen bestand wordt tijdelijk naar Windows gedownload en vervolgens via
het `bambu-connect://`-protocol in de geïnstalleerde Bambu Connect-app geopend.

```powershell
cd printer-bridge
python windows_bambu_connect_test.py
```

Zoeken of vanuit één SD-kaartmap beginnen:

```powershell
python windows_bambu_connect_test.py --search photowall
python windows_bambu_connect_test.py --ftps-root /cache
```

Een ander IP-adres, gebruiker of poort kan met `--ip`, `--ftps-user` en
`--ftps-port` worden opgegeven. De laatst gebruikte FTPS-instellingen staan in
`%LOCALAPPDATA%\Overweel3D\bambu-connect-test-session.json`. Het tijdelijke
printbestand wordt verwijderd nadat de gebruiker bevestigt dat Bambu Connect
het heeft ingelezen.

## Officiële Bambu-partnercredentials testen

Vul `cert.json` volgens het aanwezige labelsjabloon. Ondanks de bestandsnaam is
dit bewust een eenvoudig label-formaat en geen strikt JSON-object:

```text
privatekey:
-----BEGIN PRIVATE KEY-----
...
-----END PRIVATE KEY-----
cert:
-----BEGIN CERTIFICATE-----
...
-----END CERTIFICATE-----
crl:
-----BEGIN X509 CRL-----
...
-----END X509 CRL-----
```

`crl:` mag leeg blijven wanneer Bambu geen CRL heeft verstrekt. De ingebouwde
configuratie wijst standaard naar `printer-bridge/cert.json`. Voor een bestand
buiten Git kan dezelfde ene configuratievariabele worden gebruikt:

```powershell
$env:BAMBU_PARTNER_CREDENTIALS_FILE="C:\veilige-map\cert.json"
python windows_bambu_connect_test.py --source cloud --password-login
```

De Cloud-test gebruikt het certificaat vervolgens voor mTLS. Certificaat- en
sleutelmateriaal worden niet gelogd. Een officiële partner-printendpoint kan
pas worden gekoppeld wanneer de bij de credentials verstrekte endpoint- en
payloadspecificatie bekend is; de tool verzint daarvoor geen private API.

## Bambu-account (aanbevolen, geen Developer Mode)

Voeg de printer in **Admin → Printproductie** toe. Vul IP-adres en lokale
toegangscode in voor automatisch SD-kaart uitlezen en maak een eenmalige
website-koppelcode. De printer blijft in cloudmodus en slicercertificaten zijn niet nodig. In de Home Assistant-app vult u alleen het Bambu-e-mailadres,
de Bambu-e-mailcode, de website-koppelcode en de volgende-plaatknop in.
Alle Docker-bestanden staan op de Home Assistant-host in
`/mnt/data/supervisor/share/overweel3d`. Printer-id, serienummer en geheime
website-tokens worden door de eenmalige koppelcode opgehaald en intern bewaard.
Account, e-mailcode, website-koppelcode, sessie, printergegevens, tokens en
certificaten worden blijvend in `/config/overweel3d` opgeslagen. Bestaande
bestanden uit `/data` worden bij de eerste start automatisch gemigreerd.

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
Met IP-adres en toegangscode leest de bridge de SD-kaart automatisch via FTPS.
Hij hergebruikt daarvoor de TLS-sessie van de beveiligde besturingsverbinding;
er is geen Bambu-clientcertificaat nodig. Handmatige 3MF-registratie blijft als
reserveoptie beschikbaar wanneer lokale toegang tijdelijk niet bereikbaar is.
Omdat Bambu geen ondersteunde openbare consumenten-Cloud-API documenteert, kan een
toekomstige wijziging door Bambu een update van deze bridge vereisen.

De website-koppelcode is vijftien minuten geldig en eenmalig bruikbaar. De bridge
wisselt hem in voor de printergegevens en slaat deze intern op. Bij `HTTP Error
403: Forbidden` vernieuwt de bridge het toegangstoken automatisch.

Een herkende bestandsnaam en plaat worden alleen als koppelvoorstel getoond. Een
admin moet de bestelling en plaat expliciet bevestigen voordat die printuitvoering
mag meetellen. Wanneer een plaat meerdere keren nodig is, wordt deze bevestiging
voor iedere uitvoering opnieuw gevraagd.

Een druk op `input_button.volgende_plaat_printen` is een handmatige
startbevestiging. De Home Assistant-app ziet de nieuwe tijdstempel van de knop en
stuurt direct een beveiligde aanvraag naar de website om het eerstvolgende actieve
wachtrij-item te starten. De printer moet vrij zijn en alle gekozen AMS-kleuren
moeten aanwezig zijn. Bed leveling, flowkalibratie en vibratiekalibratie staan uit.

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
WEBSITE_API_URL=https://api.gijsoverweel.nl/api/overweel3d
OVERWEEL_PRINTER_ID=...
OVERWEEL_BRIDGE_TOKEN=...
```

5. Start op een pc, NAS of Raspberry Pi met Python 3.11+: `python p1s_bridge.py`.

De access code en het volledige serienummer blijven lokaal. Alleen genormaliseerde printer- en AMS-status gaat via TLS naar PocketBase.
