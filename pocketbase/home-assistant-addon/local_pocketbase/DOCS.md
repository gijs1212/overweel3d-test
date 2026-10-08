# PocketBase voor Overweel3D

Deze app gebruikt blijvende PocketBase-data uit `/data` en installeert de hooks
automatisch in `/share/pocketbase/pb_hooks`.

Controle na de start:

```text
https://api.gijsoverweel.nl/api/overweel3d/health
```

Het antwoord hoort `"ok": true` en hookversie **1.13.0** te bevatten.

Versie 1.4.0 bevat geen printwachtrij-, FTPS-, pc- of VM-besturing meer. De
printerroutes verwerken alleen status, AMS, filamentvoorraad, Bambu-aanmelding
en koppeling van actieve prints aan bestelplaten. Iedere printer en ieder AMS-vak
blijft afzonderlijk opgeslagen; dubbele meldingen voor hetzelfde vak worden
samengevoegd.

Versie 1.5.0 installeert ook automatisch de vier collecties en beveiligde
routes voor Overweel3D Social Publisher. Maak de interne koppelsleutel
na installatie via **Admin → Marketing → Social Publisher**. PocketBase slaat
geen Facebook- of Instagram-wachtwoorden op.

Versie 1.7.0 ondersteunt directe handmatige en willekeurige Facebook- en Instagram-posts en verwijdert bestaande X-gegevens.
De Social Publisher controleert bij Facebookberichten expliciet dat de pagina
**Overweel3D** als bestemming zichtbaar is voordat hij publiceert.

Versie 1.8.0 voegt een echte accountcontrole toe. De Social Publisher opent de
Meta-composer, controleert Facebook en Instagram afzonderlijk en bewaart de
accountlinks, controlestappen en het controlescreenshot voor het adminscherm.

Versie 1.9.0 bewaart iedere 30 seconden een heartbeat van de Social Publisher.
Een verbroken verbinding pauzeert de automatisering niet; de volgende
publisherronde probeert de verbinding opnieuw.

Versie 1.10.3 koppelt de Social Publisher vanuit het website-adminscherm. De
container heeft geen vooraf ingevulde integratiesleutel meer nodig.

Versie 1.13.0 ondersteunt de officiële Meta Graph API, het handmatig inplannen van bestaande producten en kleuren, gegenereerde PNG-kleurafbeeldingen en een voorspelling van de volgende publicatie. Facebook en Instagram
krijgen afzonderlijke publicatieresultaten. Per wachtrijtaak maakt PocketBase
tijdelijke HTTPS-links voor uitsluitend de geselecteerde afbeeldingen; de
integratiesleutel wordt niet in die links verwerkt. De website kan de API-
accountcontrole van Social Publisher 2.2.0 tonen.

Bij upgrades zoekt de app naar bestaande `data.db`-bestanden in `/data` en
`/share/pocketbase`. De grootste bestaande database wordt gekozen en de keuze
wordt blijvend vastgelegd.
