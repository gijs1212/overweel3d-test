# Overweel3D Bambu Bridge

Verbindt Bambu-status veilig met de afgeschermde Overweel3D-productiepagina via
één eenmalige website-koppelcode. Bridge-tokens worden automatisch hersteld.

Lokale Home Assistant-app voor de Overweel3D Bambu P1S-cloudkoppeling. De app
leest printnaam, plaatnummer, voortgang, temperaturen en AMS-status en stuurt
deze naar Overweel3D en voert de beveiligde printwachtrij uit. Met het lokale
IP-adres en de toegangscode leest hij via FTPS automatisch 3MF-bestanden van de
SD-kaart, zonder slicercertificaten en zonder de cloudmodus uit te schakelen.
Alle instellingen, sessies en koppeltokens worden blijvend in
`/config/overweel3d` opgeslagen, ook bij een herinstallatie van de add-on.

Versie 1.29.0 synchroniseert host-pc, VM, printerstatus en AMS-rollen via de knop **Alles verversen** op de website. Tijdelijke downloads worden pas voltooid gemeld nadat de bridge het echte cachebestand heeft gecontroleerd en het volledige bestand opnieuw heeft geparseerd; het bijgewerkte aantal platen verschijnt daarna direct op ieder apparaat. De live MQTT-verbinding blijft intern beschikbaar voor veilige printbevestiging, maar schrijft niet meer op een timer naar de database. AMS-vakken gebruiken één stabiele sleutel, zodat rollen niet meer dubbel verschijnen. Na een bevestigde VM-stop wordt de host uitsluitend uitgezet wanneer de add-on deze voor dezelfde printactie zelf heeft aangezet.

De handmatige knop **Alles verversen** voert één geordende cyclus uit: status en
AMS, daarna mappen, daarna printbestanden. Er draait hiervoor geen
websiteververstimer.
Printklikken gebruiken altijd een verse ping en sturen de taak rechtstreeks naar
VM-agent 2.5.0 via de lokale, beveiligde API op poort 8766. Er draait geen
Windows-host-runner meer.
Het toegestane VM-IP is rechtstreeks bewerkbaar in de add-onconfiguratie en staat
standaard op `192.168.2.42`.

Als de VM-agent een bestand, printer, AMS-keuze of Connect-knop niet automatisch
kan verwerken, ontvangt de admin een e-mail met bestand, plaat en foutmelding.

Een aparte Bambu Cloud-aanwezigheidscontrole houdt `last_seen_at` ook tijdens een
korte MQTT-herverbinding actueel, zonder actieve bestands- of plaatgegevens te
overschrijven.

Zie `DOCS.md` voor de installatie en eerste aanmelding.
