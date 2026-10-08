import { execFileSync } from "node:child_process";

const variableName = "OVERWEEL_POCKETBASE_MCP_PASSWORD";

function userPassword() {
  if (process.env[variableName]) return process.env[variableName];
  const output = execFileSync(
    "C:\\Windows\\System32\\reg.exe",
    ["query", "HKCU\\Environment", "/v", variableName],
    { encoding: "utf8", windowsHide: true },
  );
  const line = output.split(/\r?\n/).find((entry) => entry.includes(variableName));
  const match = line?.match(/\sREG_(?:SZ|EXPAND_SZ)\s+(.+)$/);
  if (!match) throw new Error("PocketBase MCP-wachtwoord ontbreekt in de Windows-gebruikersvariabele.");
  return match[1].trim();
}

try {
  process.env.POCKETBASE_URL = "https://api.gijsoverweel.nl";
  process.env.POCKETBASE_ADMIN_EMAIL = "gijsoverweel@gmail.com";
  process.env.POCKETBASE_ADMIN_PASSWORD = userPassword();
  await import("./mcp-server/build/index.js");
} catch (error) {
  console.error("PocketBase MCP starten mislukt:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
