# Overweel3D Bambu Bridge

Versie **1.34.0** leest via Bambu Cloud de printerstatus, actieve print, nozzle,
temperaturen en AMS-rollen uit. De app stuurt die gegevens naar de afgeschermde
Overweel3D-productiepagina en werkt het admin-filamentbeheer automatisch bij.

Actieve prints kunnen in de website nog steeds aan een bestelling en plaat
worden gekoppeld. De admin keurt iedere getelde uitvoering zelf goed.

Printwachtrij, FTPS/SD-kaartscan, pc- en VM-besturing en de VM-agent zijn niet
meer aanwezig. De app verstuurt geen printopdrachten.

Alle sessie- en koppelgegevens blijven in `/config/overweel3d` bewaard. Zie
`DOCS.md` voor installatie en koppeling.

