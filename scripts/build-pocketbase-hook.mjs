import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hooksDir = path.join(root, "pocketbase", "pb_hooks");
const templatePath = path.join(hooksDir, "overweel3d.template.js");
const corePath = path.join(hooksDir, "overweel3d-core.js");
const routesPath = path.join(hooksDir, "overweel3d.pb.js");
const addonHooksDir = path.join(root, "pocketbase", "home-assistant-addon", "local_pocketbase", "pb_hooks");

const source = await fs.readFile(templatePath, "utf8");
const routePattern = /routerAdd\(\s*(["'][A-Z]+["'])\s*,\s*(["'][^"']+["'])\s*,\s*function\s*\(e\)\s*\{/g;
const routes = [];
const replacements = [];

function matchingBrace(text, openingIndex) {
  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = openingIndex; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (lineComment) { if (char === "\n") lineComment = false; continue; }
    if (blockComment) { if (char === "*" && next === "/") { blockComment = false; index += 1; } continue; }
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "/" && next === "/") { lineComment = true; index += 1; continue; }
    if (char === "/" && next === "*") { blockComment = true; index += 1; continue; }
    if (char === '"' || char === "'" || char === "`") { quote = char; continue; }
    if (char === "{") depth += 1;
    if (char === "}" && --depth === 0) return index;
  }
  throw new Error(`Geen sluitende accolade gevonden vanaf teken ${openingIndex}.`);
}

for (const match of source.matchAll(routePattern)) {
  const start = match.index;
  const openingBrace = start + match[0].lastIndexOf("{");
  const closingBrace = matchingBrace(source, openingBrace);
  const suffix = source.slice(closingBrace + 1).match(/^\s*(,\s*\$apis\.bodyLimit\([^)]*\))?\s*\);/);
  if (!suffix) throw new Error(`Route vanaf teken ${start} heeft geen afsluitende );`);
  const end = closingBrace + 1 + suffix[0].length;
  const name = `route${routes.length}`;
  const body = source.slice(openingBrace + 1, closingBrace);
  routes.push({
    name,
    method: JSON.parse(match[1]),
    routePath: JSON.parse(match[2]),
    middleware: suffix[1] ? suffix[1].replace(/^,\s*/, "") : "",
  });
  replacements.push({ start, end, text: `function ${name}(e) {${body}}` });
}

if (routes.length !== 8) throw new Error(`Verwachtte 8 routes, maar vond ${routes.length}.`);

let core = source;
for (const replacement of replacements.reverse()) {
  core = core.slice(0, replacement.start) + replacement.text + core.slice(replacement.end);
}
core += `\n\nmodule.exports = { ${routes.map((route) => route.name).join(", ")} };\n`;

const wrapper = [
  '/// <reference path="../pb_data/types.d.ts" />',
  "",
  "// Gegenereerd met scripts/build-pocketbase-hook.mjs.",
  "// PocketBase-handlers zijn geïsoleerd; laad gedeelde logica daarom binnen iedere handler.",
  ...routes.map(({ name, method, routePath, middleware }) =>
    `routerAdd(${JSON.stringify(method)}, ${JSON.stringify(routePath)}, function (e) { return require(__hooks + "/overweel3d-core.js").${name}(e); }${middleware ? `, ${middleware}` : ""});`,
  ),
  "",
].join("\n");

await fs.writeFile(corePath, core);
await fs.writeFile(routesPath, wrapper);
await fs.mkdir(addonHooksDir, { recursive: true });
const addonTemplatePath = path.join(addonHooksDir, "overweel3d.template.js");
const addonCorePath = path.join(addonHooksDir, "overweel3d-core.js");
const addonRoutesPath = path.join(addonHooksDir, "overweel3d.pb.js");
await Promise.all([
  fs.copyFile(templatePath, addonTemplatePath),
  fs.copyFile(corePath, addonCorePath),
  fs.copyFile(routesPath, addonRoutesPath),
]);
console.log(JSON.stringify({
  ok: true,
  routes: routes.length,
  sourceFiles: [corePath, routesPath],
  homeAssistantAddonFiles: [addonTemplatePath, addonCorePath, addonRoutesPath],
}, null, 2));
