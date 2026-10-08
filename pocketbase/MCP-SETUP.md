# PocketBase MCP voor Codex

De server uit `mrwyndham/pocketbase-mcp` draait **lokaal op de Codex-pc** via
stdio. Hij wordt niet in de PocketBase-add-on of publieke website ingebouwd.
Daarmee kan Codex na een nieuwe sessie PocketBase-collecties en records beheren.

Lokale installatie:

```powershell
git clone --depth 1 https://github.com/mrwyndham/pocketbase-mcp.git pocketbase/mcp-server
cd pocketbase/mcp-server
pnpm install --frozen-lockfile
pnpm approve-builds esbuild
pnpm run build
```

`launch-mcp.mjs` gebruikt `api.gijsoverweel.nl` en het superuser-account
`gijsoverweel@gmail.com`. Het wachtwoord staat niet in Git of in de
Codex-configuratie, maar in de Windows-gebruikersvariabele
`OVERWEEL_POCKETBASE_MCP_PASSWORD`. Andere processen onder hetzelfde
Windows-account kunnen die variabele lezen; gebruik dit alleen op je eigen pc.

Stel het wachtwoord eenmalig in vanuit Windows PowerShell:

```powershell
[Environment]::SetEnvironmentVariable(
  'OVERWEEL_POCKETBASE_MCP_PASSWORD',
  (Read-Host 'PocketBase-superuserwachtwoord'),
  'User'
)
```

Registreer daarna de lokale server bij Codex:

```powershell
codex mcp add overweel3d-pocketbase -- "C:\Program Files\nodejs\node.exe" "C:\Users\gijso\dyad-apps\overweel3d-test-version\pocketbase\launch-mcp.mjs"
codex mcp list
```

Controleer de toegang zonder iets te wijzigen:

```powershell
node pocketbase/mcp-smoke-test.mjs
```

Start een **nieuwe Codex-sessie** nadat de server geregistreerd is; een lopende
sessie laadt nieuwe MCP-tools niet tussentijds. De server kan ook collecties
verwijderen: laat zulke acties alleen uitvoeren wanneer je er expliciet om
vraagt. De PocketBase-add-on zelf hoeft voor deze lokale MCP-koppeling niet te
worden bijgewerkt.
