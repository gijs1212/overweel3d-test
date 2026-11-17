import crypto from "node:crypto";
import { renderEmail, SITE_URL } from "./email.js";

const endpoint = (process.env.APPWRITE_FUNCTION_API_ENDPOINT || process.env.APPWRITE_ENDPOINT || "").replace(/\/$/, "");
const project = process.env.APPWRITE_FUNCTION_PROJECT_ID || process.env.APPWRITE_PROJECT_ID || "";
const key = process.env.APPWRITE_FUNCTION_API_KEY || process.env.APPWRITE_API_KEY || "";
let runtimeKey = "";
const database = process.env.APPWRITE_DATABASE_ID || "overweel3d-v2";
const publicBucket = process.env.APPWRITE_PUBLIC_BUCKET_ID || "public-media-v2";
const privateBucket = process.env.APPWRITE_PRIVATE_BUCKET_ID || "private-files-v2";
const functionPublicUrl = String(process.env.APPWRITE_FUNCTION_PUBLIC_URL || "").replace(/\/$/, "");

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function api(path, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("X-Appwrite-Project", project);
  headers.set("X-Appwrite-Key", key || runtimeKey);
  headers.set("X-Appwrite-Response-Format", "2.4.0");
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(`${endpoint}${path}`, { ...init, headers });
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
  if (!response.ok) throw new HttpError(response.status, payload?.message || String(payload || response.statusText));
  return payload;
}

async function apiBytes(path) {
  const headers = new Headers();
  headers.set("X-Appwrite-Project", project);
  headers.set("X-Appwrite-Key", key || runtimeKey);
  const response = await fetch(`${endpoint}${path}`, { headers });
  if (!response.ok) {
    const text = await response.text();
    let payload = null;
    try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
    throw new HttpError(response.status, payload?.message || String(payload || response.statusText));
  }
  return Buffer.from(await response.arrayBuffer());
}

function query(method, values) { return JSON.stringify({ method, values }); }

async function listRows(table) {
  const rows = [];
  let offset = 0;
  for (;;) {
    const params = new URLSearchParams();
    params.append("queries[]", query("limit", [100]));
    params.append("queries[]", query("offset", [offset]));
    const page = await api(`/tablesdb/${database}/tables/${table}/rows?${params}`);
    const batch = page?.rows || [];
    rows.push(...batch);
    if (batch.length < 100) return rows.map(rowValue);
    offset += batch.length;
  }
}

function rowValue(row) {
  const payload = typeof row.payload === "string" ? JSON.parse(row.payload || "{}") : row.payload || {};
  return { ...payload, id: payload.id || row.legacy_id, _rowId: row.$id, _permissions: row.$permissions || [] };
}

function clean(value) {
  const result = { ...value };
  delete result._rowId; delete result._permissions;
  return result;
}

function permissions(ownerId, isPublic = false) {
  const result = ['read("label:admin")', 'update("label:admin")', 'delete("label:admin")'];
  if (isPublic) result.push('read("any")');
  if (ownerId) result.push(`read("user:${ownerId}")`, `update("user:${ownerId}")`, `delete("user:${ownerId}")`);
  return result;
}

const publicTables = new Set(["app_settings", "blog_posts", "categories", "filament_colors", "materials", "portfolio_project_media", "portfolio_projects", "product_categories", "product_color_availability", "product_images", "product_options", "product_reviews", "product_variants", "products"]);

async function createRow(table, value, ownerId = "") {
  const record = clean({ id: value.id || crypto.randomUUID(), ...value });
  const rowId = crypto.randomUUID();
  const row = await api(`/tablesdb/${database}/tables/${table}/rows/${rowId}`, {
    method: "PUT",
    body: JSON.stringify({ data: { legacy_id: String(record.id), payload: JSON.stringify(record) }, permissions: permissions(ownerId, publicTables.has(table)) }),
  });
  return rowValue(row);
}

async function updateRow(table, record, changes) {
  const next = clean({ ...record, ...changes });
  const row = await api(`/tablesdb/${database}/tables/${table}/rows/${record._rowId}`, {
    method: "PATCH",
    body: JSON.stringify({ data: { legacy_id: String(next.id), payload: JSON.stringify(next) }, permissions: record._permissions }),
  });
  return rowValue(row);
}

async function deleteRow(table, record) { await api(`/tablesdb/${database}/tables/${table}/rows/${record._rowId}`, { method: "DELETE" }); }
async function byId(table, id) { return (await listRows(table)).find(row => row.id === id || row.supabase_id === id) || null; }
async function one(table, field, value) { return (await listRows(table)).find(row => row[field] === value) || null; }

function requestBody(req) {
  if (req.bodyJson && typeof req.bodyJson === "object") return req.bodyJson;
  try { return JSON.parse(req.body || "{}"); } catch { return {}; }
}

async function caller(req) {
  const id = req.headers?.["x-appwrite-user-id"] || req.headers?.["X-Appwrite-User-Id"] || "";
  if (!id) return null;
  try { return await api(`/users/${id}`); } catch { return null; }
}

function legacyUserId(user) { return user?.prefs?.legacy_user_id || user?.$id || ""; }
function requireUser(user) { if (!user) throw new HttpError(401, "Log eerst in."); return user; }
function requireAdmin(user) { if (!user?.labels?.includes("admin")) throw new HttpError(403, "Alleen een admin mag dit uitvoeren."); }
function randomCode(prefix = "") { return `${prefix}${crypto.randomBytes(4).toString("hex").toUpperCase()}`; }
function escapeHtml(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
function sha256(value) { return crypto.createHash("sha256").update(String(value)).digest("hex"); }

async function appSetting(keyName, fallback) {
  const record = await one("app_settings", "key", keyName);
  if (!record) return fallback;
  const value = record.value ?? record.setting_value;
  return value === undefined || value === null || value === "" ? fallback : value;
}

async function nextOrderNumber() {
  const year = new Date().getFullYear();
  const orders = await listRows("orders");
  const highest = orders.reduce((max, order) => {
    const match = String(order.order_number || "").match(/OW3D-(\d+)/);
    return Math.max(max, match ? Number(match[1]) : 0);
  }, 0);
  return `OW3D-${String(highest + 1).padStart(5, "0")}`;
}

function orderDefaults(order) {
  const now = new Date().toISOString();
  return {
    id: order.id || crypto.randomUUID(), status: order.status || "submitted",
    customer_order_token: order.customer_order_token || crypto.randomBytes(32).toString("hex"),
    submitted_at: order.submitted_at || now, created_at: order.created_at || now, updated_at: now,
    ...order,
  };
}

async function discountResult(body) {
  const code = String(body.code_text || "").trim().toUpperCase();
  const record = await one("discount_codes", "code", code);
  if (!record || !record.active) return { valid: false, message: "Kortingscode is ongeldig." };
  const now = Date.now();
  if (record.starts_at && new Date(record.starts_at).getTime() > now) return { valid: false, message: "Deze kortingscode is nog niet actief." };
  if (record.expires_at && new Date(record.expires_at).getTime() < now) return { valid: false, message: "Deze kortingscode is verlopen." };
  if (record.max_uses && Number(record.times_used || 0) >= Number(record.max_uses)) return { valid: false, message: "Deze kortingscode is volledig gebruikt." };
  if (record.assigned_to_email && String(record.assigned_to_email).toLowerCase() !== String(body.email_text || "").toLowerCase()) return { valid: false, message: "Deze kortingscode hoort bij een ander e-mailadres." };
  const minimum = Number(record.minimum_order_amount || 0);
  if (Number(body.order_amount ?? body.order_total ?? 0) < minimum) return { valid: false, message: "Het bestelbedrag is te laag voor deze kortingscode." };
  return { valid: true, message: "Kortingscode toegepast.", code: record.code, discount_type: record.discount_type, discount_value: Number(record.discount_value || 0), id: record.id };
}

function orderCustomerUrl(order) { return `${SITE_URL}/order/${encodeURIComponent(String(order.customer_order_token || ""))}`; }
function orderAdminUrl(order) { return `${SITE_URL}/admin/order/${encodeURIComponent(String(order.id || ""))}`; }

async function sendMail(to, subject, contentHtml, replyTo, options = {}) {
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  if (!apiKey) throw new HttpError(503, "Resend is nog niet ingesteld voor de Appwrite Function. Voeg RESEND_API_KEY toe.");
  const payload = {
    from: process.env.RESEND_FROM || "Overweel3D <noreply@overweel3d.gijsoverweel.nl>",
    to: [String(to)],
    subject: String(subject),
    html: renderEmail({ subject, contentHtml: String(contentHtml), ...options }),
    ...(replyTo ? { reply_to: String(replyTo) } : {}),
  };
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      // Resend requires a reused idempotency key to have an identical request
      // body. Include the fully rendered payload (CTA, reply-to and sender),
      // otherwise two different order mails can collide for 24 hours.
      "Idempotency-Key": sha256(JSON.stringify(payload)).slice(0, 64),
    },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new HttpError(502, `Resend kon de e-mail niet verzenden: ${result?.message || response.statusText}`);
  return result;
}

function requireOneDriveConfig() {
  const clientId = process.env.ONEDRIVE_CLIENT_ID || "";
  const clientSecret = process.env.ONEDRIVE_CLIENT_SECRET || "";
  const tenantId = process.env.ONEDRIVE_TENANT_ID || "ee379395-a204-487f-ac45-88e971655363";
  if (!clientId || !clientSecret) throw new HttpError(503, "OneDrive is nog niet ingesteld voor de Appwrite Function.");
  return { clientId, clientSecret, tenantId, tokenUrl: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token` };
}

async function storeOneDriveTokens(tokenData) {
  for (const old of await listRows("onedrive_tokens")) await deleteRow("onedrive_tokens", old);
  return createRow("onedrive_tokens", {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token || "",
    expires_at: tokenData.expires_in ? new Date(Date.now() + Number(tokenData.expires_in) * 1000).toISOString() : null,
    updated_at: new Date().toISOString(),
  });
}

async function oneDriveAccessToken() {
  const config = requireOneDriveConfig();
  const tokens = (await listRows("onedrive_tokens")).sort((a, b) => Date.parse(b.updated_at || "") - Date.parse(a.updated_at || ""));
  const token = tokens[0];
  if (token?.access_token && Date.parse(token.expires_at || "") > Date.now() + 60_000) return token.access_token;
  const refreshToken = token?.refresh_token || process.env.ONEDRIVE_REFRESH_TOKEN || "";
  if (!refreshToken) throw new HttpError(409, "Koppel OneDrive opnieuw via het adminscherm.");
  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, refresh_token: refreshToken, grant_type: "refresh_token", scope: "https://graph.microsoft.com/.default" }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) throw new HttpError(502, `OneDrive-token vernieuwen mislukt: ${payload.error_description || payload.error || response.status}`);
  await storeOneDriveTokens({ ...payload, refresh_token: payload.refresh_token || refreshToken });
  return payload.access_token;
}

async function oneDriveRequest(accessToken, path, init = {}) {
  const response = await fetch(`https://graph.microsoft.com/v1.0/me/drive/root:/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, ...(init.headers || {}) },
  });
  if (!response.ok && response.status !== 409) throw new HttpError(502, `OneDrive-verzoek mislukt (${response.status}): ${(await response.text()).slice(0, 500)}`);
  return response;
}

async function ensureOneDriveFolder(accessToken, parentPath, folderName) {
  const suffix = parentPath ? `${parentPath}:/children` : ":/children";
  await oneDriveRequest(accessToken, suffix, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: folderName, folder: {}, "@microsoft.graph.conflictBehavior": "fail" }),
  });
}

async function uploadOneDriveFile(accessToken, path, bytes) {
  await oneDriveRequest(accessToken, `${path}:/content`, { method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: bytes });
}

async function runOfflinePrinterCheck() {
  const threshold = Date.now() - 60 * 60 * 1000;
  let sentCount = 0;
  const printers = (await listRows("printers")).filter(item => item.status !== "maintenance");
  for (const printer of printers) {
    const offlineSince = printer.offline_since || printer.last_seen_at || printer.created_at;
    const offlineMs = Date.parse(offlineSince || "");
    if (!Number.isFinite(offlineMs) || offlineMs > threshold || printer.status !== "offline") continue;
    if (Date.parse(printer.offline_alert_sent_at || "") >= offlineMs) continue;
    await sendMail("gijsoverweel@gmail.com", `Printer ${printer.name} is langer dan een uur offline`, `<p><strong>${escapeHtml(printer.name)}</strong> is langer dan een uur niet meer online gezien.</p><p>Controleer de verbinding en de printerstatus in het beheerpaneel.</p>`, undefined, { ctaUrl: `${SITE_URL}/admin/production`, ctaLabel: "Printer controleren" });
    await updateRow("printers", printer, { offline_alert_sent_at: new Date().toISOString() });
    sentCount += 1;
  }
  return { checkedCount: printers.length, sentCount };
}

async function runAbandonedCartReminders() {
  if ((await appSetting("abandoned_cart_enabled", true)) === false) return { skipped: true, selectedCount: 0, sentCount: 0 };
  const hours = Math.max(1, Math.min(168, Number(await appSetting("abandoned_cart_hours", 24)) || 24));
  const cutoff = Date.now() - hours * 3_600_000;
  const carts = (await listRows("saved_carts")).filter(cart => cart.status === "active" && Number(cart.reminder_count || 0) === 0 && cart.email && Date.parse(cart.updated_at || cart.created_at || "") < cutoff).slice(0, 100);
  let sentCount = 0;
  for (const cart of carts) {
    const items = socialArray(cart.items); if (!items.length) continue;
    await sendMail(cart.email, "Je winkelmandje bij Overweel3D staat nog klaar", `<p>Je had <strong>${items.length} ${items.length === 1 ? "artikel" : "artikelen"}</strong> in je winkelmandje.</p><p>Ga verder waar je gebleven was wanneer het jou uitkomt.</p>`, undefined, { ctaUrl: `${SITE_URL}/bestellen`, ctaLabel: "Winkelmandje openen" });
    await updateRow("saved_carts", cart, { status: "abandoned", reminder_count: 1, reminder_sent_at: new Date().toISOString() });
    sentCount += 1;
  }
  return { selectedCount: carts.length, sentCount };
}

async function bridgePrinter(body) {
  const printer = await byId("printers", String(body.printer_id || ""));
  const tokenHash = sha256(String(body.bridge_token || ""));
  if (!printer || !body.bridge_token) throw new HttpError(403, "Ongeldige blijvende bridge-token.");
  const pairing = (await listRows("printer_pairing_codes")).find(item => item.printer_id === printer.id && item.code_hash === tokenHash);
  if (printer.bridge_token_hash !== tokenHash && !pairing) throw new HttpError(403, "Ongeldige blijvende bridge-token.");
  return printer;
}

function normalizePrintName(value) {
  return String(value || "").toLowerCase().replace(/\\/g, "/").split("/").pop().replace(/\.(gcode\.3mf|3mf|gcode)$/i, "").replace(/[_\s-]*plate[_\s-]*\d+$/i, "").replace(/[^a-z0-9]+/g, "");
}

async function handleBridge(name, body) {
  const printer = await bridgePrinter(body); const payload = body.payload || {}; const now = new Date().toISOString();
  if (name === "status") {
    const allowed = new Set(["offline", "idle", "printing", "paused", "error", "maintenance"]); const status = allowed.has(String(payload.status)) ? String(payload.status) : "offline"; const amsOnly = payload.ams_only === true;
    const changes = {};
    if (!amsOnly) { changes.status = printer.status === "maintenance" ? "maintenance" : status; changes.last_seen_at = now; changes.offline_since = status === "offline" ? printer.offline_since || now : null; if (status !== "offline") changes.offline_alert_sent_at = null; }
    if (!amsOnly && !payload.heartbeat_only) { for (const field of ["current_file", "current_plate", "progress", "remaining_minutes", "current_layer", "total_layers", "nozzle_temperature", "bed_temperature", "chamber_temperature"]) if (payload[field] !== undefined) changes[field] = payload[field]; if (payload.raw_status !== undefined) { const incoming = socialObject(payload.raw_status); const stored = socialObject(printer.raw_status); for (const keyName of ["ams_refresh_request_id", "ams_refresh_requested_at", "ams_refresh_completed_request_id", "ams_refresh_completed_at", "ams_last_refreshed_at"]) if (stored[keyName] !== undefined) incoming[keyName] = stored[keyName]; changes.raw_status = incoming; } }
    if (payload.installed_nozzle_diameter !== undefined || amsOnly) { const raw = socialObject(changes.raw_status || printer.raw_status); if (payload.installed_nozzle_diameter !== undefined) raw.installed_nozzle_diameter = Number(payload.installed_nozzle_diameter) || null; if (amsOnly) raw.ams_last_refreshed_at = now; changes.raw_status = raw; }
    const updatedPrinter = await updateRow("printers", printer, changes);
    if (!amsOnly && ["printing", "paused"].includes(status) && payload.current_file) { const observed = String(payload.current_file).slice(0, 500); const normalized = normalizePrintName(observed); for (const job of await listRows("print_jobs")) { if (job.active === false || ["completed", "cancelled"].includes(job.status) || Number(job.runs_completed || 0) >= Math.max(1, Number(job.runs_required || 1)) || normalizePrintName(job.expected_file_name) !== normalized) continue; if (Number(payload.current_plate || 0) > 0 && Number(job.source_plate_number || 0) > 0 && Number(job.source_plate_number) !== Number(payload.current_plate)) continue; const order = await byId("orders", job.order_id); if (!order || ["completed", "cancelled"].includes(order.status)) continue; await updateRow("print_jobs", job, { status: ["approved", "printing", "paused"].includes(job.status) ? job.status : "suggested", printer_id: updatedPrinter.id, observed_file_name: observed, suggested_at: now }); } }
    const seenSlots = new Set();
    for (const slot of socialArray(payload.ams_slots)) { const unit = Number(slot.ams_unit || 0); const number = Number(slot.slot_number || 1); const slotKey = `${unit}:${number}`; if (seenSlots.has(slotKey)) continue; seenSlots.add(slotKey); const capacity = Math.max(1, Number(slot.spool_capacity_grams || 1000)); const percent = slot.remaining_percent == null ? null : Math.max(0, Math.min(100, Number(slot.remaining_percent))); const grams = slot.remaining_grams == null ? (percent == null ? null : capacity * percent / 100) : Math.max(0, Number(slot.remaining_grams)); const slotValues = { printer_id: updatedPrinter.id, ams_unit: unit, slot_number: number, material: slot.material || null, color_name: slot.color_name || null, color_hex: slot.color_hex || null, tray_uuid: slot.tray_uuid || null, remaining_percent: percent, remaining_grams: grams, spool_capacity_grams: capacity, raw_status: slot.raw_status || slot }; const existingSlots = (await listRows("printer_ams_slots")).filter(item => item.printer_id === updatedPrinter.id && Number(item.ams_unit) === unit && Number(item.slot_number) === number); if (existingSlots[0]) await updateRow("printer_ams_slots", existingSlots[0], slotValues); else await createRow("printer_ams_slots", slotValues); for (const duplicate of existingSlots.slice(1)) await deleteRow("printer_ams_slots", duplicate);
      const material = String(slot.material || "").trim().toUpperCase(); let colorHex = String(slot.color_hex || "").trim().toUpperCase(); if (colorHex && !colorHex.startsWith("#")) colorHex = `#${colorHex}`; if (!/^#[0-9A-F]{6}$/.test(colorHex)) colorHex = ""; const colorName = String(slot.color_name || "").trim(); let linked = (await listRows("filament_colors")).find(item => String(item.material || "").toUpperCase() === material && (colorHex && String(item.hex || "").toUpperCase() === colorHex || colorName && String(item.name || "").toLowerCase() === colorName.toLowerCase())); if (!linked && material && colorHex) linked = await createRow("filament_colors", { name: colorName && colorName.toLowerCase() !== material.toLowerCase() ? colorName : `${material} ${colorHex}`, material, hex: colorHex, description: "Automatisch herkend vanuit een gekoppelde AMS.", sort_order: (await listRows("filament_colors")).length, active: true }); const inventoryKey = `ams:${updatedPrinter.id}:${unit}:${number}`; const inventoryValues = { inventory_key: inventoryKey, color_name: colorName || null, material: material || null, color_hex: colorHex || null, filament_color_id: linked?.id || null, tray_uuid: slot.tray_uuid || null, spool_capacity_grams: capacity, total_weight_grams: grams, remaining_percent: percent, source_printer_id: updatedPrinter.id, source_ams_unit: unit, source_slot_number: number, last_seen_at: now }; const inventory = await one("filament_inventory", "inventory_key", inventoryKey); if (inventory) await updateRow("filament_inventory", inventory, inventoryValues); else await createRow("filament_inventory", inventoryValues); }
    return { success: true, heartbeat_only: payload.heartbeat_only === true, ams_only: amsOnly, status };
  }
  if (name === "control") {
    const action = String(payload.action || ""); const raw = socialObject(printer.raw_status);
    if (action === "scan_config") return { bambu_login_request_id: Number(printer.bambu_login_request_id || 0), bambu_login_completed_request_id: Number(printer.bambu_login_completed_request_id || 0), ams_refresh_request_id: Number(raw.ams_refresh_request_id || 0), ams_refresh_completed_request_id: Number(raw.ams_refresh_completed_request_id || 0) };
    if (action === "ack_ams_refresh") { raw.ams_refresh_completed_request_id = Number(payload.request_id || 0); raw.ams_refresh_completed_at = now; await updateRow("printers", printer, { raw_status: raw }); return { success: true }; }
    if (action === "ack_bambu_login_code") { await updateRow("printers", printer, { bambu_login_completed_request_id: Number(payload.request_id || 0), bambu_login_code_sent_at: payload.success === false ? null : now, bambu_login_last_error: payload.error ? String(payload.error).slice(0, 2000) : null }); return { success: true }; }
    if (action === "sync_bambu_color_catalog") { let newProposals = 0; let linkedExisting = 0; let openProposals = 0; const colors = await listRows("filament_colors"); for (const candidate of socialArray(payload.colors).slice(0, 2000)) { const nameValue = String(candidate.name || "").trim(); const material = String(candidate.material || "").trim().toUpperCase(); const hex = String(candidate.color_hex || "").trim().toUpperCase(); const catalogKey = String(candidate.catalog_key || "").trim().slice(0, 180); if (!nameValue || !material || !/^#[0-9A-F]{6}$/.test(hex) || !catalogKey) continue; const inventoryKey = `bambu-catalog:${catalogKey}`; const matching = colors.find(color => String(color.material || "").toUpperCase() === material && (String(color.hex || "").toUpperCase() === hex || String(color.name || "").toLowerCase() === nameValue.toLowerCase())); const proposal = await one("filament_inventory", "inventory_key", inventoryKey); if (matching) { if (proposal && !proposal.filament_color_id) { await updateRow("filament_inventory", proposal, { filament_color_id: matching.id, last_seen_at: now }); linkedExisting += 1; } continue; } const values = { inventory_key: inventoryKey, color_name: nameValue, material, color_hex: hex, tray_uuid: catalogKey, spool_capacity_grams: 1000, total_weight_grams: null, remaining_percent: null, last_seen_at: now }; if (proposal) await updateRow("filament_inventory", proposal, values); else { await createRow("filament_inventory", values); newProposals += 1; } openProposals += 1; } return { success: true, received: socialArray(payload.colors).length, new_proposals: newProposals, open_proposals: openProposals, linked_existing: linkedExisting }; }
    throw new HttpError(400, `Onbekende bridgeactie: ${action}`);
  }
  throw new HttpError(400, `Onbekende bridge-route: ${name}`);
}

const SOCIAL_TEMPLATES = {
  product: {
    facebook: "{direct_url}\n\nNieuw bij Overweel3D: {name} ✨\n\nBekijk dit nieuwe product en stel het samen.\n\n#Overweel3D #3Dprinten #Nieuw\n\nhttps://overweel3d.gijsoverweel.nl/",
    instagram: "{direct_url}\n\nNieuw bij Overweel3D: {name} ✨\n\nBekijk dit nieuwe product en stel het samen.\n\n#Overweel3D #3Dprinten #Nieuw\n\nhttps://overweel3d.gijsoverweel.nl/",
  },
  product_update: {
    facebook: "{direct_url}\n\n{name} is vernieuwd bij Overweel3D ✨\n\n{change_label}. Bekijk de actuele uitvoeringen en prijs in de catalogus.\n\n#Overweel3D #3Dprinten #Productupdate\n\nhttps://overweel3d.gijsoverweel.nl/",
    instagram: "{direct_url}\n\n{name} is vernieuwd bij Overweel3D ✨\n\n{change_label}. Bekijk de actuele uitvoeringen en prijs in de catalogus.\n\n#Overweel3D #3Dprinten #Productupdate\n\nhttps://overweel3d.gijsoverweel.nl/",
  },
  color: {
    facebook: "{direct_url}\n\nNieuwe kleur bij Overweel3D: {name} ({material}) 🎨\n\nBekijk de kleur in ons assortiment.\n\n#Overweel3D #3Dprinten #NieuweKleur\n\nhttps://overweel3d.gijsoverweel.nl/",
    instagram: "{direct_url}\n\nNieuwe kleur bij Overweel3D: {name} ({material}) 🎨\n\nBekijk de kleur in ons assortiment.\n\n#Overweel3D #3Dprinten #NieuweKleur\n\nhttps://overweel3d.gijsoverweel.nl/",
  },
  discount: {
    facebook: "{direct_url}\n\nNieuwe korting bij Overweel3D: {discount_label}\nGebruik code {code}. Geldig tot {expires_label}; {usage_label}.\n\n#Overweel3D #Korting\n\nhttps://overweel3d.gijsoverweel.nl/",
    instagram: "{direct_url}\n\nNieuwe korting bij Overweel3D: {discount_label}\nGebruik code {code}. Geldig tot {expires_label}; {usage_label}.\n\n#Overweel3D #Korting\n\nhttps://overweel3d.gijsoverweel.nl/",
  },
  spotlight: {
    facebook: "{direct_url}\n\nUitgelicht bij Overweel3D: {name} ✨\n\nBekijk dit product in onze catalogus.\n\n#Overweel3D #3Dprinten #Uitgelicht\n\nhttps://overweel3d.gijsoverweel.nl/",
    instagram: "{direct_url}\n\nUitgelicht bij Overweel3D: {name} ✨\n\nBekijk dit product in onze catalogus.\n\n#Overweel3D #3Dprinten #Uitgelicht\n\nhttps://overweel3d.gijsoverweel.nl/",
  },
};

function socialArray(value) { return Array.isArray(value) ? value : []; }
function socialObject(value) { return value && typeof value === "object" && !Array.isArray(value) ? { ...value } : {}; }
function socialRender(template, values) { return String(template || "").replace(/\{([a-z_]+)\}/g, (_match, keyName) => values[keyName] == null ? "" : String(values[keyName])); }

async function socialSetting() {
  const existing = await listRows("social_publisher_settings");
  if (existing.length) return existing.find(item => item.enabled) || existing[0];
  return createRow("social_publisher_settings", { enabled: false, dry_run: true, spotlight_enabled: true, paused_platforms: [], templates: SOCIAL_TEMPLATES, backfill_started_at: new Date().toISOString() });
}

function socialRequireToken(setting, supplied) {
  const expected = String(setting.integration_token || "");
  const actual = String(supplied || "");
  if (!expected || expected.length !== actual.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual))) throw new HttpError(403, "Ongeldige Social Publisher-koppelsleutel.");
}

function appwriteFileUrl(bucketId, fileId) {
  return `${endpoint}/storage/buckets/${encodeURIComponent(bucketId)}/files/${encodeURIComponent(fileId)}/view?project=${encodeURIComponent(project)}`;
}

function customerFileUrl(token, values = {}) {
  if (!functionPublicUrl) throw new HttpError(503, "APPWRITE_FUNCTION_PUBLIC_URL is nog niet ingesteld.");
  const params = new URLSearchParams({ action: "order-media", token: String(token || "") });
  for (const [name, value] of Object.entries(values)) if (value) params.set(name, String(value));
  return `${functionPublicUrl}?${params}`;
}

async function socialMediaRecord(path) { return (await listRows("storage_files")).find(item => item.path === path) || null; }

function safeFilename(value) {
  return String(value || "bestand").replace(/[\r\n"\\/]/g, "_").slice(0, 180) || "bestand";
}

function mimeForPath(path, fallback = "application/octet-stream") {
  const extension = String(path || "").split(".").pop()?.toLowerCase();
  return ({ jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", svg: "image/svg+xml", mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", stl: "model/stl", "3mf": "model/3mf", gcode: "text/plain" })[extension] || fallback;
}

async function serveOrderMedia(req, res) {
  const token = String(req.query?.token || "");
  if (token.length < 24) throw new HttpError(404, "Bestelling niet gevonden.");
  const order = await one("orders", "customer_order_token", token);
  if (!order) throw new HttpError(404, "Bestelling niet gevonden.");

  let path = String(req.query?.path || "");
  let filename = path.split("/").pop() || "bestand";
  let mimeType = mimeForPath(path);
  const fileId = String(req.query?.file_id || "");
  if (fileId) {
    const file = await byId("order_files", fileId);
    if (!file || file.order_id !== order.id || file.customer_visible === false) throw new HttpError(404, "Bestand niet gevonden.");
    path = String(file.storage_path || "");
    filename = file.original_filename || filename;
    mimeType = file.mime_type || mimeForPath(path);
  } else {
    const allowed = (await listRows("order_3mf_plate_mappings")).some(item => item.order_id === order.id && item.active !== false && item.preview_storage_path === path);
    if (!path || !allowed) throw new HttpError(404, "Voorbeeld niet gevonden.");
  }

  const stored = await socialMediaRecord(path);
  const bucketId = stored?._appwrite_bucket_id || privateBucket;
  const storedFileId = stored?._appwrite_file_id;
  if (!storedFileId) throw new HttpError(404, "Bestand staat niet in Appwrite-opslag.");
  const bytes = await apiBytes(`/storage/buckets/${encodeURIComponent(bucketId)}/files/${encodeURIComponent(storedFileId)}/download`);
  const disposition = String(req.query?.download || "") === "1" ? "attachment" : "inline";
  return res.binary(bytes, 200, {
    "Content-Type": mimeType,
    "Content-Disposition": `${disposition}; filename="${safeFilename(filename)}"`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  });
}

async function socialMediaPaths(product) {
  const productIds = new Set([product.id, product.supabase_id].filter(Boolean));
  const images = (await listRows("product_images"))
    .filter(item => productIds.has(item.product_id) && item.storage_path)
    .sort((a, b) => Number(Boolean(b.is_primary)) - Number(Boolean(a.is_primary)) || Number(a.sort_order || 0) - Number(b.sort_order || 0));
  const paths = [...images.map(item => item.storage_path), ...socialArray(product.photos)];
  return [...new Set(paths.filter(path => /\.(jpe?g|png|webp|heic|heif|mp4|mov|m4v|webm)$/i.test(String(path))))].slice(0, 10);
}

function socialTargetPlatforms(job, setting) {
  const payload = socialObject(job.payload);
  const requested = socialArray(payload.target_platforms).filter(value => ["facebook", "instagram"].includes(value));
  const targets = requested.length ? requested : ["facebook", "instagram"];
  const paused = socialArray(setting.paused_platforms);
  const state = socialObject(job.platform_state);
  return targets.filter(platform => !paused.includes(platform) && !["published", "dry_run"].includes(state[platform]));
}

function socialReadyAt(job, setting) {
  let time = Date.parse(job.scheduled_at || "") || Date.now();
  const payload = socialObject(job.payload);
  if (Number(job.priority || 0) >= 10000 || payload.force_now === true) return time;
  const retry = Date.parse(job.next_retry_at || "");
  if (Number.isFinite(retry)) time = Math.max(time, retry);
  if (job.is_backfill) {
    const last = Date.parse(setting.backfill_last_published_at || "");
    if (Number.isFinite(last)) time = Math.max(time, last + 2 * 60 * 60 * 1000);
  }
  return time;
}

async function socialCreateHistory(job, platform, status, extras = {}) {
  return createRow("social_post_history", {
    job_id: job.id, platform, status, post_url: extras.post_url || "",
    details: { error: extras.error || "", screenshot_path: extras.screenshot_path || "", source_name: job.source_name || "", source_type: job.source_type || "" },
    published_at: new Date().toISOString(),
  });
}

async function socialSyncCatalog(setting) {
  const jobs = await listRows("social_post_jobs");
  const keys = new Set(jobs.map(item => item.event_key));
  const products = (await listRows("products")).filter(item => item.active !== false);
  for (const product of products) {
    const keyName = `new:product:${product.id}`;
    if (keys.has(keyName)) continue;
    const media = await socialMediaPaths(product);
    await createRow("social_post_jobs", { event_key: keyName, source_type: "product", source_id: product.id, source_name: product.name, status: media.length ? "queued" : "waiting_for_media", priority: 10, scheduled_at: new Date().toISOString(), media_paths: media, payload: { name: product.name, direct_url: `https://overweel3d.gijsoverweel.nl/bestellen?product=${encodeURIComponent(product.id)}`, facebook_media_mode: setting.facebook_media_mode === "combined" ? "combined" : "separate" }, attempts: 0, is_backfill: true, platform_state: { facebook: "pending", instagram: "pending" } });
  }
  const colors = (await listRows("filament_colors")).filter(item => item.active !== false);
  for (const color of colors) {
    const keyName = `new:color:${color.id}`;
    if (keys.has(keyName)) continue;
    const hex = /^#[0-9A-F]{6}$/i.test(String(color.hex || "")) ? `generated-color:${String(color.hex).toUpperCase()}` : "";
    await createRow("social_post_jobs", { event_key: keyName, source_type: "color", source_id: color.id, source_name: color.name, status: hex ? "queued" : "waiting_for_media", priority: 10, scheduled_at: new Date().toISOString(), media_paths: hex ? [hex] : [], payload: { name: color.name, material: color.material, direct_url: `https://overweel3d.gijsoverweel.nl/kleuren?color=${encodeURIComponent(color.id)}`, facebook_media_mode: setting.facebook_media_mode === "combined" ? "combined" : "separate" }, attempts: 0, is_backfill: true, platform_state: { facebook: "pending", instagram: "pending" } });
  }
}

async function socialClaim(setting, metaReady) {
  const now = Date.now();
  let candidates = (await listRows("social_post_jobs")).filter(job => ["queued", "failed"].includes(job.status));
  candidates = candidates.filter(job => {
    const type = job.source_type;
    const automatic = ["product", "product_update", "color", "discount", "spotlight", "session_check"].includes(type) || socialObject(job.payload).force_now === true;
    return automatic && socialTargetPlatforms(job, setting).length && socialReadyAt(job, setting) <= now;
  });
  candidates.sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0) || socialReadyAt(a, setting) - socialReadyAt(b, setting));
  const job = candidates.find(item => item.source_type === "session_check") || (metaReady ? candidates[0] : null);
  if (!job || (!setting.enabled && job.source_type !== "session_check")) return null;
  const payload = socialObject(job.payload);
  if (payload.force_now === true) { delete payload.force_now; delete payload.force_priority_original; }
  let mediaPaths = socialArray(job.media_paths).slice(0, 10);
  if (["product", "product_update", "spotlight"].includes(job.source_type)) {
    const product = await byId("products", job.source_id);
    if (product) {
      payload.name = product.name;
      payload.direct_url = `https://overweel3d.gijsoverweel.nl/bestellen?product=${encodeURIComponent(product.id)}`;
      const fresh = await socialMediaPaths(product);
      if (fresh.length) mediaPaths = fresh;
    }
  }
  payload.social_media_grant = { expires_at: new Date(now + 24 * 60 * 60 * 1000).toISOString(), paths: mediaPaths };
  const platforms = socialTargetPlatforms(job, setting);
  const templates = socialObject(setting.templates);
  const selected = socialObject(templates[job.source_type] || SOCIAL_TEMPLATES[job.source_type]);
  const customTexts = socialObject(payload.texts);
  const texts = {};
  for (const platform of platforms) texts[platform] = job.source_type === "manual" ? String(customTexts[platform] || customTexts.default || "") : socialRender(selected[platform] || socialObject(SOCIAL_TEMPLATES[job.source_type])[platform], payload);
  const updated = await updateRow("social_post_jobs", job, { status: "processing", claimed_at: new Date().toISOString(), media_paths: mediaPaths, payload });
  if (job.source_type !== "session_check") await socialCreateHistory(updated, "system", "started");
  if (job.is_backfill) await updateRow("social_publisher_settings", setting, { backfill_last_published_at: new Date().toISOString() });
  return { id: updated.id, source_type: updated.source_type, source_name: updated.source_name, media_paths: mediaPaths, media_urls: [], posted_media: socialObject(payload.social_platform_posts), facebook_media_mode: payload.facebook_media_mode === "combined" ? "combined" : "separate", texts, platforms, dry_run: Boolean(setting.dry_run) };
}

async function uploadPreparedMedia(job, body) {
  const payload = socialObject(job.payload);
  const grant = socialObject(payload.social_media_grant);
  const index = Number(body.index);
  const paths = socialArray(grant.paths);
  if (!Number.isInteger(index) || index < 0 || index >= paths.length || Date.parse(grant.expires_at || "") <= Date.now()) throw new HttpError(400, "Ongeldige of verlopen media.");
  const kind = body.media_kind === "video" ? "video" : "image";
  const encoded = String(kind === "video" ? body.video_base64 || "" : body.image_base64 || "");
  const bytes = Buffer.from(encoded, "base64");
  if (!bytes.length || bytes.length > (kind === "video" ? 20 : 8) * 1024 * 1024) throw new HttpError(413, "Media is leeg of te groot.");
  if (kind === "image" && (bytes[0] !== 0xff || bytes[1] !== 0xd8)) throw new HttpError(400, "Alleen volledige JPEG-afbeeldingen zijn toegestaan.");
  const extension = kind === "video" ? ".mp4" : ".jpg";
  const path = `social-publisher/${job.id}/${index}${extension}`;
  const fileId = `file_${crypto.createHash("sha256").update(`social-publisher:${path}`).digest("hex")}`.slice(0, 36);
  try { await api(`/storage/buckets/${publicBucket}/files/${fileId}`, { method: "DELETE" }); } catch (caught) { if (caught.status !== 404) throw caught; }
  const form = new FormData();
  form.append("fileId", fileId);
  form.append("file", new Blob([bytes], { type: kind === "video" ? "video/mp4" : "image/jpeg" }), `${job.id}-${index}${extension}`);
  form.append("permissions", JSON.stringify(['read("any")', 'update("label:admin")', 'delete("label:admin")']));
  const stored = await api(`/storage/buckets/${publicBucket}/files`, { method: "POST", body: form });
  const existing = await socialMediaRecord(path);
  const record = { ...(existing || {}), id: existing?.id || crypto.randomUUID(), supabase_id: existing?.supabase_id || existing?.id || crypto.randomUUID(), bucket: "social-publisher", path, file: stored.name, size: bytes.length, content_type: kind === "video" ? "video/mp4" : "image/jpeg", public: true, _appwrite_bucket_id: publicBucket, _appwrite_file_id: fileId, updated_at: new Date().toISOString(), created_at: existing?.created_at || new Date().toISOString() };
  if (existing) await updateRow("storage_files", existing, record); else await createRow("storage_files", record);
  return { prepared: true, url: appwriteFileUrl(publicBucket, fileId) };
}

async function handleSocial(name, body) {
  const setting = await socialSetting();
  socialRequireToken(setting, body.token);
  if (name === "heartbeat") {
    const at = new Date().toISOString();
    await updateRow("social_publisher_settings", setting, { publisher_last_seen_at: at, publisher_version: String(body.version || "").slice(0, 100) });
    return { connected: true, received_at: at, hook_version: "1.19.21", backend: "appwrite-1.5.1" };
  }
  if (name === "poll") {
    await socialSyncCatalog(setting);
    return { job: await socialClaim(setting, body.meta_ready === true), version: "1.19.21", backend: "appwrite-1.5.1" };
  }
  if (name === "resolve_media") {
    const path = String(body.path || "");
    if (!path || path.includes("..") || path.startsWith("generated-color:")) throw new HttpError(400, "Ongeldig productmediapad.");
    const record = await socialMediaRecord(path);
    if (!record?._appwrite_file_id) throw new HttpError(404, "Productmedia ontbreekt in Appwrite-opslag.");
    return { url: appwriteFileUrl(record._appwrite_bucket_id || publicBucket, record._appwrite_file_id) };
  }
  if (name === "prepare_media") {
    const job = await byId("social_post_jobs", String(body.job_id || ""));
    if (!job || job.status !== "processing") throw new HttpError(404, "Actieve publicatietaak niet gevonden.");
    return uploadPreparedMedia(job, body);
  }
  if (name === "record_post") {
    const job = await byId("social_post_jobs", String(body.job_id || ""));
    if (!job || job.status !== "processing") throw new HttpError(404, "Actieve publicatietaak niet gevonden.");
    const payload = socialObject(job.payload); const allPosts = socialObject(payload.social_platform_posts); const facebook = socialObject(allPosts.facebook);
    facebook[String(body.path || "")] = String(body.post_url || ""); allPosts.facebook = facebook; payload.social_platform_posts = allPosts;
    await updateRow("social_post_jobs", job, { payload });
    return { recorded: true, posted_media: allPosts };
  }
  if (name === "session") {
    if (!["facebook", "instagram"].includes(body.platform)) throw new HttpError(400, "Onbekend platform.");
    const values = { platform: body.platform, status: body.status, last_checked_at: new Date().toISOString(), last_error: body.error || "", screenshot_path: body.screenshot_path || "", account_name: body.account_name || "", account_url: body.account_url || "", check_steps: socialArray(body.check_steps) };
    const existing = await one("social_publisher_sessions", "platform", body.platform);
    return existing ? updateRow("social_publisher_sessions", existing, values) : createRow("social_publisher_sessions", values);
  }
  if (name === "session_check_result") {
    const job = await byId("social_post_jobs", String(body.job_id || ""));
    if (!job || job.source_type !== "session_check") throw new HttpError(404, "Accountcontrole niet gevonden.");
    const results = socialObject(body.results); const targets = socialArray(socialObject(job.payload).target_platforms); const platforms = targets.length ? targets : ["facebook", "instagram"]; const state = {}; const errors = [];
    for (const platform of platforms) {
      const result = socialObject(results[platform]); const status = String(result.status || "disconnected"); state[platform] = status;
      if (result.error) errors.push(`${platform}: ${result.error}`);
      const session = await one("social_publisher_sessions", "platform", platform);
      const values = { platform, status, last_checked_at: new Date().toISOString(), last_error: result.error || "", screenshot_path: result.screenshot_path || "", account_name: result.account_name || "", account_url: result.account_url || "", check_steps: socialArray(result.check_steps) };
      if (session) await updateRow("social_publisher_sessions", session, values); else await createRow("social_publisher_sessions", values);
      await socialCreateHistory(job, platform, status, { error: result.error, post_url: result.account_url });
    }
    return updateRow("social_post_jobs", job, { platform_state: state, status: platforms.every(platform => state[platform] === "connected") ? "completed" : "manual_attention", last_error: errors.join("; ").slice(0, 10000), completed_at: new Date().toISOString() });
  }
  if (name === "report") {
    const job = await byId("social_post_jobs", String(body.job_id || ""));
    if (!job) throw new HttpError(404, "Socialmediataak niet gevonden.");
    const state = socialObject(job.platform_state); state[body.platform] = body.status || "failed";
    const targets = socialArray(socialObject(job.payload).target_platforms); const platforms = targets.length ? targets : ["facebook", "instagram"];
    const successes = ["published", "dry_run"]; const paused = socialArray(setting.paused_platforms);
    const allDone = platforms.every(platform => paused.includes(platform) || successes.includes(state[platform]));
    const changes = { platform_state: state, last_error: body.error ? String(body.error).slice(0, 10000) : job.last_error || "" };
    if (body.status === "rate_limited") { changes.status = "failed"; changes.next_retry_at = new Date(Date.now() + Math.max(900, Math.min(Number(body.retry_after_seconds) || 3600, 86400)) * 1000).toISOString(); }
    else if (platforms.some(platform => state[platform] === "manual_attention")) changes.status = "manual_attention";
    else if (allDone) { changes.status = setting.dry_run ? "dry_run_complete" : "completed"; changes.completed_at = new Date().toISOString(); }
    else if (body.status === "failed") { const attempts = Number(job.attempts || 0) + 1; changes.attempts = attempts; changes.status = attempts >= 3 ? "manual_attention" : "failed"; if (attempts < 3) changes.next_retry_at = new Date(Date.now() + [60000, 300000, 900000][attempts - 1]).toISOString(); }
    else changes.status = "processing";
    const updated = await updateRow("social_post_jobs", job, changes);
    await socialCreateHistory(updated, body.platform, body.status || "failed", { error: body.error, post_url: body.post_url, screenshot_path: body.screenshot_path });
    if (allDone && job.source_type === "spotlight") await updateRow("social_publisher_settings", setting, { spotlight_next_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString() });
    return updated;
  }
  throw new HttpError(400, `Onbekende Social Publisher-actie: ${name}`);
}

async function handleRpc(name, body, user) {
  if (name === "generate_order_number") return nextOrderNumber();
  if (name === "create_guest_order") {
    const order = body.p_order || {};
    if (!order.customer_name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(order.customer_email || ""))) throw new HttpError(400, "Ongeldige klantgegevens.");
    const created = await createRow("orders", orderDefaults({ ...order, user_id: user ? legacyUserId(user) : null }), user?.$id);
    return [{ id: created.id, customer_order_token: created.customer_order_token }];
  }
  if (name === "attach_order_file") {
    requireUser(user);
    const order = await byId("orders", String(body.order_id || ""));
    if (!order) throw new HttpError(404, "Bestelling niet gevonden.");
    if (!user.labels?.includes("admin") && order.user_id !== legacyUserId(user)) throw new HttpError(403, "Dit bestand hoort niet bij uw bestelling.");
    const storagePath = String(body.storage_path || "").trim();
    const originalFilename = String(body.original_filename || "").trim();
    if (!storagePath || !originalFilename) throw new HttpError(400, "Bestandsgegevens ontbreken.");
    const stored = await socialMediaRecord(storagePath);
    if (!stored?._appwrite_file_id) throw new HttpError(409, "Het geüploade bestand is nog niet volledig in Appwrite-opslag geregistreerd.");
    const ownership = {
      customer_visible: true,
      file_purpose: "customer_order_upload",
      owner_user_id: legacyUserId(user),
      created_at: new Date().toISOString(),
    };
    const existing = await one("order_files", "storage_path", storagePath);
    if (existing) {
      if (existing.order_id !== order.id) throw new HttpError(403, "Dit opslagpad is al aan een andere bestelling gekoppeld.");
      return updateRow("order_files", existing, { ...ownership, original_filename: originalFilename.slice(0, 255), file_size: Math.max(0, Number(body.file_size || existing.file_size || 0)), mime_type: String(body.mime_type || existing.mime_type || "application/octet-stream").slice(0, 255) });
    }
    return createRow("order_files", {
      order_id: order.id,
      storage_path: storagePath,
      original_filename: originalFilename.slice(0, 255),
      file_size: Math.max(0, Number(body.file_size || 0)),
      mime_type: String(body.mime_type || "application/octet-stream").slice(0, 255),
      ...ownership,
    }, user.$id);
  }
  if (name === "check_discount_code") return discountResult(body);
  if (name === "check_gift_card") {
    const gift = await one("gift_cards", "code", String(body.code_text || "").trim().toUpperCase());
    return gift?.active && Number(gift.remaining_balance || 0) > 0 ? { valid: true, code: gift.code, remaining_balance: Number(gift.remaining_balance) } : { valid: false, message: "Cadeaubon is ongeldig of leeg." };
  }
  if (name === "record_discount_redemption") {
    const discount = await one("discount_codes", "code", String(body.code_text || "").trim().toUpperCase());
    if (!discount) throw new HttpError(404, "Kortingscode niet gevonden.");
    await updateRow("discount_codes", discount, { times_used: Number(discount.times_used || 0) + 1 });
    await createRow("discount_redemptions", { discount_code_id: discount.id, order_id: body.order_id_value, discount_amount: Number(body.discount_amount_value || 0), user_id: user ? legacyUserId(user) : null }, user?.$id);
    return true;
  }
  if (name === "redeem_gift_card") {
    const card = await one("gift_cards", "code", String(body.code_text || "").trim().toUpperCase());
    if (!card?.active) throw new HttpError(404, "Cadeaubon niet gevonden.");
    const used = Math.min(Math.max(0, Number(body.requested_amount || 0)), Number(card.remaining_balance || 0));
    const remaining = Math.round((Number(card.remaining_balance || 0) - used) * 100) / 100;
    await updateRow("gift_cards", card, { remaining_balance: remaining, active: remaining > 0 });
    await createRow("gift_card_redemptions", { gift_card_id: card.id, order_id: body.order_id_value, amount: used, user_id: user ? legacyUserId(user) : null }, user?.$id);
    return used;
  }
  if (name === "convert_loyalty_points") {
    requireUser(user);
    const points = Number(body.points_to_redeem || 0);
    const profile = await one("profiles", "user_id", legacyUserId(user));
    if (!Number.isInteger(points) || points < 1) throw new HttpError(400, "Wissel minimaal één punt in.");
    if (!profile || points > Number(profile.loyalty_points || 0)) throw new HttpError(400, "Onvoldoende punten.");
    const code = randomCode("LOYAL-");
    const euros = Number(await appSetting("loyalty_euros_per_point", 0.05)) || 0.05;
    await updateRow("profiles", profile, { loyalty_points: Number(profile.loyalty_points || 0) - points });
    await createRow("loyalty_transactions", { user_id: legacyUserId(user), points: -points, kind: "redeemed", description: `Ingewisseld voor kortingscode ${code}` }, user.$id);
    await createRow("discount_codes", { code, discount_type: "fixed", discount_value: Math.round(points * euros * 100) / 100, max_uses: 1, times_used: 0, assigned_to_email: user.email, active: true, is_public: false, starts_at: new Date().toISOString(), per_customer_limit: 1, stackable: false });
    return code;
  }
  if (name === "refresh_order_plate_data") {
    requireAdmin(user); const order = await byId("orders", body.p_order_id); if (!order) return { refreshed: false, reason: "order_not_found" };
    return { refreshed: true, orderId: order.id, platePrintStatuses: order.plate_print_statuses || [], plateRunsCompleted: order.plate_runs_completed || [], plateRunsRequired: order.plate_runs_required_per_plate || [], platesCompleted: Number(order.plates_completed || 0) };
  }
  // Superseded by the compatibility-complete implementations below.
  if (false && name === "claim_order_to_account") {
    requireUser(user); const order = await one("orders", "customer_order_token", body.p_token); if (!order) throw new HttpError(404, "Bestelling niet gevonden.");
    if (String(order.customer_email || "").toLowerCase() !== String(user.email || "").toLowerCase()) throw new HttpError(403, "Gebruik hetzelfde e-mailadres als bij de bestelling.");
    await updateRow("orders", order, { user_id: legacyUserId(user) }); return true;
  }
  if (false && name === "save_order_3mf_plate_selection") {
    requireAdmin(user); const order = await byId("orders", body.p_order_id); const mappings = body.p_mappings;
    if (!order) throw new HttpError(404, "Bestelling niet gevonden.");
    if (!Array.isArray(mappings) || !mappings.length) throw new HttpError(400, "Selecteer minimaal één plaat.");
    const unique = new Set(mappings.map(item => `${item.orderFileId}:${item.sourcePlateNumber}`)); if (unique.size !== mappings.length) throw new HttpError(400, "Dezelfde bronplaat is meer dan één keer geselecteerd.");
    const files = await listRows("order_files"); const oldMappings = (await listRows("order_3mf_plate_mappings")).filter(item => item.order_id === order.id); const jobs = (await listRows("print_jobs")).filter(item => item.order_id === order.id);
    for (const mapping of oldMappings) await updateRow("order_3mf_plate_mappings", mapping, { active: false, logical_plate_number: null });
    for (const job of jobs) await updateRow("print_jobs", job, { active: false });
    const statuses = [], completed = [], required = [], savedMappings = [];
    for (let index = 0; index < mappings.length; index += 1) {
      const input = mappings[index]; const logical = index + 1; const sourcePlate = Number(input.sourcePlateNumber || 0); if (!Number.isInteger(sourcePlate) || sourcePlate < 1) throw new HttpError(400, "Ongeldig bronplaatnummer.");
      const file = files.find(item => item.id === input.orderFileId && item.order_id === order.id); if (!file) throw new HttpError(400, "3MF-bestand hoort niet bij deze bestelling.");
      let mapping = oldMappings.find(item => item.order_file_id === file.id && Number(item.source_plate_number) === sourcePlate);
      const priorCompleted = Number(mapping?.runs_completed || 0); const runsRequired = Math.max(1, priorCompleted, Number(input.runsRequired || 1));
      const values = { order_id: order.id, order_file_id: file.id, source_plate_number: sourcePlate, logical_plate_number: logical, source_file_name: input.sourceFileName || file.original_filename || "", preview_storage_path: input.previewStoragePath || mapping?.preview_storage_path || null, colors: Array.isArray(input.colors) ? input.colors : [], runs_required: runsRequired, runs_completed: priorCompleted, active: true, updated_at: new Date().toISOString() };
      mapping = mapping ? await updateRow("order_3mf_plate_mappings", mapping, values) : await createRow("order_3mf_plate_mappings", { ...values, created_at: new Date().toISOString() });
      await updateRow("order_files", file, { customer_visible: false, file_purpose: "production_3mf" });
      let job = jobs.find(item => item.plate_mapping_id === mapping.id || item.source_order_file_id === file.id && Number(item.source_plate_number) === sourcePlate);
      const jobValues = { order_id: order.id, plate_mapping_id: mapping.id, source_order_file_id: file.id, source_plate_number: sourcePlate, plate_number: logical, plate_name: `Plaat ${logical}`, expected_file_name: file.original_filename || "", three_mf_storage_path: file.storage_path || "", runs_required: runsRequired, runs_completed: priorCompleted, colors: values.colors, status: priorCompleted >= runsRequired ? "completed" : "queued", active: true, printer_id: null, suggested_at: null, approved_at: null, approved_by: null };
      job = job ? await updateRow("print_jobs", job, jobValues) : await createRow("print_jobs", jobValues);
      statuses.push(priorCompleted >= runsRequired); completed.push(priorCompleted); required.push(runsRequired);
      savedMappings.push({ id: mapping.id, orderFileId: file.id, sourcePlateNumber: sourcePlate, logicalPlateNumber: logical, sourceFileName: values.source_file_name, previewStoragePath: values.preview_storage_path, colors: values.colors, runsRequired, runsCompleted: priorCompleted });
    }
    const platesCompleted = statuses.filter(Boolean).length;
    await updateRow("orders", order, { total_plates: mappings.length, plate_print_statuses: statuses, plate_runs_completed: completed, plate_runs_required_per_plate: required, plates_completed: platesCompleted });
    return { saved: true, totalPlates: mappings.length, platePrintStatuses: statuses, plateRunsCompleted: completed, plateRunsRequired: required, platesCompleted, mappings: savedMappings };
  }
  if (false && name === "approve_and_count_print_job_run") {
    requireAdmin(user); const suggestion = await byId("print_jobs", body.p_suggestion_job_id); const plate = Number(body.p_plate_number || 0);
    if (!suggestion) return { counted: false, reason: "suggestion_not_found" }; if (suggestion.status !== "suggested") return { counted: false, reason: "suggestion_not_active" }; if (!suggestion.printer_id) return { counted: false, reason: "printer_missing" };
    const order = await byId("orders", suggestion.order_id); if (!order || ["completed", "cancelled"].includes(order.status)) return { counted: false, reason: "order_closed" };
    const jobs = (await listRows("print_jobs")).filter(item => item.order_id === order.id && item.active !== false); const job = jobs.find(item => Number(item.plate_number) === plate); if (!job) return { counted: false, reason: "plate_job_not_found" };
    const needed = Math.max(1, Number(job.runs_required || 1)); const before = Number(job.runs_completed || 0); if (job.status === "completed" || before >= needed) return { counted: false, reason: "already_fully_printed" };
    const runNumber = Math.min(needed, before + 1); const remaining = Math.max(0, needed - runNumber); const done = remaining === 0; const total = Math.max(Number(order.total_plates || 0), plate); const runs = [...socialArray(order.plate_runs_completed)]; const statuses = [...socialArray(order.plate_print_statuses)]; while (runs.length < total) runs.push(0); while (statuses.length < total) statuses.push(false); runs[plate - 1] = runNumber; statuses[plate - 1] = done;
    await createRow("print_runs", { print_job_id: job.id, printer_id: suggestion.printer_id, run_number: runNumber, observed_file_name: suggestion.observed_file_name || job.observed_file_name || job.expected_file_name || "", status: "completed", completed_at: new Date().toISOString(), filament_used_grams: Number(job.estimated_filament_grams || 0), raw_status: { source: "admin_approval", suggestionJobId: suggestion.id, approvedBy: legacyUserId(user) } });
    await updateRow("print_jobs", job, { runs_completed: runNumber, status: done ? "completed" : "awaiting_next_run", printer_id: suggestion.printer_id, completed_at: done ? new Date().toISOString() : null, approved_at: new Date().toISOString(), approved_by: legacyUserId(user), observed_file_name: suggestion.observed_file_name || job.expected_file_name || "", comparison: { ...socialObject(job.comparison), match: true, countedByAdminAt: new Date().toISOString(), countedSuggestionJobId: suggestion.id, remainingRuns: remaining } });
    if (suggestion.id !== job.id) await updateRow("print_jobs", suggestion, { status: "queued", printer_id: null, suggested_at: null, observed_file_name: null, approved_at: null, approved_by: null });
    await updateRow("orders", order, { plate_runs_completed: runs, plate_print_statuses: statuses, plates_completed: statuses.filter(Boolean).length, filament_used_g: Number(order.filament_used_g || 0) + Number(job.estimated_filament_grams || 0), print_duration_minutes: Number(order.print_duration_minutes || 0) + Number(job.estimated_duration_minutes || 0) });
    await createRow("order_events", { order_id: order.id, event_type: "print_run_completed", event_description: done ? `Plaat ${plate} is volledig geprint (${runNumber} van ${needed} printruns).` : `Plaat ${plate}: printrun ${runNumber} van ${needed} voltooid; nog ${remaining} te printen.`, performed_by: legacyUserId(user), visible_to_customer: true });
    return { counted: true, runNumber, runsRequired: needed, remainingRuns: remaining, completed: done, plateNumber: plate };
  }
  if (name === "record_manual_order_plate_run" || name === "decrement_manual_order_plate_run") {
    requireAdmin(user); const order = await byId("orders", body.p_order_id); if (!order) throw new HttpError(404, "Bestelling niet gevonden.");
    const plate = Number(body.p_plate_number || 0); const total = Number(order.total_plates || 0); if (!Number.isInteger(plate) || plate < 1 || plate > total) throw new HttpError(400, "Ongeldig plaatnummer.");
    const completed = [...(order.plate_runs_completed || [])]; const required = [...(order.plate_runs_required_per_plate || [])]; const statuses = [...(order.plate_print_statuses || [])];
    while (completed.length < total) completed.push(0); while (required.length < total) required.push(1); while (statuses.length < total) statuses.push(false);
    const before = Number(completed[plate - 1] || 0); const needed = Math.max(1, Number(required[plate - 1] || 1)); const decrement = name.startsWith("decrement"); const after = decrement ? Math.max(0, before - 1) : Math.min(needed, before + 1);
    completed[plate - 1] = after; statuses[plate - 1] = after >= needed;
    await updateRow("orders", order, { plate_runs_completed: completed, plate_runs_required_per_plate: required, plate_print_statuses: statuses, plates_completed: statuses.filter(Boolean).length });
    await createRow("order_events", { order_id: order.id, event_type: decrement ? "plate_print_correction" : "plate_printed", event_description: `Plaat ${plate}: ${after} van ${needed} uitvoeringen geregistreerd.`, performed_by: legacyUserId(user), visible_to_customer: true }, user.$id);
    return { counted: !decrement && after !== before, decremented: decrement && after !== before, plateNumber: plate, runsCompleted: after, runsRequired: needed, remaining: Math.max(0, needed - after), completed: after >= needed, platesCompleted: statuses.filter(Boolean).length, plateRunsCompleted: completed, platePrintStatuses: statuses, plateRunsRequired: required };
  }
  if (name === "request_printer_ams_refresh" || name === "request_bambu_login_code") {
    requireAdmin(user); const printer = await byId("printers", body.p_printer_id); if (!printer) throw new HttpError(404, "Printer niet gevonden.");
    if (name === "request_printer_ams_refresh") { const raw = { ...(printer.raw_status || {}) }; const requestId = Number(raw.ams_refresh_request_id || 0) + 1; raw.ams_refresh_request_id = requestId; raw.ams_refresh_requested_at = new Date().toISOString(); await updateRow("printers", printer, { raw_status: raw }); return requestId; }
    const requestId = Number(printer.bambu_login_request_id || 0) + 1; await updateRow("printers", printer, { bambu_login_request_id: requestId, bambu_login_requested_at: new Date().toISOString(), bambu_login_last_error: null }); return requestId;
  }
  if (name === "promote_inventory_to_filament_color") {
    requireAdmin(user); const inventory = await byId("filament_inventory", body.p_inventory_id); if (!inventory) throw new HttpError(404, "De voorraadregel bestaat niet meer.");
    const color = await createRow("filament_colors", { name: String(body.p_name || "").trim(), material: String(body.p_material || "").trim().toUpperCase(), hex: String(body.p_hex || "").trim().toUpperCase(), description: String(body.p_description || "").trim(), sort_order: (await listRows("filament_colors")).length, active: body.p_active !== false });
    await updateRow("filament_inventory", inventory, { filament_color_id: color.id, inventory_key: `palette:${color.id}` }); return color.id;
  }
  if (name === "claim_order_to_account") {
    requireUser(user); const token = String(body.p_token || ""); if (token.length < 32) throw new HttpError(400, "Ongeldige bestellink.");
    const order = await one("orders", "customer_order_token", token); if (!order) return false;
    const owner = legacyUserId(user); if (order.user_id !== owner) {
      await updateRow("orders", order, { user_id: owner });
      await createRow("order_events", { order_id: order.id, event_type: "account_link_changed", event_description: order.user_id ? "Bestelling naar een ander klantaccount overgezet." : "Bestelling aan een klantaccount gekoppeld.", performed_by: owner, visible_to_customer: false }, user.$id);
    }
    return true;
  }
  if (name === "save_order_3mf_plate_selection") {
    requireAdmin(user); const order = await byId("orders", body.p_order_id); if (!order) throw new HttpError(404, "Bestelling niet gevonden."); const requested = socialArray(body.p_mappings);
    if (!requested.length) throw new HttpError(400, "Selecteer minimaal één plaat.");
    const unique = new Set(requested.map(item => `${item.orderFileId}:${Number(item.sourcePlateNumber)}`)); if (unique.size !== requested.length) throw new HttpError(400, "Dezelfde bronplaat is meer dan één keer geselecteerd.");
    const allMappings = (await listRows("order_3mf_plate_mappings")).filter(item => item.order_id === order.id); const allJobs = (await listRows("print_jobs")).filter(item => item.order_id === order.id);
    for (const mapping of allMappings) await updateRow("order_3mf_plate_mappings", mapping, { active: false, logical_plate_number: null });
    for (const job of allJobs) await updateRow("print_jobs", job, { active: false });
    const orderFiles = await listRows("order_files"); const statuses = []; const completedRuns = []; const requiredRuns = []; const output = [];
    for (let index = 0; index < requested.length; index += 1) {
      const item = requested[index]; const sourcePlate = Number(item.sourcePlateNumber || 0); if (!Number.isInteger(sourcePlate) || sourcePlate < 1) throw new HttpError(400, "Ongeldig bronplaatnummer.");
      const orderFile = orderFiles.find(file => file.id === item.orderFileId && file.order_id === order.id); if (!orderFile) throw new HttpError(400, "3MF-bestand hoort niet bij deze bestelling.");
      const logical = index + 1; let mapping = allMappings.find(value => value.order_file_id === orderFile.id && Number(value.source_plate_number) === sourcePlate);
      const runsCompleted = Math.max(0, Number(mapping?.runs_completed || 0)); const runsRequired = Math.max(1, Number(item.runsRequired || 1), Number(mapping?.runs_required || 1), runsCompleted);
      const mappingValues = { order_id: order.id, order_file_id: orderFile.id, source_plate_number: sourcePlate, logical_plate_number: logical, source_file_name: item.sourceFileName || orderFile.original_filename, preview_storage_path: item.previewStoragePath || mapping?.preview_storage_path || null, colors: socialArray(item.colors), runs_required: runsRequired, runs_completed: runsCompleted, active: true };
      mapping = mapping ? await updateRow("order_3mf_plate_mappings", mapping, mappingValues) : await createRow("order_3mf_plate_mappings", mappingValues);
      await updateRow("order_files", orderFile, { customer_visible: false, file_purpose: "production_3mf" });
      let printJob = allJobs.find(value => value.plate_mapping_id === mapping.id);
      const printValues = { order_id: order.id, plate_mapping_id: mapping.id, source_order_file_id: orderFile.id, source_plate_number: sourcePlate, plate_number: logical, plate_name: `Plaat ${logical}`, expected_file_name: orderFile.original_filename, three_mf_storage_path: orderFile.storage_path, runs_required: runsRequired, runs_completed: runsCompleted, colors: socialArray(item.colors), status: runsCompleted >= runsRequired ? "completed" : "queued", printer_id: null, suggested_at: null, approved_at: null, approved_by: null, active: true };
      if (printJob) await updateRow("print_jobs", printJob, printValues); else await createRow("print_jobs", printValues);
      const completed = runsCompleted >= runsRequired; statuses.push(completed); completedRuns.push(runsCompleted); requiredRuns.push(runsRequired);
      output.push({ id: mapping.id, orderFileId: orderFile.id, sourcePlateNumber: sourcePlate, logicalPlateNumber: logical, sourceFileName: mappingValues.source_file_name, previewStoragePath: mappingValues.preview_storage_path, colors: mappingValues.colors, runsRequired, runsCompleted });
    }
    await updateRow("orders", order, { total_plates: requested.length, plate_print_statuses: statuses, plate_runs_completed: completedRuns, plate_runs_required_per_plate: requiredRuns, plates_completed: statuses.filter(Boolean).length });
    return { saved: true, totalPlates: requested.length, platePrintStatuses: statuses, plateRunsCompleted: completedRuns, plateRunsRequired: requiredRuns, platesCompleted: statuses.filter(Boolean).length, mappings: output };
  }
  if (name === "approve_and_count_print_job_run") {
    requireAdmin(user); const suggestion = await byId("print_jobs", body.p_suggestion_job_id); if (!suggestion) return { counted: false, reason: "suggestion_not_found" }; if (suggestion.status !== "suggested") return { counted: false, reason: "suggestion_not_active" }; if (!suggestion.printer_id) return { counted: false, reason: "printer_missing" };
    const order = await byId("orders", suggestion.order_id); if (!order || ["completed", "cancelled"].includes(order.status)) return { counted: false, reason: "order_closed" };
    const plate = Number(body.p_plate_number || 0); if (!Number.isInteger(plate) || plate < 1 || plate > Math.max(1, Number(order.total_plates || 0))) return { counted: false, reason: "plate_out_of_range" };
    const target = (await listRows("print_jobs")).find(job => job.order_id === order.id && Number(job.plate_number) === plate && job.active !== false); if (!target) return { counted: false, reason: "plate_job_not_found" };
    const required = Math.max(1, Number(target.runs_required || 1)); const current = Math.max(Number(target.runs_completed || 0), Number(socialArray(order.plate_runs_completed)[plate - 1] || 0)); if (target.status === "completed" || current >= required) return { counted: false, reason: "already_fully_printed" };
    const runNumber = Math.min(required, current + 1); const remaining = Math.max(0, required - runNumber); const completed = remaining === 0; const observed = suggestion.observed_file_name || target.observed_file_name || target.expected_file_name || "";
    const oldRun = (await listRows("print_runs")).find(run => run.print_job_id === target.id && Number(run.run_number) === runNumber); const runValues = { print_job_id: target.id, printer_id: suggestion.printer_id, run_number: runNumber, observed_file_name: observed, status: "completed", completed_at: new Date().toISOString(), filament_used_grams: Number(target.estimated_filament_grams || 0), raw_status: { source: "admin_approval", suggestionJobId: suggestion.id, approvedBy: legacyUserId(user) } };
    if (oldRun) await updateRow("print_runs", oldRun, runValues); else await createRow("print_runs", runValues);
    if (suggestion.id !== target.id) await updateRow("print_jobs", suggestion, { status: "queued", printer_id: null, suggested_at: null, observed_file_name: null, approved_at: null, approved_by: null });
    await updateRow("print_jobs", target, { runs_completed: runNumber, status: completed ? "completed" : "awaiting_next_run", printer_id: suggestion.printer_id, completed_at: completed ? new Date().toISOString() : null, approved_at: new Date().toISOString(), approved_by: legacyUserId(user), observed_file_name: observed, comparison: { ...socialObject(target.comparison), match: true, countedByAdminAt: new Date().toISOString(), countedSuggestionJobId: suggestion.id, remainingRuns: remaining } });
    const total = Math.max(Number(order.total_plates || 0), plate); const runs = [...socialArray(order.plate_runs_completed)]; const statuses = [...socialArray(order.plate_print_statuses)]; while (runs.length < total) runs.push(0); while (statuses.length < total) statuses.push(false); runs[plate - 1] = runNumber; statuses[plate - 1] = completed;
    await updateRow("orders", order, { plate_runs_completed: runs, plate_print_statuses: statuses, plates_completed: statuses.filter(Boolean).length, filament_used_g: Number(order.filament_used_g || 0) + Number(target.estimated_filament_grams || 0), print_duration_minutes: Number(order.print_duration_minutes || 0) + Number(target.estimated_duration_minutes || 0) });
    await createRow("order_events", { order_id: order.id, event_type: "print_run_completed", event_description: completed ? `Plaat ${plate} is volledig geprint (${runNumber} van ${required} printruns).` : `Plaat ${plate}: printrun ${runNumber} van ${required} voltooid; nog ${remaining} te printen.`, performed_by: legacyUserId(user), visible_to_customer: true }, user.$id);
    return { counted: true, runNumber, runsRequired: required, remainingRuns: remaining, completed, plateNumber: plate };
  }
  if (name === "get_social_publisher_settings") { requireAdmin(user); return socialSetting(); }
  if (name === "social_publisher_status") {
    requireAdmin(user); const setting = await socialSetting(); const seen = setting.publisher_last_seen_at ? new Date(setting.publisher_last_seen_at).getTime() : NaN; const age = Number.isFinite(seen) ? Math.max(0, (Date.now() - seen) / 1000) : null;
    return { hook_version: "1.19.21", backend_version: "appwrite-1.5.1", publisher_last_seen_at: setting.publisher_last_seen_at || null, publisher_connected: age !== null && age <= 90, publisher_age_seconds: age, publisher_version: setting.publisher_version || "" };
  }
  if (name === "set_social_publisher_enabled") { requireAdmin(user); const setting = await socialSetting(); await updateRow("social_publisher_settings", setting, { enabled: Boolean(body.p_enabled) }); return { enabled: Boolean(body.p_enabled) }; }
  if (name === "social_publisher_next_post") {
    requireAdmin(user); const setting = await socialSetting(); const jobs = await listRows("social_post_jobs");
    const processing = jobs.filter(job => job.status === "processing" && job.source_type !== "session_check").sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0));
    const candidates = jobs.filter(job => ["queued", "failed"].includes(job.status) && job.source_type !== "session_check" && socialTargetPlatforms(job, setting).length).sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0) || socialReadyAt(a, setting) - socialReadyAt(b, setting));
    const job = processing[0] || candidates[0];
    if (!job) return { state: "none", source_name: "", source_type: "", scheduled_at: null, platforms: [], is_backfill: false };
    const readyAt = processing.length ? Date.parse(job.claimed_at || job.scheduled_at || "") : socialReadyAt(job, setting);
    return { state: processing.length ? "processing" : setting.enabled ? setting.dry_run ? "dry_run" : "scheduled" : "paused", source_name: job.source_name || "", source_type: job.source_type || "", scheduled_at: Number.isFinite(readyAt) ? new Date(readyAt).toISOString() : null, due: Number.isFinite(readyAt) && readyAt <= Date.now(), platforms: socialTargetPlatforms(job, setting), is_backfill: Boolean(job.is_backfill) };
  }
  if (name === "social_publisher_activity") {
    requireAdmin(user); const histories = (await listRows("social_post_history")).sort((a, b) => Date.parse(b.published_at || "") - Date.parse(a.published_at || "")).slice(0, 100); const jobs = await listRows("social_post_jobs"); const jobMap = new Map(jobs.map(job => [job.id, job]));
    return histories.map(item => { const job = jobMap.get(item.job_id); const details = socialObject(item.details); return { id: item.id, job_id: item.job_id, source_name: details.source_name || job?.source_name || "Onbekende taak", source_type: details.source_type || job?.source_type || "", platform: item.platform, status: item.status, post_url: item.post_url || "", error: details.error || "", happened_at: item.published_at }; });
  }
  if (name === "set_social_facebook_mode") {
    requireAdmin(user); const job = await byId("social_post_jobs", body.p_job_id); if (!job) throw new HttpError(404, "Socialmediataak niet gevonden."); if (!["combined", "separate"].includes(body.p_mode)) throw new HttpError(400, "Ongeldige Facebookindeling.");
    const payload = socialObject(job.payload); payload.facebook_media_mode = body.p_mode; await updateRow("social_post_jobs", job, { payload }); return { mode: body.p_mode };
  }
  if (name === "enqueue_social_backfill") {
    requireAdmin(user); const setting = await socialSetting(); const before = await listRows("social_post_jobs"); await socialSyncCatalog(setting); const after = await listRows("social_post_jobs"); const added = after.filter(job => !before.some(old => old.id === job.id));
    return { queued: added.length, updated: 0, already_done: before.length, waiting_for_media: added.filter(job => job.status === "waiting_for_media").length, products: added.filter(job => job.source_type === "product").length, colors: added.filter(job => job.source_type === "color").length };
  }
  if (name === "publish_social_job_now") {
    requireAdmin(user); const setting = await socialSetting(); const job = await byId("social_post_jobs", body.p_job_id); if (!job) throw new HttpError(404, "Socialmediataak niet gevonden.");
    const payload = socialObject(job.payload); payload.force_now = true; payload.force_priority_original = Number(job.priority || 0); await updateRow("social_post_jobs", job, { status: "queued", scheduled_at: new Date().toISOString(), next_retry_at: "", priority: 10000, payload, attempts: 0 });
    let wakeSent = false; const control = String(setting.control_url || "").replace(/\/+$/, "");
    if (/^http:\/\/(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)[^/]+(?::\d+)?$/i.test(control) && setting.integration_token) {
      try { const response = await fetch(`${control}/api/wake`, { method: "POST", headers: { "X-Overweel-Social-Token": setting.integration_token } }); wakeSent = response.ok; } catch { wakeSent = false; }
    }
    return { queued: true, wake_sent: wakeSent };
  }
  if (name === "clear_social_publisher_queue") {
    requireAdmin(user); const jobs = await listRows("social_post_jobs"); for (const job of jobs) await deleteRow("social_post_jobs", job); return { deleted: jobs.length };
  }
  if (name === "pair_social_publisher") {
    requireAdmin(user); const setting = await socialSetting(); const control = String(body.p_control_url || "").replace(/\/+$/, ""); if (!/^http:\/\/(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)[^/]+(?::\d+)?$/i.test(control)) throw new HttpError(400, "Gebruik een lokaal containeradres.");
    const pairingResponse = await fetch(`${control}/api/pair`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pairing_code: String(body.p_pairing_code || ""), token: String(body.p_integration_token || ""), pocketbase_url: endpoint }) });
    if (!pairingResponse.ok) { let detail = "Container heeft de koppeling geweigerd."; try { detail = (await pairingResponse.json()).detail || detail; } catch {} throw new HttpError(502, detail); }
    await updateRow("social_publisher_settings", setting, { control_url: control, integration_token: String(body.p_integration_token || "") }); return { paired: true };
  }
  throw new HttpError(501, `RPC-functie is nog niet geïmplementeerd in Appwrite: ${name}`);
}

async function handleFunction(name, body, user) {
  if (name === "send-account-welcome") {
    requireUser(user);
    const userId = legacyUserId(user);
    let profile = await one("profiles", "user_id", userId);
    if (!profile) profile = await createRow("profiles", {
      user_id: userId,
      full_name: String(body.fullName || user.name || "").trim(),
      email: String(user.email || "").trim().toLowerCase(),
      country: "Nederland",
      billing_address: "",
      shipping_address: "",
      loyalty_points: 0,
      account_welcome_email_sent_at: null,
    }, user.$id);
    if (profile.account_welcome_email_sent_at) return { success: true, alreadySent: true };
    await sendMail(user.email, "Welkom bij Overweel3D", "<p>Uw account is aangemaakt. U hoeft uw e-mailadres niet te bevestigen. In uw dashboard kunt u bestellingen bekijken, berichten lezen en uw profiel beheren.</p>", undefined, { ctaUrl: `${SITE_URL}/dashboard`, ctaLabel: "Naar mijn dashboard" });
    await updateRow("profiles", profile, { account_welcome_email_sent_at: new Date().toISOString() });
    return { success: true };
  }
  if (name === "send-contact-message") { if (!body.name || !body.subject || !body.message) throw new HttpError(400, "Vul alle velden in."); const safeEmail = String(body.email || "").trim(); await sendMail("gijsoverweel@gmail.com", `Contact: ${String(body.subject).slice(0, 150)}`, `<p><strong>Van:</strong> ${escapeHtml(body.name)}<br><strong>E-mail:</strong> ${escapeHtml(safeEmail)}</p><div style="margin-top:20px;padding:18px;background:#f7f7f5;border-radius:12px;">${escapeHtml(body.message).replace(/\r?\n/g, "<br>")}</div>`, safeEmail, { ctaUrl: `mailto:${encodeURIComponent(safeEmail)}`, ctaLabel: "Bericht beantwoorden" }); return { success: true }; }
  if (name === "get-order-by-token") {
    const order = await one("orders", "customer_order_token", body.token); if (!order || String(body.token || "").length < 24) throw new HttpError(404, "Bestelling niet gevonden.");
    if (body.action === "send_message") { const message = String(body.message || "").trim(); if (!message || message.length > 4000) throw new HttpError(400, "Bericht moet tussen 1 en 4000 tekens zijn."); await createRow("order_messages", { order_id: order.id, sender_type: "customer", sender_id: order.user_id || null, message, read: false, created_at: new Date().toISOString() }); try { await sendMail("gijsoverweel@gmail.com", `Nieuw bericht bij bestelling ${order.order_number}`, `<p>Er staat een nieuw klantbericht klaar bij bestelling <strong>${escapeHtml(order.order_number)}</strong>.</p><div style="margin-top:20px;padding:18px;background:#f7f7f5;border-radius:12px;">${escapeHtml(message).replace(/\r?\n/g, "<br>")}</div>`, undefined, { ctaUrl: orderAdminUrl(order), ctaLabel: "Bestelling en chat openen" }); } catch {} return { success: true }; }
    if (body.action === "propose_delivery") { const value = body.appointmentData || {}; if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value.date || ""))) throw new HttpError(400, "Ongeldig bezorgvoorstel."); await createRow("delivery_appointments", { order_id: order.id, proposed_date: value.date, proposed_time_slot: String(value.timeSlot || "Overdag").slice(0, 100), status: "pending", proposed_by: "customer", customer_notes: String(value.notes || "").slice(0, 2000), created_at: new Date().toISOString(), updated_at: new Date().toISOString() }); return { success: true }; }
    if (body.action === "update_shipping_address") { const value = body.addressData || {}; if (!value.shipping_address || !value.postal_code || !value.city) throw new HttpError(400, "Vul het volledige verzendadres in."); await updateRow("orders", order, { shipping_address: String(value.shipping_address).slice(0, 500), billing_address: "", postal_code: String(value.postal_code).trim().toUpperCase().slice(0, 32), city: String(value.city).trim().slice(0, 120), country: String(value.country || "Nederland").trim().slice(0, 120) }); await createRow("order_events", { order_id: order.id, event_type: "shipping_address_added", event_description: "De klant heeft het ontbrekende verzendadres ingevuld.", visible_to_customer: true, created_at: new Date().toISOString() }); return { success: true }; }
    if (body.action === "get_file_url") { const file = await byId("order_files", body.fileId); if (!file || file.order_id !== order.id || file.customer_visible === false) throw new HttpError(404, "Bestand niet gevonden."); const stored = await socialMediaRecord(file.storage_path); if (!stored?._appwrite_file_id) throw new HttpError(404, "Bestand staat niet in Appwrite-opslag."); return { signedUrl: customerFileUrl(order.customer_order_token, { file_id: file.id, download: body.download ? "1" : "" }) }; }
    if (body.action) throw new HttpError(400, `Onbekende bestelactie: ${body.action}`);
    const files = (await listRows("order_files")).filter(item => item.order_id === order.id && item.customer_visible !== false).map(item => ({ id: item.id, storage_path: item.storage_path, original_filename: item.original_filename, file_size: item.file_size }));
    const events = (await listRows("order_events")).filter(item => item.order_id === order.id && item.visible_to_customer !== false).sort((a, b) => Date.parse(b.created_at || "") - Date.parse(a.created_at || ""));
    const messages = (await listRows("order_messages")).filter(item => item.order_id === order.id).sort((a, b) => Date.parse(a.created_at || "") - Date.parse(b.created_at || ""));
    const appointments = (await listRows("delivery_appointments")).filter(item => item.order_id === order.id).sort((a, b) => Date.parse(b.created_at || "") - Date.parse(a.created_at || ""));
    const plates = (await listRows("order_3mf_plate_mappings")).filter(item => item.order_id === order.id && item.active !== false).sort((a, b) => Number(a.logical_plate_number || 0) - Number(b.logical_plate_number || 0));
    const storage = await listRows("storage_files");
    const selectedPlates = [];
    for (const plate of plates) { const stored = storage.find(item => item.path === plate.preview_storage_path); selectedPlates.push({ logicalPlateNumber: Number(plate.logical_plate_number || 0), previewUrl: stored?._appwrite_file_id ? customerFileUrl(order.customer_order_token, { path: plate.preview_storage_path }) : null, colors: socialArray(plate.colors) }); }
    const customerOrder = {
      id: order.id,
      order_number: order.order_number,
      customer_name: order.customer_name,
      customer_email: order.customer_email,
      material: order.material,
      color: order.color,
      quantity: order.quantity,
      notes: order.notes,
      instant_quote_price: order.instant_quote_price,
      final_price: order.final_price,
      applied_discount_code: order.applied_discount_code,
      tikkie_link: order.tikkie_link,
      status: order.status,
      customer_visible_notes: order.customer_visible_notes,
      customer_order_token: order.customer_order_token,
      submitted_at: order.submitted_at,
      order_method: order.order_method,
      file_links: order.file_links,
      approved_at: order.approved_at,
      rejected_at: order.rejected_at,
      billing_address: order.billing_address,
      shipping_address: order.shipping_address,
      postal_code: order.postal_code,
      city: order.city,
      country: order.country,
      total_products: order.total_products,
      total_plates: order.total_plates,
      plate_print_statuses: socialArray(order.plate_print_statuses),
      plate_runs_required_per_plate: socialArray(order.plate_runs_required_per_plate),
      plate_runs_completed: socialArray(order.plate_runs_completed),
      shipping_carrier: order.shipping_carrier,
      tracking_code: order.tracking_code,
      shipping_cost: order.shipping_cost,
      customer_upload_requested: order.customer_upload_requested,
      customer_upload_request_note: order.customer_upload_request_note,
      linked_to_account: Boolean(order.user_id),
      linked_to_current_user: Boolean(user && order.user_id === legacyUserId(user)),
    };
    return { order: customerOrder, files, events, messages, appointments, selectedPlates };
  }
  if (name === "update-order-status") { const order = await one("orders", "customer_order_token", body.token); if (!order) throw new HttpError(404, "Bestelling niet gevonden."); const status = body.action === "accept" ? "accepted" : body.action === "reject" ? "cancelled" : ""; if (!status) throw new HttpError(400, "Onbekende actie."); await updateRow("orders", order, { status }); await createRow("order_events", { order_id: order.id, event_type: "status_changed", event_description: status === "accepted" ? "Bestelling geaccepteerd" : "Bestelling afgewezen", visible_to_customer: true }); return { success: true, status }; }
  if (name === "complete-order") { requireAdmin(user); const order = await byId("orders", body.order_id); if (!order) throw new HttpError(404, "Bestelling niet gevonden."); await updateRow("orders", order, { status: "completed", completed_at: new Date().toISOString() }); await sendMail(order.customer_email, `Bestelling ${order.order_number} is voltooid`, `<p>Goed nieuws: bestelling <strong>${escapeHtml(order.order_number)}</strong> is volledig afgerond.</p><p>Via de persoonlijke bestelpagina kunt u de gegevens en berichten blijven bekijken.</p>`, undefined, { ctaUrl: orderCustomerUrl(order), ctaLabel: "Bestelling bekijken" }); return { success: true, statusMailSent: true }; }
  if (name === "send-order-email") { const order = await byId("orders", body.orderId); if (body.type === "test_email") { requireAdmin(user); await sendMail("gijsoverweel@gmail.com", "Overweel3D testmail", "<p>De e-mailverbinding en de nieuwe Overweel3D-opmaak werken correct.</p>", undefined, { ctaUrl: `${SITE_URL}/admin`, ctaLabel: "Admin openen" }); return { success: true }; } if (!order) throw new HttpError(404, "Bestelling niet gevonden."); const subject = body.type === "status_changed" ? `Status gewijzigd: bestelling ${order.order_number}` : `Bedankt voor uw bestelling! ${order.order_number}`; await sendMail(order.customer_email, subject, `<p>Bestelling <strong>${escapeHtml(order.order_number)}</strong></p><p>${escapeHtml(body.note || "Bedankt voor uw bestelling bij Overweel3D.").replace(/\r?\n/g, "<br>")}</p>`, undefined, { ctaUrl: orderCustomerUrl(order), ctaLabel: "Bestelling bekijken" }); return { success: true }; }
  if (name === "generate-invoice") {
    requireAdmin(user); const order = await byId("orders", body.orderId); if (!order) throw new HttpError(404, "Bestelling niet gevonden.");
    const productPrice = Number(order.final_price ?? order.instant_quote_price ?? 0); const shipping = Number(order.shipping_cost || 0); const total = productPrice + shipping; const invoiceNumber = `F-${order.order_number}`; const date = new Intl.DateTimeFormat("nl-NL", { dateStyle: "long", timeZone: "Europe/Amsterdam" }).format(new Date());
    const html = `<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>${escapeHtml(invoiceNumber)}</title><style>body{font-family:Arial,sans-serif;color:#111;margin:40px}.head,.row{display:flex;justify-content:space-between}.head{border-bottom:3px solid #111;padding-bottom:20px;margin-bottom:32px}table{width:100%;border-collapse:collapse;margin-top:30px}th,td{padding:12px;border-bottom:1px solid #ddd;text-align:left}th:last-child,td:last-child{text-align:right}.total{font-size:20px;font-weight:700;margin-top:24px;text-align:right}</style></head><body><div class="head"><div><h1>Overweel3D</h1><p>3D Print Service</p></div><div><h2>FACTUUR</h2><p>${escapeHtml(invoiceNumber)}<br>${escapeHtml(date)}</p></div></div><div class="row"><div><strong>Factuur aan</strong><p>${escapeHtml(order.customer_name)}<br>${escapeHtml(order.billing_address || order.shipping_address || "")}<br>${escapeHtml(`${order.postal_code || ""} ${order.city || ""}`)}<br>${escapeHtml(order.customer_email)}</p></div><div><strong>Van</strong><p>Overweel3D<br>gijsoverweel@gmail.com${body.bankAccount ? `<br>IBAN: ${escapeHtml(body.bankAccount)}` : ""}${body.kvkNumber ? `<br>KVK: ${escapeHtml(body.kvkNumber)}` : ""}</p></div></div><table><thead><tr><th>Omschrijving</th><th>Aantal</th><th>Bedrag</th></tr></thead><tbody><tr><td>${escapeHtml(body.description || `3D Print bestelling ${order.order_number}`)}</td><td>${Number(order.quantity || 1)}</td><td>€${productPrice.toFixed(2)}</td></tr>${shipping > 0 ? `<tr><td>Verzendkosten</td><td>1</td><td>€${shipping.toFixed(2)}</td></tr>` : ""}</tbody></table><div class="total">Totaal: €${total.toFixed(2)}</div><p>Er wordt geen btw afzonderlijk aan de prijs toegevoegd.</p></body></html>`;
    return { html, invoiceNumber };
  }
  if (name === "send-chat-notification") {
    requireUser(user); const order = await byId("orders", body.orderId); if (!order) throw new HttpError(404, "Bestelling niet gevonden."); const admin = user.labels?.includes("admin"); if (!admin && order.user_id !== legacyUserId(user)) throw new HttpError(403, "Geen toegang tot deze bestelling."); if (body.senderType === "admin" && !admin) throw new HttpError(403, "Adminrechten vereist.");
    const message = escapeHtml(String(body.message || "")).replace(/\r?\n/g, "<br>"); if (!message) throw new HttpError(400, "Bericht ontbreekt.");
    const target = body.senderType === "customer" ? "gijsoverweel@gmail.com" : order.customer_email; const adminTarget = body.senderType === "customer"; await sendMail(target, `Nieuw bericht bij bestelling ${order.order_number}`, `<p>Er is een nieuw bericht bij bestelling <strong>${escapeHtml(order.order_number)}</strong>.</p><div style="margin-top:20px;padding:18px;background:#f7f7f5;border-radius:12px;">${message}</div>`, undefined, { ctaUrl: adminTarget ? orderAdminUrl(order) : orderCustomerUrl(order), ctaLabel: adminTarget ? "Bestelling en chat openen" : "Bericht bekijken" }); return { success: true };
  }
  if (name === "process-referral-reward") {
    requireUser(user); const discount = await one("discount_codes", "code", String(body.discount_code || "").trim().toUpperCase()); if (!discount?.is_referral) return { ok: true, skipped: "not-a-referral" }; const order = await byId("orders", body.order_id); if (!order) throw new HttpError(404, "Bestelling niet gevonden."); if (!user.labels?.includes("admin") && order.user_id !== legacyUserId(user)) throw new HttpError(403, "Geen toegang tot deze bestelling."); if (!discount.owner_email || !discount.reward_percentage) return { ok: true, skipped: "incomplete-referral" }; if (String(order.customer_email || "").toLowerCase() === String(discount.owner_email).toLowerCase()) return { ok: true, skipped: "self-referral" };
    const existing = (await listRows("discount_codes")).find(item => item.source_order_id === order.id); if (existing) return { ok: true, skipped: "reward-already-created", reward: Number(existing.discount_value || 0), code: existing.code };
    const reward = Math.round(Number(order.final_price ?? order.instant_quote_price ?? 0) * Number(discount.reward_percentage) / 100 * 100) / 100; if (reward < 1) return { ok: true, skipped: "reward-too-small", reward }; const code = randomCode("REF-"); const expires = new Date(Date.now() + 90 * 86400000).toISOString(); await createRow("discount_codes", { code, discount_type: "fixed", discount_value: reward, max_uses: 1, times_used: 0, active: true, is_public: false, expires_at: expires, assigned_to_email: discount.owner_email, parent_code_id: discount.id, source_order_id: order.id }); try { await sendMail(discount.owner_email, "U heeft een beloning ontvangen van Overweel3D", `<p>Uw persoonlijke kortingscode is <strong style="font-size:20px;letter-spacing:1px;">${escapeHtml(code)}</strong> ter waarde van <strong>€${reward.toFixed(2)}</strong>.</p><p>De code is eenmalig te gebruiken.</p>`, undefined, { ctaUrl: `${SITE_URL}/bestellen?kortingscode=${encodeURIComponent(code)}`, ctaLabel: "Korting gebruiken" }); } catch {} return { ok: true, reward, code };
  }
  if (name === "printer-pair") {
    const action = String(body.action || ""); if (action === "create") { requireAdmin(user); const printer = await byId("printers", body.printer_id); if (!printer) throw new HttpError(404, "Printer niet gevonden."); const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; const raw = Array.from(crypto.randomBytes(12), value => alphabet[value % alphabet.length]).join(""); const code = `OW3D-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`; const canonical = code.replace(/[^A-Z0-9]/g, ""); for (const old of (await listRows("printer_pairing_codes")).filter(item => item.printer_id === printer.id && !item.redeemed_at)) await deleteRow("printer_pairing_codes", old); const expires = new Date(Date.now() + 10 * 365 * 86400000).toISOString(); await createRow("printer_pairing_codes", { printer_id: printer.id, code_hash: sha256(canonical), bambu_host: body.bambu_host || null, bambu_access_code: body.bambu_access_code || null, ftps_username: body.ftps_username || "bblp", ftps_port: Number(body.ftps_port || 990), expires_at: expires, redeemed_at: null, created_by: legacyUserId(user) }, user.$id); return { code, expires_at: expires }; }
    if (action === "exchange") { const canonical = String(body.code || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); const pairing = (await listRows("printer_pairing_codes")).find(item => item.code_hash === sha256(canonical) && !item.redeemed_at && Date.parse(item.expires_at || "") > Date.now()); if (!pairing) throw new HttpError(403, "Koppelcode is ongeldig, verlopen of al gebruikt."); const printer = await byId("printers", pairing.printer_id); if (!printer?.device_serial) throw new HttpError(404, "Printer niet gevonden."); const access = crypto.randomBytes(32).toString("hex"); const refresh = crypto.randomBytes(32).toString("hex"); await updateRow("printers", printer, { bridge_token_hash: sha256(access), bridge_refresh_token_hash: sha256(refresh), bridge_token_refreshed_at: new Date().toISOString() }); await updateRow("printer_pairing_codes", pairing, { redeemed_at: new Date().toISOString(), bambu_access_code: null }); return { printer_id: printer.id, bambu_serial: printer.device_serial, bambu_host: pairing.bambu_host, bambu_access_code: pairing.bambu_access_code, ftps_username: pairing.ftps_username || "bblp", ftps_port: Number(pairing.ftps_port || 990), bridge_token: access, bridge_refresh_token: refresh }; }
    throw new HttpError(400, "Onbekende printer-koppelactie.");
  }
  if (name === "exchange-onedrive-token") {
    requireAdmin(user); const code = String(body.code || ""); const codeVerifier = String(body.codeVerifier || "");
    if (!code || !codeVerifier) throw new HttpError(400, "De OneDrive-code of PKCE-verificatie ontbreekt.");
    const config = requireOneDriveConfig();
    const response = await fetch(config.tokenUrl, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, code, redirect_uri: process.env.ONEDRIVE_REDIRECT_URI || "https://overweel3d.gijsoverweel.nl/auth/callback", grant_type: "authorization_code", code_verifier: codeVerifier }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.access_token) throw new HttpError(400, `OneDrive-koppeling mislukt: ${payload.error_description || payload.error || response.status}`);
    await storeOneDriveTokens(payload); return { success: true };
  }
  if (name === "upload-to-onedrive") {
    requireAdmin(user); const customer = body.customer || {}; const items = socialArray(body.items);
    if (!customer.name || !customer.email || !customer.address) throw new HttpError(400, "Vul de volledige klantgegevens in.");
    const accessToken = await oneDriveAccessToken(); const safeName = String(customer.name).replace(/[^a-z0-9\s-]/gi, "").trim(); const safeEmail = String(customer.email).replace(/[^a-z0-9@._-]/gi, ""); const folder = `${safeEmail} - ${safeName}`;
    await ensureOneDriveFolder(accessToken, "", "overweel3d"); await ensureOneDriveFolder(accessToken, "overweel3d", folder);
    const lines = [`Volledige naam: ${customer.name}`, `Email: ${customer.email}`, `Telefoon: ${customer.phone || "Niet opgegeven"}`, `Adres: ${customer.address}`, `Postcode: ${customer.postalCode || ""}`, `Woonplaats: ${customer.city || ""}`, "", `Opmerkingen: ${customer.notes || "Geen"}`, "", "--- Bestelling ---"];
    items.forEach((item, index) => lines.push("", `Product ${index + 1}: ${item.name || "Onbekend"}`, `  Type: ${item.type === "custom" ? "Custom upload" : "Kant-en-klaar"}`, `  Materiaal: ${item.material || "Niet opgegeven"}`, `  Kleur: ${item.color || "Niet opgegeven"}`, `  Aantal: ${Number(item.quantity || 1)}`, `  Prijs: €${item.price || "op aanvraag"}`));
    await uploadOneDriveFile(accessToken, `overweel3d/${folder}/info.txt`, Buffer.from(lines.join("\n"), "utf8"));
    if (body.fileBase64 && body.fileName) { const safeFile = String(body.fileName).replace(/[\\/:*?"<>|]/g, "_"); await uploadOneDriveFile(accessToken, `overweel3d/${folder}/${safeFile}`, Buffer.from(String(body.fileBase64), "base64")); }
    return { success: true, folder: `overweel3d/${folder}` };
  }
  if (name === "check-offline-printers") { requireAdmin(user); return { success: true, ...(await runOfflinePrinterCheck()) }; }
  if (name === "send-abandoned-cart-reminders") { requireAdmin(user); return { success: true, ...(await runAbandonedCartReminders()) }; }
  if (name === "send-order-notification") {
    requireAdmin(user); const customer = body.customer || {}; const details = body.orderDetails || {};
    if (!customer.name || !customer.email || !customer.address) throw new HttpError(400, "Vul de volledige klantgegevens in.");
    const itemLines = [...socialArray(details.links).flatMap(link => socialArray(link.files).map(file => `${file.name || "Bestand"} (${Number(file.quantity || 1)}x)`)), ...socialArray(details.prebuiltItems).map(item => `${item.name || "Product"} (${Number(item.quantity || 1)}x)`)];
    const summary = itemLines.length ? `<ul>${itemLines.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : "<p>De bestelgegevens staan in het dashboard.</p>";
    await sendMail("gijsoverweel@gmail.com", `Nieuwe bestelling van ${customer.name}`, `<p><strong>${escapeHtml(customer.name)}</strong><br>${escapeHtml(customer.email)}</p>${summary}`, undefined, { ctaUrl: `${SITE_URL}/admin`, ctaLabel: "Bestellingen beheren" });
    await sendMail(customer.email, "Bevestiging van uw bestelling bij Overweel3D", `<p>Beste ${escapeHtml(customer.name)}, uw aanvraag is goed ontvangen.</p>${summary}<p>U ontvangt bericht zodra er een update is.</p>`, undefined, { ctaUrl: `${SITE_URL}/dashboard`, ctaLabel: "Naar mijn dashboard" });
    return { success: true };
  }
  if (name === "generate-content-marketing") { requireAdmin(user); return { content: `${body.platform || "Social media"} · ${body.contentType || "bericht"}\n\n${body.topic}\n\nOntdek wat Overweel3D voor u kan maken.\n\n#Overweel3D #3Dprinten` }; }
  if (name === "generate-blog-post") { requireAdmin(user); const topic = String(body.topic || "").trim(); if (!topic) throw new HttpError(400, "Onderwerp ontbreekt."); const post = await createRow("blog_posts", { title: topic, slug: `${topic.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${Date.now()}`, excerpt: `Lees meer over ${topic} bij Overweel3D.`, content: `<h2>${topic}</h2><p>Dit conceptartikel kan nu verder worden aangevuld.</p>`, status: "draft" }); return { success: true, id: post.id }; }
  throw new HttpError(501, `Serverfunctie is nog niet geïmplementeerd in Appwrite: ${name}`);
}

export default async ({ req, res, log, error }) => {
  try {
    runtimeKey = req.headers?.["x-appwrite-key"] || req.headers?.["X-Appwrite-Key"] || "";
    if (!endpoint || !project || !(key || runtimeKey)) {
      const missing = [!endpoint && "endpoint", !project && "project", !(key || runtimeKey) && "dynamic-api-key"].filter(Boolean).join(", ");
      throw new HttpError(500, `Appwrite Function-omgeving is onvolledig: ${missing}.`);
    }
    if (String(req.method || "GET").toUpperCase() === "GET" && String(req.query?.action || "") === "order-media") return await serveOrderMedia(req, res);
    const input = requestBody(req);
    const user = await caller(req);
    const data = !input.name
      ? { maintenance: true, offlinePrinters: await runOfflinePrinterCheck(), abandonedCarts: await runAbandonedCartReminders() }
      : input.kind === "rpc"
        ? await handleRpc(String(input.name || ""), input.body || {}, user)
        : input.kind === "social"
          ? await handleSocial(String(input.name || ""), input.body || {})
          : input.kind === "bridge"
            ? await handleBridge(String(input.name || ""), input.body || {})
            : await handleFunction(String(input.name || ""), input.body || {}, user);
    log?.(`${input.kind || "function"}:${input.name || "unknown"} voltooid`);
    return res.json({ data }, 200);
  } catch (caught) {
    const status = caught instanceof HttpError ? caught.status : 500;
    error?.(caught instanceof Error ? caught.stack || caught.message : String(caught));
    return res.json({ error: caught instanceof Error ? caught.message : String(caught) }, status);
  }
};
