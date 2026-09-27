# PocketBase voor Overweel3D

Deze app gebruikt blijvende PocketBase-data uit `/data` en installeert de hooks
automatisch in `/share/pocketbase/pb_hooks`.

Controle na de start:

```text
https://api.gijsoverweel.nl/api/overweel3d/health
```

Het antwoord hoort `"ok": true` en hookversie **1.4.0** te bevatten.

Versie 1.4.0 bevat geen printwachtrij-, FTPS-, pc- of VM-besturing meer. De
printerroutes verwerken alleen status, AMS, filamentvoorraad, Bambu-aanmelding
en koppeling van actieve prints aan bestelplaten. Iedere printer en ieder AMS-vak
blijft afzonderlijk opgeslagen; dubbele meldingen voor hetzelfde vak worden
samengevoegd.

Bij upgrades zoekt de app naar bestaande `data.db`-bestanden in `/data` en
`/share/pocketbase`. De grootste bestaande database wordt gekozen en de keuze
wordt blijvend vastgelegd.
