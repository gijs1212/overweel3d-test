# Overweel3D Bambu Bridge

De bridge verbindt een of meer Bambu-printers via Bambu Cloud met de
Overweel3D-productiepagina. Versie **1.34.0** ondersteunt uitsluitend:

- live printerstatus, actieve bestandsnaam, plaat en voortgang;
- nozzle-, temperatuur- en AMS-informatie;
- automatische synchronisatie van AMS-rollen naar het admin-filamentbeheer;
- het herkennen van een actieve print en voorstellen om deze aan een plaat van
  een open bestelling te koppelen;
- handmatig verversen van de AMS en een nieuwe Bambu-inlogcode aanvragen;
- de bestaande ventilatorautomatisering en Bambu-kleurcatalogus.

De printwachtrij, SD/FTPS-scans, pc-besturing, VMware-koppeling en VM-agent zijn
verwijderd. De bridge start nooit een print en schakelt geen pc of VM aan of uit.

## Home Assistant installeren

Gebruik de lokale appmap `home-assistant-addon/overweel3d_bambu`. Kopieer of
synchroniseer die map naar de lokale apps-map van Home Assistant en kies daarna
in de appwinkel **Controleren op updates**.

1. Voeg iedere printer apart toe via **Admin → Printers & plaatkoppeling**.
2. Maak per printer een website-koppelcode.
3. Installeer voor iedere printer een afzonderlijke appinstantie en vul daar
   het Bambu-e-mailadres en de bijbehorende website-koppelcode in.
4. Vul bij een nieuwe Bambu-aanmelding de ontvangen e-mailcode in en herstart de
   app.

Koppeltokens en de Bambu-sessie blijven in `/config/overweel3d` bewaard. Er zijn
geen slicercertificaten, lokaal printer-IP of lokale toegangscode nodig.

AMS-gewichten zijn alleen zichtbaar in het admin-filamentbeheer. De openbare
kleurengalerij toont nooit hoeveel filament nog op een rol zit.

