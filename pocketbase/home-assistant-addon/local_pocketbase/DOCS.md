# PocketBase voor Overweel3D

Deze app gebruikt blijvende PocketBase-data uit `/data` en laadt JavaScript-hooks uit:

```text
/share/pocketbase/pb_hooks
```

De routefile en bijbehorende kernmodule zitten in het apppakket en worden bij
het starten automatisch in deze map geplaatst of bijgewerkt. Bij het bijwerken
bewaart de app de vorige versies met de extensie `.backup`.

Controle na de start:

```text
https://api.gijsoverweel.nl/api/overweel3d/health
```

Bij upgrades zoekt de app naar bestaande `data.db`-bestanden in `/data` en
`/share/pocketbase`. De grootste bestaande database wordt gekozen en de keuze
wordt blijvend vastgelegd. Dit voorkomt dat een lege database na een wijziging
van het opslagpad wordt geopend.

Het antwoord hoort `"ok": true` en hookversie `1.3.16` te bevatten. Printerkoppelinstellingen worden zonder ontbrekende `created`- of `updated`-sorteervelden gelezen, zodat IP en toegangscode na een bridgeherstart opnieuw beschikbaar zijn. AMS-rollen worden op printer, AMS-eenheid en vaknummer ontdubbeld; bestaande dubbele vakrecords worden bij de volgende printerstatusupdate verwijderd. Volledig geparste plaatmetadata en downloadstatus blijven behouden bij volgende SD-scans zolang het bronbestand niet is gewijzigd. De VM-status wordt veilig met nieuwe printerstatus samengevoegd.

De RPC `request_printer_full_refresh` zet het map- en bestandsverzoek atomair
klaar. De bridge verwerkt deze altijd in de volgorde status/AMS, mappen en
bestanden.
