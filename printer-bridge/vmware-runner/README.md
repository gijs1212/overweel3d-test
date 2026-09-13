# Overweel3D VM-agent 2.3.2

Deze map bevat uitsluitend de agent die **in de Windows-VM** draait. Een aparte
runner of statusscript op de normale Windows-host is niet meer nodig.

## Benodigd in de VM

- Python 3.11 of nieuwer;
- Bambu Connect, aangemeld bij het juiste Bambu-account;
- bereik tot Home Assistant-poort 8766 en tot de printer-FTPS-poort 990;
- `pip install -r requirements-vm.txt`.

Kopieer `vm-guest.example.json` naar `vm-guest.json`. De belangrijkste waarden
zijn:

```json
{
  "addon_url": "http://homeassistant.local:8766",
  "addon_token": "Gijs1212!"
}
```

Met `automatic_ui_detection: true` herkent de agent zelf de printerkeuzelijst,
AMS-keuzes, kalibratieopties en verzendknoppen. U hoeft daarvoor niets aan te
klikken of selectors in te vullen. De selectors in het configuratiebestand zijn
alleen een fallback voor een toekomstige Connect-versie met een afwijkende UI.
De keuze **Printbed vooraf levelen** wordt per wachtrij-item automatisch in
Bambu Connect overgenomen. Flow- en vibratiekalibratie blijven uit.

De agent gebruikt eerst Bambu Labs officiële
`bambu-connect://import-file`-koppeling om het tijdelijke bestand te importeren.
Daarna kiest hij printer en AMS-slots en bedient hij de verzenddialoog via
Windows UI Automation. Bij een selectorfout worden de gevonden titels,
`auto_id`-waarden en controltypes automatisch in `vm-guest.log` geschreven.
Start handmatig met:

```powershell
C:\Program Files\Python314\python.exe C:\Overweel3D\bambu_vm_guest.py --agent --config C:\Overweel3D\vm-guest.json
```

Plaats voor automatisch starten een snelkoppeling naar
`C:\Overweel3D\start_overweel3d_vm_agent.cmd` in `shell:startup` van de VM.
De agent blijft zichtbaar en schrijft tevens `C:\Overweel3D\vm-guest.log`.

## Werking

De agent meldt iedere paar seconden rechtstreeks aan de add-on dat de VM gereed
is. Zodra een taak is gereserveerd, haalt hij taak, printergegevens en
AMS-toewijzing op. Het gekozen SD-kaartbestand wordt tijdelijk via FTPS geladen,
in Bambu Connect geopend en met de gekozen AMS-slots verzonden. Daarna bewaakt de
add-on de Bambu Cloud-status. De tijdelijke download wordt automatisch verwijderd.

`import_settle_seconds` bepaalt hoelang Connect na het openen krijgt om een groot
bestand te verwerken voordat de bediening begint. Verhoog deze waarde wanneer de
verzenddialoog in de VM nog niet volledig geladen is.

Poort 8766 en het token zijn alleen bedoeld voor het lokale netwerk. Publiceer
deze API niet naar internet.

## Willekeurige printtest

`test_random_printer_file.py` vraagt printergegevens aan de lokale add-on, scant
de ingestelde FTPS-mappen en kiest willekeurig een `.gcode`, `.gcode.3mf` of
`.3mf`. Het gekozen pad, plaatnummer en de AMS-keuze worden getoond. Pas nadat u
exact `PRINT` typt, opent het script het bestand in Bambu Connect en drukt het op
de ingestelde verzend- en bevestigingsknoppen.

Start gemakkelijk met `start_random_print_test.cmd`, of vanuit PowerShell:

```powershell
C:\Users\TEMP.test\AppData\Local\Python\bin\python.exe C:\Overweel3D\test_random_printer_file.py
```

Handige opties zijn `--search photowall`, meerdere keren `--root /map`, en
`--ams 0,1`. `--yes` slaat de veiligheidsbevestiging over en hoort alleen bij
bewuste, bewaakte tests gebruikt te worden. Het logbestand heet
`random-vm-print-test.log`.
