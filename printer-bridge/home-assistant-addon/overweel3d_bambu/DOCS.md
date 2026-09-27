# Installatie

Versie **1.34.0** is een status- en AMS-bridge. Er is geen printwachtrij en er
worden geen pc's, VM's of prints gestart.

1. Kopieer de map `overweel3d_bambu` naar de lokale Home Assistant-apps-map.
2. Open **Instellingen → Apps → Appwinkel** en kies **Controleren op updates**.
3. Installeer of update **Overweel3D Bambu Bridge**.
4. Zet **Start bij opstarten** en **Watchdog** aan.
5. Vul `bambu_account` en de permanente `website_pairing_code` in.
6. Vul `email_code` alleen in wanneer Bambu een nieuwe aanmelding verlangt.

De app bewaart sessie- en koppelgegevens in `/config/overweel3d`. Een herstart
of herinstallatie maakt de website-koppelcode niet ongeldig.

## Meerdere printers

Voeg iedere printer in de website apart toe en maak per printer een koppelcode.
Draai per printer een eigen appinstantie/configuratie, zodat serienummer,
koppeltoken, status en AMS-vakken gescheiden blijven.

## Wat wordt gesynchroniseerd

- online-, idle-, print-, pauze- en foutstatus;
- bestandsnaam, plaatnummer, voortgang, lagen en resterende tijd;
- nozzle en temperaturen;
- elk AMS-vak, inclusief materiaal, kleur en adminvoorraad;
- actieve prints als voorstel voor een bestaande plaatkoppeling.

De openbare kleurengalerij leest geen rolgewicht. Gewichten en handmatige
voorraadcorrecties blijven uitsluitend in het admin-dashboard zichtbaar.

Via **Refresh AMS** vraagt de website meteen een nieuwe AMS-status op. Via
**Nieuwe Bambu-code** kan de admin bewust een nieuwe e-mailcode aanvragen.

