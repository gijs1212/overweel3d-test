# Installatie en printautomatisering

Versie **1.22.0** gebruikt PocketBase voor status, wachtrij en handmatige Bambu-loginverzoeken. Voor parsen wordt het volledige `.3mf`-bestand gedownload. De parser telt naast ingesloten G-code ook gevulde Bambu-plaatmetadata, werkt daarna het platenaantal in de website bij en bewaart dat resultaat bij volgende scans. Virtueel gegroepeerde losse G-codeplaten worden allemaal volledig gedownload en samengevoegd tot één platen- en kleurenkeuze in de website. Tijdelijke bestanden worden daarna verwijderd.
De Home Assistant-add-on bestuurt de bestaande Home Assistant-entiteiten zelf en
de Windows-VM-agent praat rechtstreeks met de add-on via poort 8766.

1. Kopieer de map `overweel3d_bambu` naar `/addons` op Home Assistant.
2. Open **Instellingen → Apps → Appwinkel**.
3. Kies rechtsboven **⋮ → Controleren op updates**.
4. Installeer of update **Overweel3D Bambu Bridge**.
5. Zet **Start bij opstarten** en **Watchdog** aan.
6. Controleer de configuratie en start de add-on.

## Website en printer koppelen

1. Open **Admin → Printproductie** op de website.
2. Voeg de printer toe en vul IP-adres en lokale toegangscode in voor FTPS.
3. Maak bij de printer een website-koppelcode.
4. Vul in de add-on het Bambu-e-mailadres en de website-koppelcode in.
5. Start de add-on. Vul bij de eerste cloudaanmelding de ontvangen Bambu-e-mailcode
   in, sla op en herstart.

De add-on bewaart sessie- en koppelgegevens in `/config/overweel3d`. Er zijn geen
slicercertificaten nodig. Status en AMS lopen via Bambu Cloud; bestanden worden
via FTPS van de printer gelezen.

## Instellingen voor pc en VM

- `host_pc_ip`: `192.168.2.20`.
- `host_status_interval_seconds`: iedere 60 seconden een statusping voor het
  adminscherm. Deze gecachete status beslist nooit over een printstart.
- `host_online_delay_seconds`: 60 seconden wachten als een verse printping slaagt.
- `host_boot_delay_seconds`: 150 seconden wachten nadat de pc is aangezet en op
  ping reageert.
- `pc_power_on_entity`: `script.pc_aanzetten`.
- `pc_power_off_entity`: `script.pc_en_stekker_uit`.
- `vm_start_entity`: `button.pc_gijs_overweel3d`; dit is de bestaande wisselknop.
- `vm_start_wait_seconds`: maximaal 240 seconden wachten op de VM-agent.
- `vm_ip`: het bewerkbare VM-IP dat verbinding mag maken; standaard `192.168.2.42`.
- `guest_api_port`: `8766`.
- `guest_api_token`: moet exact gelijk zijn aan `addon_token` in `vm-guest.json`.

Publiceer poort 8766 niet naar internet. Sta hem in het lokale netwerk alleen toe
vanaf de VM (`192.168.2.30`).

## VM-agent installeren

De VM-agentversie is **2.3.2** en automatiseert **Bambu Connect** via Bambu Labs
officiële `bambu-connect://import-file`-protocol. Alleen de keuzes in de geopende
Connect-dialoog worden met Windows UI Automation bediend. Printer, AMS-slots,
kalibratieopties en verzendknoppen worden automatisch herkend; handmatig klikken
of vooraf selectors opzoeken is niet nodig.
Per wachtrij-item kan de admin bed-leveling aan- of uitzetten. Deze keuze wordt
automatisch in Connect gezet; andere kalibraties blijven uit.
Als automatische bediening mislukt, een verkeerde print wordt waargenomen of de
startbevestiging uitblijft, stuurt de bridge een eenmalige waarschuwing naar het
adminadres. De pc blijft in dat geval veilig aan.

1. Installeer in de VM Python, Bambu Connect en de pakketten uit
   `requirements-vm.txt`.
2. Kopieer de bestanden uit `overweel3d_vmware_runner.zip` naar
   `C:\Overweel3D`.
3. Kopieer `vm-guest.example.json` naar `vm-guest.json` en stel de zichtbare
   UI-selectors van uw Bambu Connect-versie in.
4. Plaats een snelkoppeling naar `start_overweel3d_vm_agent.cmd` in
   `shell:startup` van de VM. Het venster blijft zichtbaar draaien.

De standaardconfiguratie gebruikt `http://homeassistant.local:8766`. Bij een
netwerk zonder werkende mDNS mag dit worden vervangen door het vaste Home
Assistant-IP met poort 8766.

## Exacte printstroom

Een websiteklik of wijziging van `input_button.volgende_plaat_printen` wordt één
keer verwerkt. De add-on doet altijd een verse ping naar de host-pc:

- bereikbaar: 60 seconden wachten;
- niet bereikbaar: `script.pc_aanzetten` één keer uitvoeren, iedere 5 seconden
  blijven pingen en na het eerste antwoord 150 seconden wachten.

Daarna wacht de add-on op het rechtstreekse gereedsignaal van de VM-agent. Er
wordt niet naar `192.168.2.30` gepingd. Zonder gereedsignaal wordt
`button.pc_gijs_overweel3d` exact één keer uitgevoerd en maximaal 240 seconden
gewacht.

De VM-agent haalt de gereserveerde wachtrijtaak en AMS-toewijzing op, downloadt
het SD-kaartbestand tijdelijk via FTPS en laat Bambu Connect de print verzenden.
Alleen als Bambu Cloud `RUNNING` meldt en zowel bestandsnaam als plaatnummer exact
overeenkomen, zet de add-on de VM-wisselknop eenmaal om. Na 30 seconden wordt
`script.pc_en_stekker_uit` eenmaal uitgevoerd. Bij een fout, mismatch of timeout
blijft de pc aan en gaat het wachtrij-item terug naar `queued`.

## Printwachtrij en scans

In **Printwachtrij** kunt u meerdere startmappen kiezen. **Mappen scannen** werkt
de maplijst bij; **Bestanden nu scannen** doorzoekt de gekozen mappen en nieuwe
submappen. De laatst gevonden output blijft bruikbaar bij een tijdelijke
FTPS-storing. Tijdelijk downloaden voor metadata gebeurt alleen in de add-on en
wordt niet in PocketBase Storage gezet.
