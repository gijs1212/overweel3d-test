# PocketBase voor Overweel3D

Deze app gebruikt blijvende PocketBase-data uit `/data` en installeert de hooks
automatisch in `/share/pocketbase/pb_hooks`.

Controle na de start:

```text
https://api.gijsoverweel.nl/api/overweel3d/health
```

Het antwoord hoort `"ok": true` en hookversie **1.17.0** te bevatten.

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

Versie 1.17.0 laat de Social Publisher afbeeldingsbronnen via de beveiligde mediafunctie lezen. Na omzetting naar JPEG krijgt Meta een rechtstreekse PocketBase-bestands-URL. Nieuwe taken gebruiken geen `public-media`-grant meer. De oude grant-route blijft alleen voor eerder geclaimde taken bestaan.

Versie 1.16.9 geeft iedere te publiceren afbeelding een afzonderlijk, gehasht en tijdelijk mediatoegangsbewijs. Media-indexen worden intern 1-gebaseerd opgeslagen, omdat PocketBase de waarde 0 afwijst voor een verplicht numeriek veld. Daardoor stopt de eerste afbeelding niet meer met HTTP 400. De mediaserver hangt niet meer af van het taak-JSON, de algemene koppelsleutel of een van de instellingenrecords. De migratie ruimt foutief aangemaakte dubbele Social Publisher-instellingen op en verlopen mediatoegangsbewijzen worden automatisch verwijderd. De versie ondersteunt ook automatische wachtrijretentie: geannuleerde taken worden na vijf minuten verwijderd en afgeronde taken na één uur. Actieve, wachtende en opnieuw te proberen taken blijven staan totdat ze afgerond of handmatig verwijderd zijn. De volgende productuitlichting staat vooraf in de wachtrij; na publicatie wordt meteen een nieuw product voor twee dagen later gekozen. De admin kan alle taken ongeacht hun status direct annuleren en verwijderen. Facebook en Instagram
krijgen afzonderlijke publicatieresultaten. Per wachtrijtaak maakt PocketBase
tijdelijke HTTPS-links voor uitsluitend de geselecteerde afbeeldingen; de
integratiesleutel wordt niet in die links verwerkt. De website kan de API-
accountcontrole van Social Publisher 2.5.1 tonen. Een admin kan een taak met voorrang
laten publiceren; PocketBase wekt de gekoppelde container via een beveiligd
lokaal endpoint. Als dit wekverzoek niet lukt, verwerkt de gewone poll de taak.

Bij upgrades zoekt de app naar bestaande `data.db`-bestanden in `/data` en
`/share/pocketbase`. De grootste bestaande database wordt gekozen en de keuze
wordt blijvend vastgelegd.
