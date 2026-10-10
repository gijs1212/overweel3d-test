# Overweel3D Social Publisher 2.8.0

De container haalt socialmediataakjes uit PocketBase en publiceert afzonderlijk op de Facebookpagina Overweel3D en het gekoppelde professionele Instagram-account via de officiële Meta Graph API. Er wordt niet meer via de Meta Business Suite-browser gepubliceerd. Een Facebook-succes markeert Instagram nooit automatisch als geslaagd.

## Installatie

De uitgepakte map `social-publisher/` is de permanente distributie voor GoodSync. De bestaande Docker-volume `overweel3d_social_publisher_data` bewaart de PocketBase-koppeling en mag niet met `docker compose down -v` worden verwijderd.

1. Werk eerst de PocketBase-app/hook bij met de bestanden uit `pocketbase/home-assistant-addon/local_pocketbase/`. Versie **1.19.0** voegt de opgeslagen keuze toe voor één Facebook-fotobericht of losse berichten.
2. Kopieer `.env.example` naar `.env` op de Docker-host en vul de twee lokale wachtwoorden in. De drie Meta-waarden `META_PAGE_ACCESS_TOKEN`, `META_PAGE_ID` en `META_INSTAGRAM_USER_ID` mogen in `.env`, maar kunnen ook na de eerste start op het wachtwoordbeveiligde lokale containerdashboard worden opgeslagen. Dat bewaart ze met beperkte bestandsrechten in de blijvende Docker-volume en voorkomt opname in Git. Gebruik dat dashboard uitsluitend vanaf het vertrouwde lokale netwerk: de poort 8787 gebruikt standaard HTTP zonder TLS.
3. Voer in de publishermap `sh start-or-update.sh` uit. Deze opdracht bouwt versie **2.8.0** uit de actuele map en start de container opnieuw. De image bevat FFmpeg voor omzetting van productvideo's naar MP4.

Productmedia: Instagram publiceert foto’s en video’s samen als carrousel. Facebook plaatst iedere foto of video als afzonderlijk paginabericht, omdat de eerdere samengestelde Facebook-fotopost bij Meta een HTTP 500 gaf. De publisher registreert ieder geslaagd Facebook-bericht meteen, zodat een herpoging alleen resterende media verwerkt. Voor automatische video-publicatie geldt een limiet van 200 MB voor de bron en 20 MB na MP4-omzetting; overschrijding levert een foutmelding op in de wachtrij.
4. Open `http://<docker-host>:8787`, log in als `admin` met `CONTROL_PASSWORD`, voer zo nodig de Meta-token en IDs in en herstart de container. Koppel daarna de container op `/admin/social` met de koppelcode. De PocketBase-integratiesleutel blijft apart van de Meta-token.
5. Klik op de website op **API-verbinding testen**. Dit controleert met de token de pagina, de Instagram-koppeling en de accountnamen, zonder een bericht te publiceren. Gebruik eerst de droogloopmodus; zet deze pas uit na een gecontroleerde test.

Onder **Wachtrij** zet **Bestaande catalogus inplannen** alle actieve producten en kleuren eenmalig in de backfill. De selectie is willekeurig en start hoogstens één backfillbericht per twee uur. Een product zonder opgeslagen foto blijft zichtbaar als `waiting_for_media`; een kleur met geldige hexcode krijgt automatisch een vierkante PNG met die kleur en de code erop. De twee-dagelijkse uitlichting wacht totdat de backfill afgehandeld of geannuleerd is. Nieuwe artikelen en handmatige berichten behouden voorrang.

Bij **Eigen tekst** worden gekozen foto's direct geüpload, met een zichtbare bestandslijst en voorbeeld. Pas nadat de upload bevestigd is kan het bericht worden ingepland. De Social Publisher haalt de bronbestanden via de beveiligde PocketBase-mediafunctie op, zet ze tijdelijk om naar JPEG en controleert de publieke bestands-URL zonder aanmeldtoken voordat Meta die krijgt. Een ontbrekend bestand of een niet-JPEG-respons levert meteen een gerichte fout op. De oorspronkelijke bestandsgegevens blijven in PocketBase.

Voor Instagram moet PocketBase de tijdelijke media-URL onder `https://api.gijsoverweel.nl` kunnen aanbieden, zodat Meta de afbeelding kan ophalen. De URL bevat een willekeurige, twee uur geldige afbeeldingstoegang voor uitsluitend de media van die ene taak; de PocketBase-integratiesleutel en Meta-token staan er niet in. Controleer dat de openbare PocketBase-URL via HTTPS bereikbaar is.

De container stuurt elke 30 seconden een heartbeat. Een tijdelijke verbindingsfout pauzeert de automatisering niet. Een onzekere uitkomst van een publicatie wordt `manual_attention` en nooit blind opnieuw geplaatst. Facebook en Instagram hebben eigen resultaten, foutmeldingen en pogingen.

Het noVNC-scherm en de oude browsersessies kunnen nog aanwezig zijn in de bestaande Docker-volume, maar zijn niet meer nodig voor publiceren of de accountcontrole. De lokale dashboardpagina blijft voor logs en koppeling beschikbaar.
