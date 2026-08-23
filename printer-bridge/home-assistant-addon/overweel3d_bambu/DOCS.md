# Installatie

1. Kopieer de volledige map `overweel3d_bambu` naar `/addons` op Home Assistant.
2. Open **Instellingen → Apps → Appwinkel**.
3. Kies rechtsboven **⋮ → Controleren op updates**.
4. Open **Overweel3D Bambu Bridge** en kies **Installeren**.
5. Zet **Start bij opstarten** en **Watchdog** aan.
6. Kies **Starten** en open daarna **Logboek**.

# Eerste Bambu-aanmelding

Bij de eerste start stuurt Bambu een e-mailcode naar het vast ingestelde
Bambu-account. De app blijft wachten en vermeldt dit in het logboek.

1. Open het tabblad **Configuratie** van de app.
2. Vul de ontvangen code in bij **E-mailcode**.
3. Kies **Opslaan**.
4. Als de app niet vanzelf doorgaat, kies eenmaal **Herstarten**.

Na een succesvolle aanmelding wordt de Bambu-sessie persistent in de interne
`/data`-map van de app opgeslagen. De e-mailcode wordt daarna niet opnieuw
gebruikt zolang de sessie geldig is.

# Opnieuw aanmelden

Als de Bambu-sessie verloopt, stuurt de app automatisch een nieuwe code en wacht
op een andere waarde in **E-mailcode**. Vul de nieuwe code in en kies **Opslaan**.

# Problemen

- Bij een 403 vanuit Overweel3D moet in de broncode een nieuw bridge-token worden
  geplaatst en moet de lokale app opnieuw worden gebouwd.
- Controleer bij verbindingsproblemen eerst het app-logboek.
- De account- en bridgegegevens staan op verzoek vast in de Python-broncode en
  zijn daardoor zichtbaar in de gekopieerde map en de gebouwde containerimage.

