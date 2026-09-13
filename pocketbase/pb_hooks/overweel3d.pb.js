/// <reference path="../pb_data/types.d.ts" />

// Overweel3D PocketBase compatibility API.
// Install this file in <pocketbase>/pb_hooks and restart PocketBase.

function body(e) {
  return e.requestInfo().body || {};
}

function json(e, data, status) {
  return e.json(status || 200, { data: data });
}

function fail(message, status) {
  throw new BadRequestError(message || "Ongeldige aanvraag", status || 400);
}

function isAdmin(e) {
  return !!e.auth && e.auth.getString("role") === "admin";
}

function requireAdmin(e) {
  if (!isAdmin(e)) throw new ForbiddenError("Alleen admins hebben toegang.");
}

function requireUser(e) {
  if (!e.auth) throw new UnauthorizedError("U moet ingelogd zijn.");
  return e.auth;
}

function one(collection, field, value) {
  try {
    return $app.findFirstRecordByFilter(collection, field + " = {:value}", { value: value });
  } catch (_) {
    return null;
  }
}

function byId(collection, value) {
  return one(collection, "supabase_id", value) || one(collection, "id", value);
}

function save(collectionName, values) {
  var collection = $app.findCollectionByNameOrId(collectionName);
  var record = new Record(collection);
  Object.keys(values).forEach(function (key) { record.set(key, values[key]); });
  if (!record.getString("supabase_id")) record.set("supabase_id", $security.randomString(8) + "-" + $security.randomString(4) + "-4" + $security.randomString(3) + "-a" + $security.randomString(3) + "-" + $security.randomString(12));
  $app.save(record);
  return record;
}

function cleanRecord(record) {
  if (!record) return null;
  var result = record.publicExport();
  result.id = record.getString("supabase_id") || record.id;
  result._pocketbase_id = record.id;
  return result;
}

function randomCode(prefix) {
  return prefix + $security.randomString(10).toUpperCase();
}

function appSetting(key, fallback) {
  var record = one("app_settings", "key", key);
  if (!record) return fallback;
  var value = record.get("value");
  return value === null || value === undefined ? fallback : value;
}

function authSupabaseId(e) {
  var user = requireUser(e);
  return user.getString("supabase_id") || user.id;
}

function generateOrderNumber() {
  var records = $app.findRecordsByFilter("orders", "order_number != ''", "-created", 500, 0);
  var highest = 0;
  records.forEach(function (record) {
    var match = /^OW3D-(\d+)$/.exec(record.getString("order_number"));
    if (match) highest = Math.max(highest, parseInt(match[1], 10));
  });
  return "OW3D-" + String(highest + 1).padStart(5, "0");
}

function discountResult(code, email, subtotal) {
  var record = one("discount_codes", "code", String(code || "").trim().toUpperCase());
  if (!record || !record.getBool("active")) return { valid: false, message: "Kortingscode is ongeldig." };
  var now = new Date();
  var starts = record.getString("starts_at");
  var expires = record.getString("expires_at");
  if (starts && new Date(starts) > now) return { valid: false, message: "Deze kortingscode is nog niet actief." };
  if (expires && new Date(expires) < now) return { valid: false, message: "Deze kortingscode is verlopen." };
  var max = record.getInt("max_uses");
  if (max > 0 && record.getInt("times_used") >= max) return { valid: false, message: "Deze kortingscode is volledig gebruikt." };
  var assigned = record.getString("assigned_to_email").trim().toLowerCase();
  if (assigned && assigned !== String(email || "").trim().toLowerCase()) return { valid: false, message: "Deze kortingscode hoort bij een ander e-mailadres." };
  var minimum = Number(record.get("minimum_order_value") || 0);
  if (Number(subtotal || 0) < minimum) return { valid: false, message: "Het bestelbedrag is te laag voor deze kortingscode." };
  return {
    valid: true,
    message: "Kortingscode toegepast.",
    code: record.getString("code"),
    discount_type: record.getString("discount_type"),
    discount_value: Number(record.get("discount_value") || 0),
    id: record.getString("supabase_id") || record.id
  };
}

routerAdd("POST", "/api/overweel3d/rpc/{name}", function (e) {
  var name = e.request.pathValue("name");
  var p = body(e);

  if (name === "generate_order_number") return json(e, generateOrderNumber());

  if (name === "create_guest_order") {
    var order = p.p_order || {};
    if (!order.customer_name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(order.customer_email || ""))) fail("Ongeldige klantgegevens.");
    var token = $security.randomString(48);
    var allowed = ["order_number", "customer_email", "customer_name", "phone", "company_name", "billing_address", "shipping_address", "postal_code", "city", "country", "material", "color", "quantity", "notes", "print_preferences", "instant_quote_price", "file_links", "order_method", "catalog_items"];
    var values = { customer_order_token: token, status: "submitted" };
    allowed.forEach(function (key) { if (order[key] !== undefined) values[key] = order[key]; });
    if (!values.order_number) values.order_number = generateOrderNumber();
    var created = save("orders", values);
    return json(e, [{ id: created.getString("supabase_id"), customer_order_token: token }]);
  }

  if (name === "check_discount_code") return json(e, discountResult(p.code_text, p.email_text, p.order_total));

  if (name === "check_gift_card") {
    var gift = one("gift_cards", "code", String(p.code_text || "").trim().toUpperCase());
    var valid = !!gift && gift.getBool("active") && Number(gift.get("remaining_balance") || 0) > 0;
    return json(e, valid ? { valid: true, code: gift.getString("code"), remaining_balance: Number(gift.get("remaining_balance") || 0) } : { valid: false, message: "Cadeaubon is ongeldig of leeg." });
  }

  if (name === "convert_loyalty_points") {
    var user = requireUser(e);
    var points = Number(p.points_to_redeem || 0);
    var legacy = user.get("legacy_data") || {};
    var profile = legacy.profile || {};
    var available = Number(profile.loyalty_points || 0);
    if (!Number.isInteger(points) || points < 1) fail("Wissel minimaal één punt in.");
    if (points > available) fail("Onvoldoende punten.");
    var eurosPerPoint = Number(appSetting("loyalty_euros_per_point", 0.05)) || 0.05;
    var code = randomCode("LOYAL-");
    profile.loyalty_points = available - points;
    legacy.profile = profile;
    user.set("legacy_data", legacy);
    $app.save(user);
    save("loyalty_transactions", { user_id: authSupabaseId(e), points: -points, kind: "redeemed", description: "Ingewisseld voor kortingscode " + code });
    save("discount_codes", { code: code, discount_type: "fixed", discount_value: Math.round(points * eurosPerPoint * 100) / 100, max_uses: 1, times_used: 0, assigned_to_email: user.getString("email"), active: true, is_public: false, starts_at: new Date().toISOString(), per_customer_limit: 1, stackable: false });
    return json(e, code);
  }

  if (name === "record_discount_redemption") {
    var discount = one("discount_codes", "code", String(p.code_text || "").trim().toUpperCase());
    if (!discount) fail("Kortingscode niet gevonden.");
    discount.set("times_used", discount.getInt("times_used") + 1);
    $app.save(discount);
    save("discount_redemptions", { discount_code_id: discount.getString("supabase_id"), order_id: p.order_id_value, discount_amount: Number(p.discount_amount_value || 0), user_id: e.auth ? authSupabaseId(e) : "" });
    return json(e, true);
  }

  if (name === "redeem_gift_card") {
    var card = one("gift_cards", "code", String(p.code_text || "").trim().toUpperCase());
    if (!card || !card.getBool("active")) fail("Cadeaubon niet gevonden.");
    var requested = Math.max(0, Number(p.requested_amount || 0));
    var balance = Number(card.get("remaining_balance") || 0);
    var used = Math.min(requested, balance);
    card.set("remaining_balance", Math.round((balance - used) * 100) / 100);
    if (balance - used <= 0) card.set("active", false);
    $app.save(card);
    save("gift_card_redemptions", { gift_card_id: card.getString("supabase_id"), order_id: p.order_id_value, amount: used, user_id: e.auth ? authSupabaseId(e) : "" });
    return json(e, used);
  }

  if (name === "claim_order_to_account") {
    var uid = authSupabaseId(e);
    var orderToClaim = one("orders", "customer_order_token", p.p_token);
    if (!orderToClaim) fail("Bestelling niet gevonden.");
    var email = String(orderToClaim.getString("customer_email") || "").toLowerCase();
    if (email !== String(e.auth.getString("email") || "").toLowerCase()) fail("Gebruik hetzelfde e-mailadres als bij de bestelling.");
    orderToClaim.set("user_id", uid);
    $app.save(orderToClaim);
    return json(e, true);
  }

  if (name === "refresh_order_plate_data") {
    requireAdmin(e);
    var refreshed = byId("orders", p.p_order_id);
    if (!refreshed) return json(e, { refreshed: false, reason: "order_not_found" });
    return json(e, { refreshed: true, orderId: refreshed.getString("supabase_id"), platePrintStatuses: refreshed.get("plate_print_statuses") || [], plateRunsCompleted: refreshed.get("plate_runs_completed") || [], plateRunsRequired: refreshed.get("plate_runs_required_per_plate") || [], platesCompleted: refreshed.getInt("plates_completed") });
  }

  if (name === "record_manual_order_plate_run" || name === "decrement_manual_order_plate_run") {
    requireAdmin(e);
    var plateOrder = byId("orders", p.p_order_id);
    if (!plateOrder) fail("Bestelling niet gevonden.");
    var plate = Number(p.p_plate_number || 0);
    var total = plateOrder.getInt("total_plates");
    if (!Number.isInteger(plate) || plate < 1 || plate > total) fail("Ongeldig plaatnummer.");
    var completed = plateOrder.get("plate_runs_completed") || [];
    var required = plateOrder.get("plate_runs_required_per_plate") || [];
    var statuses = plateOrder.get("plate_print_statuses") || [];
    while (completed.length < total) completed.push(0);
    while (required.length < total) required.push(1);
    while (statuses.length < total) statuses.push(false);
    var before = Number(completed[plate - 1] || 0);
    var needed = Math.max(1, Number(required[plate - 1] || 1));
    var decrement = name === "decrement_manual_order_plate_run";
    var after = decrement ? Math.max(0, before - 1) : Math.min(needed, before + 1);
    completed[plate - 1] = after;
    statuses[plate - 1] = after >= needed;
    plateOrder.set("plate_runs_completed", completed);
    plateOrder.set("plate_runs_required_per_plate", required);
    plateOrder.set("plate_print_statuses", statuses);
    plateOrder.set("plates_completed", statuses.filter(Boolean).length);
    $app.save(plateOrder);
    var job = null;
    try { job = $app.findFirstRecordByFilter("print_jobs", "order_id = {:order} && plate_number = {:plate}", { order: p.p_order_id, plate: plate }); } catch (_) {}
    if (job) { job.set("runs_completed", after); job.set("runs_required", needed); job.set("status", after >= needed ? "completed" : "queued"); $app.save(job); }
    save("order_events", { order_id: p.p_order_id, event_type: decrement ? "plate_print_correction" : "plate_printed", event_description: "Plaat " + plate + ": " + after + " van " + needed + " uitvoeringen geregistreerd.", performed_by: authSupabaseId(e), visible_to_customer: true });
    return json(e, { counted: !decrement && after !== before, decremented: decrement && after !== before, reason: after === before ? (decrement ? "no_completed_runs" : "already_completed") : null, plateNumber: plate, runsCompleted: after, runsRequired: needed, remaining: Math.max(0, needed - after), completed: after >= needed, platesCompleted: statuses.filter(Boolean).length, plateRunsCompleted: completed, platePrintStatuses: statuses, plateRunsRequired: required });
  }

  if (name === "promote_inventory_to_filament_color") {
    requireAdmin(e);
    var inventory = byId("filament_inventory", p.p_inventory_id);
    if (!inventory) fail("De voorraadregel bestaat niet meer.");
    var colorName = String(p.p_name || "").trim();
    var material = String(p.p_material || "").trim().toUpperCase();
    var hex = String(p.p_hex || "").trim().toUpperCase();
    if (!colorName || !material || !/^#[0-9A-F]{6}$/.test(hex)) fail("Vul een geldige naam, materiaal en hexcode in.");
    var colors = $app.findRecordsByFilter("filament_colors", "material = {:material}", "sort_order", 500, 0, { material: material });
    if (colors.some(function (item) { return item.getString("name").trim().toLowerCase() === colorName.toLowerCase(); })) fail("Deze kleurnaam bestaat al voor dit materiaal.");
    var maxSort = colors.reduce(function (max, item) { return Math.max(max, item.getInt("sort_order")); }, -1);
    var newColor = save("filament_colors", { name: colorName, material: material, hex: hex, description: String(p.p_description || "").trim(), sort_order: maxSort + 1, active: p.p_active !== false });
    inventory.set("filament_color_id", newColor.getString("supabase_id"));
    inventory.set("inventory_key", "palette:" + newColor.getString("supabase_id"));
    $app.save(inventory);
    return json(e, newColor.getString("supabase_id"));
  }

  if (name === "request_printer_ftps_scan") {
    requireAdmin(e);
    var printer = byId("printers", p.p_printer_id);
    if (!printer) fail("Printer niet gevonden.");
    var kind = p.p_kind;
    if (kind !== "files" && kind !== "folders") fail("Onbekend scantype.");
    var field = kind === "files" ? "ftps_scan_request_id" : "ftps_folder_scan_request_id";
    var timeField = kind === "files" ? "ftps_scan_requested_at" : "ftps_folder_scan_requested_at";
    if (kind === "files") printer.set("ftps_scan_paths", p.p_scan_paths || []);
    printer.set(field, printer.getInt(field) + 1);
    printer.set(timeField, new Date().toISOString());
    $app.save(printer);
    return json(e, printer.getInt(field));
  }

  if (name === "request_printer_queue_start" || name === "request_printer_file_metadata") {
    requireAdmin(e);
    if (name === "request_printer_queue_start") {
      var queuePrinter = byId("printers", p.p_printer_id);
      if (!queuePrinter) fail("Printer niet gevonden.");
      var nextStart = queuePrinter.getInt("print_start_request_id") + 1;
      queuePrinter.set("print_start_request_id", nextStart); $app.save(queuePrinter);
      return json(e, nextStart);
    }
    var sdFile = byId("printer_sd_files", p.p_file_id);
    if (!sdFile) fail("Printbestand niet gevonden.");
    var nextMetadata = sdFile.getInt("metadata_request_id") + 1;
    sdFile.set("metadata_request_id", nextMetadata); sdFile.set("metadata_requested_plate_number", p.p_plate_number || null); sdFile.set("metadata_last_error", null); $app.save(sdFile);
    return json(e, nextMetadata);
  }

  if (name === "reorder_printer_queue") {
    requireAdmin(e);
    (p.p_item_ids || []).forEach(function (id, index) {
      var item = byId("printer_queue_items", id);
      if (item) { item.set("position", index + 1); $app.save(item); }
    });
    return json(e, true);
  }

  if (name === "request_bambu_login_code") {
    requireAdmin(e);
    var loginPrinter = byId("printers", p.p_printer_id);
    if (!loginPrinter) fail("Printer niet gevonden.");
    var loginRequest = loginPrinter.getInt("bambu_login_request_id") + 1;
    loginPrinter.set("bambu_login_request_id", loginRequest);
    loginPrinter.set("bambu_login_requested_at", new Date().toISOString());
    loginPrinter.set("bambu_login_last_error", null);
    $app.save(loginPrinter);
    return json(e, loginRequest);
  }

  fail("RPC-functie is nog niet geïmplementeerd: " + name);
});

routerAdd("GET", "/api/overweel3d/health", function (e) {
  return e.json(200, { ok: true, service: "overweel3d-pocketbase", version: "1.3.0" });
});

function sendMail(to, subject, html, replyTo) {
  var settings = $app.settings();
  var message = new MailerMessage({
    from: { address: settings.meta.senderAddress, name: settings.meta.senderName || "Overweel3D" },
    to: [{ address: to }],
    subject: subject,
    html: html
  });
  if (replyTo) message.replyTo = [{ address: replyTo }];
  $app.newMailClient().send(message);
}

function escapeHtml(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#039;");
}

function orderPayload(order) {
  var id = order.getString("supabase_id") || order.id;
  function related(collection, sort) {
    return $app.findRecordsByFilter(collection, "order_id = {:id}", sort || "created", 500, 0, { id: id }).map(cleanRecord);
  }
  return {
    order: cleanRecord(order),
    files: related("order_files"),
    events: related("order_events"),
    messages: related("order_messages"),
    appointments: related("delivery_appointments"),
    selectedPlates: related("order_3mf_plate_mappings", "plate_index")
  };
}

function orderByToken(token) {
  if (!token || String(token).length < 24) return null;
  return one("orders", "customer_order_token", token);
}

function envOrSetting(envName, settingName, fallback) {
  var value = $os.getenv(envName);
  if (value) return value;
  return String(appSetting(settingName, fallback || "") || "");
}

function secretEnv(name) {
  return String($os.getenv(name) || "");
}

function requestHeader(e, name) {
  return String(e.requestInfo().headers[String(name).toLowerCase().replace(/-/g, "_")] || "");
}

function requireIntegrationKey(e, envName, settingName) {
  if (isAdmin(e)) return;
  var expected = secretEnv(envName);
  var supplied = requestHeader(e, "x-api-key");
  if (!expected) throw new InternalServerError(envName + " is niet op de PocketBase-server ingesteld.");
  if (!supplied || !$security.equal($security.sha256(supplied), $security.sha256(expected))) throw new UnauthorizedError("Ongeldige API-sleutel.");
}

function deleteByFilter(collection, filter, params) {
  var records = [];
  try { records = $app.findRecordsByFilter(collection, filter, "", 5000, 0, params || {}); } catch (_) { return 0; }
  records.forEach(function (record) { $app.delete(record); });
  return records.length;
}

function storedFileForPath(path) {
  return one("storage_files", "path", path);
}

function storedFileBytes(stored, maxBytes) {
  if (!stored) throw new NotFoundError("Opgeslagen bestand niet gevonden.");
  var filename = stored.getString("file");
  if (!filename) throw new NotFoundError("Het opslagrecord bevat geen bestand.");
  var absolutePath = $filepath.join(stored.baseFilesPath(), filename);
  var stat = $os.stat(absolutePath);
  if (maxBytes && stat.size() > maxBytes) throw new BadRequestError("Bestand is te groot.");
  return $os.readFile(absolutePath);
}

function safeDownloadName(value) {
  return String(value || "download").replace(/[\r\n\"\\/]/g, "_").slice(0, 180);
}

function publicBaseUrl(e) {
  return envOrSetting("POCKETBASE_PUBLIC_URL", "pocketbase_public_url", "https://api.gijsoverweel.nl").replace(/\/+$/, "");
}

function orderExport(order, includeFiles, e) {
  var orderId = order.getString("supabase_id") || order.id;
  var events = [];
  var files = [];
  try { events = $app.findRecordsByFilter("order_events", "order_id = {:id}", "created", 5000, 0, { id: orderId }); } catch (_) {}
  try { files = $app.findRecordsByFilter("order_files", "order_id = {:id}", "created", 5000, 0, { id: orderId }); } catch (_) {}
  var exportFiles = files.map(function (file) {
    var result = cleanRecord(file);
    if (includeFiles) result.download_url = publicBaseUrl(e) + "/api/overweel3d/functions/download-order-file?file_id=" + encodeURIComponent(result.id);
    return result;
  });
  return {
    order: cleanRecord(order),
    events: events.map(cleanRecord),
    files: exportFiles,
    file_count: exportFiles.length,
    exported_at: new Date().toISOString()
  };
}

function formEncode(values) {
  return Object.keys(values).filter(function (key) { return values[key] !== null && values[key] !== undefined && values[key] !== ""; }).map(function (key) {
    return encodeURIComponent(key) + "=" + encodeURIComponent(String(values[key]));
  }).join("&");
}

function oneDriveConfig() {
  var config = {
    tenantId: envOrSetting("ONEDRIVE_TENANT_ID", "onedrive_tenant_id", "ee379395-a204-487f-ac45-88e971655363"),
    clientId: envOrSetting("ONEDRIVE_CLIENT_ID", "onedrive_client_id", "f0dca68f-86d3-4049-a768-c706a1b94193"),
    clientSecret: secretEnv("ONEDRIVE_CLIENT_SECRET"),
    redirectUri: envOrSetting("ONEDRIVE_REDIRECT_URI", "onedrive_redirect_uri", "https://overweel3d.gijsoverweel.nl/auth/callback")
  };
  if (!config.clientId || !config.clientSecret) throw new InternalServerError("OneDrive client-id of client-secret ontbreekt op de PocketBase-server.");
  config.tokenUrl = "https://login.microsoftonline.com/" + encodeURIComponent(config.tenantId) + "/oauth2/v2.0/token";
  return config;
}

function oneDriveTokenRequest(config, values) {
  var response = $http.send({
    url: config.tokenUrl,
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formEncode(values),
    timeout: 60
  });
  if (response.statusCode < 200 || response.statusCode >= 300) {
    var detail = response.json && (response.json.error_description || response.json.error);
    throw new BadRequestError("Microsoft-tokenaanvraag mislukt: " + (detail || response.raw || response.statusCode));
  }
  return response.json || {};
}

function newestOneDriveToken() {
  try {
    var rows = $app.findRecordsByFilter("onedrive_tokens", "id != ''", "-updated", 1, 0);
    return rows.length ? rows[0] : null;
  } catch (_) { return null; }
}

function storeOneDriveToken(data, existing) {
  var expires = data.expires_in ? new Date(Date.now() + Number(data.expires_in) * 1000).toISOString() : null;
  var record = existing || save("onedrive_tokens", {
    access_token: String(data.access_token || ""),
    refresh_token: String(data.refresh_token || ""),
    expires_at: expires
  });
  if (existing) {
    record.set("access_token", String(data.access_token || ""));
    if (data.refresh_token) record.set("refresh_token", String(data.refresh_token));
    record.set("expires_at", expires);
    $app.save(record);
  }
  return record;
}

function getOneDriveAccessToken() {
  var config = oneDriveConfig();
  var token = newestOneDriveToken();
  if (token && token.getString("access_token")) {
    var expiry = token.getString("expires_at");
    if (!expiry || new Date(expiry).getTime() > Date.now() + 120000) return token.getString("access_token");
    if (token.getString("refresh_token")) {
      var refreshed = oneDriveTokenRequest(config, {
        client_id: config.clientId,
        client_secret: config.clientSecret,
        refresh_token: token.getString("refresh_token"),
        grant_type: "refresh_token",
        scope: "https://graph.microsoft.com/.default"
      });
      storeOneDriveToken(refreshed, token);
      return String(refreshed.access_token || "");
    }
  }
  var fallbackRefresh = secretEnv("ONEDRIVE_REFRESH_TOKEN");
  if (!fallbackRefresh) throw new BadRequestError("OneDrive is nog niet gekoppeld.");
  var fallback = oneDriveTokenRequest(config, { client_id: config.clientId, client_secret: config.clientSecret, refresh_token: fallbackRefresh, grant_type: "refresh_token", scope: "https://graph.microsoft.com/.default" });
  storeOneDriveToken(fallback, token);
  return String(fallback.access_token || "");
}

function graphPath(path) {
  return String(path || "").split("/").filter(Boolean).map(function (part) { return encodeURIComponent(part); }).join("/");
}

function graphRequest(accessToken, method, url, requestBody, contentType) {
  var response = $http.send({
    url: url,
    method: method,
    headers: { Authorization: "Bearer " + accessToken, "Content-Type": contentType || "application/json" },
    body: requestBody,
    timeout: 120
  });
  if (response.statusCode < 200 || response.statusCode >= 300) throw new BadRequestError("OneDrive-aanvraag mislukt (" + response.statusCode + "): " + (response.raw || "onbekende fout"));
  return response;
}

function ensureOneDriveFolder(accessToken, parentPath, folderName) {
  var url = parentPath
    ? "https://graph.microsoft.com/v1.0/me/drive/root:/" + graphPath(parentPath) + ":/children"
    : "https://graph.microsoft.com/v1.0/me/drive/root/children";
  var response = $http.send({ url: url, method: "POST", headers: { Authorization: "Bearer " + accessToken, "Content-Type": "application/json" }, body: JSON.stringify({ name: folderName, folder: {}, "@microsoft.graph.conflictBehavior": "replace" }), timeout: 60 });
  if ((response.statusCode < 200 || response.statusCode >= 300) && response.statusCode !== 409) throw new BadRequestError("OneDrive-map kon niet worden gemaakt: " + (response.raw || response.statusCode));
}

function uploadOneDriveContent(accessToken, path, content, contentType) {
  return graphRequest(accessToken, "PUT", "https://graph.microsoft.com/v1.0/me/drive/root:/" + graphPath(path) + ":/content", content, contentType || "application/octet-stream");
}

function base64Bytes(value) {
  var alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  var clean = String(value || "").replace(/^data:[^,]+,/, "").replace(/[^A-Za-z0-9+/=]/g, "");
  var output = [];
  for (var index = 0; index < clean.length; index += 4) {
    var a = alphabet.indexOf(clean.charAt(index));
    var b = alphabet.indexOf(clean.charAt(index + 1));
    var c = clean.charAt(index + 2) === "=" ? -1 : alphabet.indexOf(clean.charAt(index + 2));
    var d = clean.charAt(index + 3) === "=" ? -1 : alphabet.indexOf(clean.charAt(index + 3));
    if (a < 0 || b < 0) break;
    output.push((a << 2) | (b >> 4));
    if (c >= 0) output.push(((b & 15) << 4) | (c >> 2));
    if (d >= 0) output.push(((c & 3) << 6) | d);
  }
  return output;
}

function customerInfoText(customer, items) {
  var lines = [
    "Volledige naam: " + String(customer.name || ""),
    "Email: " + String(customer.email || ""),
    "Telefoon: " + String(customer.phone || "Niet opgegeven"),
    "Adres: " + String(customer.address || ""),
    "Postcode: " + String(customer.postalCode || ""),
    "Woonplaats: " + String(customer.city || ""),
    "", "Opmerkingen: " + String(customer.notes || "Geen"), "", "--- Bestelling ---"
  ];
  (items || []).forEach(function (item, index) {
    lines.push("", "Product " + (index + 1) + ": " + String(item.name || ""), "  Type: " + (item.type === "custom" ? "Custom upload" : "Kant-en-klaar"));
    if (item.material) lines.push("  Materiaal: " + item.material);
    if (item.color) lines.push("  Kleur: " + item.color);
    if (item.stemText) lines.push("  Tekst op stam: " + item.stemText);
    lines.push("  Aantal: " + Number(item.quantity || 1), "  Prijs: €" + String(item.price || "0"));
  });
  return lines.join("\n");
}

function replaceStoragePathReferences(oldPath, newPath) {
  var scalar = [
    ["order_files", "storage_path"], ["product_images", "storage_path"],
    ["portfolio_project_media", "storage_path"], ["print_jobs", "three_mf_storage_path"],
    ["order_3mf_plate_mappings", "preview_storage_path"]
  ];
  scalar.forEach(function (entry) {
    var rows = [];
    try { rows = $app.findRecordsByFilter(entry[0], entry[1] + " = {:path}", "", 5000, 0, { path: oldPath }); } catch (_) { return; }
    rows.forEach(function (record) { record.set(entry[1], newPath); $app.save(record); });
  });
  [["products", "photos"], ["product_reviews", "photos"]].forEach(function (entry) {
    var rows = [];
    try { rows = $app.findRecordsByFilter(entry[0], entry[1] + " != null", "", 5000, 0); } catch (_) { return; }
    rows.forEach(function (record) {
      var values = record.get(entry[1]) || [];
      if (!Array.isArray(values) || values.indexOf(oldPath) < 0) return;
      record.set(entry[1], values.map(function (path) { return path === oldPath ? newPath : path; }));
      $app.save(record);
    });
  });
}

function handleHomeAssistant(e, p) {
  requireIntegrationKey(e, "HOME_ASSISTANT_API_KEY", "home_assistant_api_key");
  var action = String(p.action || "list_orders");
  if (action === "list_orders") {
    var statuses = Array.isArray(p.statuses) && p.statuses.length ? p.statuses : ["submitted", "accepted", "in_progress", "printing", "ready"];
    var orders = $app.findRecordsByFilter("orders", "status != 'completed' && status != 'cancelled'", "-created", 500, 0).filter(function (order) { return statuses.indexOf(order.getString("status")) >= 0; });
    return { success: true, orders: orders.map(function (order) {
      var result = cleanRecord(order);
      result.messages = orderPayload(order).messages;
      return result;
    }) };
  }
  var order = byId("orders", p.order_id || p.orderId);
  if (!order) throw new NotFoundError("Bestelling niet gevonden.");
  var orderId = order.getString("supabase_id") || order.id;
  if (action === "get_order") return { success: true, data: orderPayload(order) };
  if (action === "update_order") {
    var allowedStatuses = ["submitted", "accepted", "in_progress", "printing", "ready", "completed", "cancelled"];
    if (p.status !== undefined) {
      if (allowedStatuses.indexOf(String(p.status)) < 0) fail("Ongeldige bestelstatus.");
      order.set("status", String(p.status));
      if (p.status === "completed") order.set("completed_at", new Date().toISOString());
    }
    if (p.final_price !== undefined) order.set("final_price", Math.max(0, Number(p.final_price || 0)));
    if (p.customer_visible_notes !== undefined) order.set("customer_visible_notes", String(p.customer_visible_notes || "").slice(0, 5000));
    $app.save(order);
    save("order_events", { order_id: orderId, event_type: "home_assistant_update", event_description: "Bestelling bijgewerkt vanuit Home Assistant.", visible_to_customer: true });
    return { success: true, order: cleanRecord(order) };
  }
  if (action === "add_message") {
    var text = String(p.message || "").trim();
    if (!text) fail("Bericht ontbreekt.");
    var message = save("order_messages", { order_id: orderId, sender_type: "admin", sender_name: "Overweel3D via Home Assistant", message: text.slice(0, 5000), is_read: false });
    return { success: true, message: cleanRecord(message) };
  }
  if (action === "record_plate") {
    var plate = Number(p.plate_number || 0);
    var completed = order.get("plate_runs_completed") || [];
    var required = order.get("plate_runs_required_per_plate") || [];
    var total = Math.max(order.getInt("total_plates"), completed.length, required.length);
    if (!Number.isInteger(plate) || plate < 1 || plate > total) fail("Ongeldig plaatnummer.");
    while (completed.length < total) completed.push(0);
    while (required.length < total) required.push(1);
    completed[plate - 1] = Math.min(Math.max(1, Number(required[plate - 1] || 1)), Number(completed[plate - 1] || 0) + 1);
    var statuses = completed.map(function (count, index) { return count >= Math.max(1, Number(required[index] || 1)); });
    order.set("plate_runs_completed", completed); order.set("plate_print_statuses", statuses); order.set("plates_completed", statuses.filter(Boolean).length); $app.save(order);
    return { success: true, plate_number: plate, runs_completed: completed[plate - 1], runs_required: Math.max(1, Number(required[plate - 1] || 1)), complete: statuses[plate - 1] };
  }
  fail("Onbekende Home Assistant-actie.");
}

routerAdd("POST", "/api/overweel3d/functions/{name}", function (e) {
  var name = e.request.pathValue("name");
  var p = body(e);

  if (name === "export-order") {
    requireIntegrationKey(e, "OVERWEEL3D_EXPORT_API_KEY", "export_api_key");
    var includeFiles = p.include_files !== false;
    var orders = [];
    if (p.order_id) {
      var singleOrder = byId("orders", p.order_id);
      if (singleOrder) orders = [singleOrder];
    } else {
      var statusFilter = Array.isArray(p.status_filter) && p.status_filter.length ? p.status_filter : ["completed"];
      orders = $app.findRecordsByFilter("orders", "id != ''", "created", 5000, 0).filter(function (order) { return statusFilter.indexOf(order.getString("status")) >= 0; });
    }
    var exports = orders.map(function (order) { return orderExport(order, includeFiles, e); });
    return e.json(200, { success: true, total_orders: exports.length, data: exports, message: exports.length ? undefined : "Geen bestellingen gevonden" });
  }

  if (name === "download-order-file") {
    requireIntegrationKey(e, "OVERWEEL3D_EXPORT_API_KEY", "export_api_key");
    var requestedFile = byId("order_files", p.file_id || p.fileId);
    if (!requestedFile) throw new NotFoundError("Bestand niet gevonden.");
    var requestedStored = storedFileForPath(requestedFile.getString("storage_path"));
    if (!requestedStored) throw new NotFoundError("Het bestand staat niet in PocketBase-opslag.");
    return e.json(200, {
      success: true,
      download_url: publicBaseUrl(e) + "/api/overweel3d/functions/download-order-file?file_id=" + encodeURIComponent(requestedFile.getString("supabase_id") || requestedFile.id),
      original_filename: requestedFile.getString("original_filename"),
      mime_type: requestedFile.getString("mime_type") || "application/octet-stream"
    });
  }

  if (name === "cleanup-exported-order") {
    requireIntegrationKey(e, "OVERWEEL3D_EXPORT_API_KEY", "export_api_key");
    var cleanupOrder = byId("orders", p.order_id);
    if (!cleanupOrder) throw new NotFoundError("Bestelling niet gevonden.");
    if (cleanupOrder.getString("status") !== "completed") fail("Bestelling is nog niet voltooid.");
    var cleanupOrderId = cleanupOrder.getString("supabase_id") || cleanupOrder.id;
    var cleanupFiles = [];
    try { cleanupFiles = $app.findRecordsByFilter("order_files", "order_id = {:id}", "", 5000, 0, { id: cleanupOrderId }); } catch (_) {}
    cleanupFiles.forEach(function (file) {
      var stored = storedFileForPath(file.getString("storage_path"));
      if (stored) $app.delete(stored);
    });
    ["exported_orders", "order_3mf_plate_mappings", "print_runs", "print_jobs", "order_messages", "order_events", "order_files", "delivery_appointments"].forEach(function (collection) {
      deleteByFilter(collection, "order_id = {:id}", { id: cleanupOrderId });
    });
    var number = cleanupOrder.getString("order_number");
    $app.delete(cleanupOrder);
    return e.json(200, { success: true, deleted_order: number, deleted_files: cleanupFiles.length });
  }

  if (name === "cleanup-legacy-heic") {
    requireAdmin(e);
    var legacyFiles = $app.findRecordsByFilter("storage_files", "path ~ '.hei'", "created", Math.min(500, Math.max(1, Number(p.limit || 100))), 0).filter(function (record) { return /\.hei[cf]$/i.test(record.getString("path")); });
    if (p.dry_run !== false) return e.json(200, { success: true, dry_run: true, found: legacyFiles.length, files: legacyFiles.map(function (record) { return record.getString("path"); }) });
    var converterUrl = secretEnv("HEIC_CONVERTER_URL");
    if (!converterUrl) throw new BadRequestError("Stel HEIC_CONVERTER_URL in om bestaande HEIC-bestanden server-side om te zetten.");
    var converted = [];
    var failed = [];
    legacyFiles.forEach(function (stored) {
      var oldPath = stored.getString("path");
      try {
        var oldBytes = storedFileBytes(stored, 30 * 1024 * 1024);
        var form = new FormData();
        form.append("file", $filesystem.fileFromBytes(oldBytes, $filepath.base(oldPath)));
        var response = $http.send({ url: converterUrl, method: "POST", body: form, timeout: 180 });
        if (response.statusCode < 200 || response.statusCode >= 300 || !response.body || !response.body.length) throw new Error("Converter gaf HTTP " + response.statusCode);
        var newPath = oldPath.replace(/\.hei[cf]$/i, ".jpg");
        if (storedFileForPath(newPath)) throw new Error("Doelpad bestaat al: " + newPath);
        stored.set("file", $filesystem.fileFromBytes(response.body, $filepath.base(newPath)));
        stored.set("path", newPath);
        $app.save(stored);
        replaceStoragePathReferences(oldPath, newPath);
        converted.push({ from: oldPath, to: newPath });
      } catch (error) { failed.push({ path: oldPath, error: String(error) }); }
    });
    return e.json(failed.length ? 207 : 200, { success: failed.length === 0, converted: converted, failed: failed });
  }

  if (name === "exchange-onedrive-token") {
    requireAdmin(e);
    if (!p.code || !p.codeVerifier) fail("Authorization-code of code-verifier ontbreekt.");
    var odConfig = oneDriveConfig();
    var tokenData = oneDriveTokenRequest(odConfig, {
      client_id: odConfig.clientId,
      client_secret: odConfig.clientSecret,
      code: p.code,
      redirect_uri: odConfig.redirectUri,
      grant_type: "authorization_code",
      code_verifier: p.codeVerifier
    });
    var oldTokens = [];
    try { oldTokens = $app.findRecordsByFilter("onedrive_tokens", "id != ''", "", 500, 0); } catch (_) {}
    var currentToken = oldTokens.length ? oldTokens[0] : null;
    storeOneDriveToken(tokenData, currentToken);
    oldTokens.slice(1).forEach(function (record) { $app.delete(record); });
    return e.json(200, { success: true });
  }

  if (name === "upload-to-onedrive") {
    requireAdmin(e);
    var customer = p.customer || {};
    if (!customer.name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(customer.email || ""))) fail("Klantnaam of e-mailadres ontbreekt.");
    var odAccess = getOneDriveAccessToken();
    var cleanName = String(customer.name).replace(/[^a-zA-Z0-9\s-]/g, "").trim() || "Klant";
    var cleanEmail = String(customer.email).replace(/[^a-zA-Z0-9@._-]/g, "");
    var customerFolder = cleanEmail + " - " + cleanName;
    ensureOneDriveFolder(odAccess, "", "overweel3d");
    ensureOneDriveFolder(odAccess, "overweel3d", customerFolder);
    var destination = "overweel3d/" + customerFolder;
    uploadOneDriveContent(odAccess, destination + "/info.txt", customerInfoText(customer, p.items || []), "text/plain; charset=utf-8");
    if (p.fileBase64 && p.fileName) {
      var binary = base64Bytes(p.fileBase64);
      if (binary.length > 50 * 1024 * 1024) fail("Het OneDrive-bestand is groter dan 50 MB.");
      uploadOneDriveContent(odAccess, destination + "/" + safeDownloadName(p.fileName), binary, "application/octet-stream");
    }
    return e.json(200, { success: true, folder: destination });
  }

  if (name === "home-assistant-api") return e.json(200, handleHomeAssistant(e, p));

  if (name === "printer-camera-ingest") {
    return e.json(400, { error: "Stuur camerabeelden als JPEG/PNG-body naar /api/overweel3d/printer-camera-ingest; JSON-upload wordt niet ondersteund." });
  }

  if (name === "printer-pair") {
    if (p.action === "create") {
      requireAdmin(e);
      var pairPrinter = byId("printers", p.printer_id);
      if (!pairPrinter) throw new NotFoundError("Printer niet gevonden.");
      var code = $security.randomStringWithAlphabet(10, "ABCDEFGHJKLMNPQRSTUVWXYZ23456789");
      var expires = new Date(Date.now() + 15 * 60 * 1000);
      save("printer_pairing_codes", {
        printer_id: pairPrinter.getString("supabase_id") || pairPrinter.id,
        code_hash: $security.sha256(code),
        bambu_host: String(p.bambu_host || ""),
        bambu_access_code: String(p.bambu_access_code || ""),
        ftps_username: String(p.ftps_username || "bblp"),
        ftps_port: Number(p.ftps_port || 990),
        expires_at: expires.toISOString(),
        created_by: authSupabaseId(e)
      });
      return e.json(200, { code: code, expires_at: expires.toISOString() });
    }
    if (p.action === "exchange") {
      var pairing = one("printer_pairing_codes", "code_hash", $security.sha256(String(p.code || "").trim().toUpperCase()));
      if (!pairing || pairing.getString("redeemed_at") || new Date(pairing.getString("expires_at")) <= new Date()) throw new ForbiddenError("Koppelcode is ongeldig of verlopen.");
      var pairedPrinter = byId("printers", pairing.getString("printer_id"));
      if (!pairedPrinter) throw new NotFoundError("Printer niet gevonden.");
      var accessToken = $security.randomString(64);
      var refreshToken = $security.randomString(80);
      pairedPrinter.set("bridge_token_hash", $security.sha256(accessToken));
      pairedPrinter.set("bridge_refresh_token_hash", $security.sha256(refreshToken));
      pairedPrinter.set("bridge_token_refreshed_at", new Date().toISOString());
      $app.save(pairedPrinter);
      var pairingResult = {
        printer_id: pairedPrinter.getString("supabase_id") || pairedPrinter.id,
        bambu_serial: pairedPrinter.getString("device_serial"),
        bambu_host: pairing.getString("bambu_host"),
        bambu_access_code: pairing.getString("bambu_access_code"),
        ftps_username: pairing.getString("ftps_username") || "bblp",
        ftps_port: pairing.getInt("ftps_port") || 990,
        bridge_token: accessToken,
        bridge_refresh_token: refreshToken
      };
      pairing.set("redeemed_at", new Date().toISOString());
      pairing.set("bambu_access_code", null);
      $app.save(pairing);
      return e.json(200, pairingResult);
    }
    if (p.action === "exchange") {
      var pair = one("printer_pairing_codes", "code_hash", $security.sha256(String(p.code || "").replace(/[^A-Z0-9]/gi, "").toUpperCase()));
      if (!pair || pair.getString("redeemed_at") || new Date(pair.getString("expires_at")) <= new Date()) fail("Koppelcode is ongeldig of verlopen.");
      var linkedPrinter = byId("printers", pair.getString("printer_id"));
      if (!linkedPrinter) fail("Printer niet gevonden.");
      var access = $security.randomString(64);
      var refresh = $security.randomString(80);
      linkedPrinter.set("bridge_token_hash", $security.sha256(access));
      linkedPrinter.set("bridge_refresh_token_hash", $security.sha256(refresh));
      linkedPrinter.set("bridge_token_refreshed_at", new Date().toISOString());
      $app.save(linkedPrinter);
      pair.set("redeemed_at", new Date().toISOString()); $app.save(pair);
      return e.json(200, {
        printer_id: linkedPrinter.getString("supabase_id") || linkedPrinter.id,
        bambu_serial: linkedPrinter.getString("device_serial"),
        bridge_token: access,
        bridge_refresh_token: refresh,
        bambu_host: pair.getString("bambu_host"),
        bambu_access_code: pair.getString("bambu_access_code"),
        ftps_username: pair.getString("ftps_username") || "bblp",
        ftps_port: Number(p.ftps_port || 990)
      });
    }
    fail("Onbekende koppelactie.");
  }

  if (name === "get-order-by-token") {
    var order = orderByToken(p.token);
    if (!order) throw new NotFoundError("Bestelling niet gevonden.");
    if (p.action === "update_shipping_address") {
      var address = p.addressData || {};
      if (!address.shipping_address || !address.postal_code || !address.city) fail("Vul het volledige verzendadres in.");
      order.set("shipping_address", String(address.shipping_address).slice(0, 500));
      order.set("postal_code", String(address.postal_code).slice(0, 30));
      order.set("city", String(address.city).slice(0, 100));
      order.set("country", String(address.country || "Nederland").slice(0, 100));
      $app.save(order);
      return e.json(200, { success: true });
    }
    if (p.action === "get_file_url") {
      var file = byId("order_files", p.fileId);
      if (!file || file.getString("order_id") !== (order.getString("supabase_id") || order.id)) throw new NotFoundError("Bestand niet gevonden.");
      var path = file.getString("storage_path");
      var stored = one("storage_files", "path", path);
      if (!stored) throw new NotFoundError("Bestand is nog niet naar PocketBase gemigreerd.");
      var token = $app.settings().fileToken.secret;
      var filename = stored.getString("file");
      return e.json(200, { signedUrl: "/api/files/" + stored.collection().id + "/" + stored.id + "/" + filename + "?token=" + token });
    }
    if (p.registerVisit) {
      order.set("link_last_viewed_at", new Date().toISOString());
      $app.save(order);
    }
    return e.json(200, orderPayload(order));
  }

  if (name === "update-order-status") {
    var target = orderByToken(p.token);
    if (!target) throw new NotFoundError("Bestelling niet gevonden.");
    var next = p.action === "accept" ? "accepted" : p.action === "reject" ? "cancelled" : "";
    if (!next) fail("Onbekende actie.");
    target.set("status", next);
    $app.save(target);
    save("order_events", { order_id: target.getString("supabase_id"), event_type: "status_changed", event_description: next === "accepted" ? "Bestelling geaccepteerd" : "Bestelling afgewezen", visible_to_customer: true });
    return e.json(200, { success: true, status: next });
  }

  if (name === "manage-newsletter") {
    var email = String(p.email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("Vul een geldig e-mailadres in.");
    var subscriber = one("newsletter_subscribers", "email", email);
    if (p.action === "unsubscribe") {
      if (subscriber) { subscriber.set("active", false); subscriber.set("unsubscribed_at", new Date().toISOString()); $app.save(subscriber); }
      return e.json(200, { success: true });
    }
    if (subscriber) {
      subscriber.set("active", true); subscriber.set("subscribed_at", new Date().toISOString()); subscriber.set("source", p.source || "website"); $app.save(subscriber);
    } else {
      save("newsletter_subscribers", { email: email, active: true, source: p.source || "website", subscribed_at: new Date().toISOString() });
    }
    sendMail(email, "Bedankt voor uw aanmelding bij Overweel3D", "<h1>Welkom bij de nieuwsbrief</h1><p>Bedankt voor uw aanmelding. U ontvangt voortaan nieuws over kleuren, materialen, producten en acties.</p>");
    return e.json(200, { success: true });
  }

  if (name === "send-account-welcome") {
    var welcomeUser = requireUser(e);
    if (String(p.email || "").toLowerCase() !== welcomeUser.getString("email").toLowerCase()) throw new ForbiddenError("E-mailadres komt niet overeen.");
    var legacy = welcomeUser.get("legacy_data") || {};
    var profile = legacy.profile || {};
    if (!profile.account_welcome_email_sent_at) {
      sendMail(welcomeUser.getString("email"), "Welkom bij Overweel3D", "<h1>Welkom bij Overweel3D</h1><p>Uw account is aangemaakt. U kunt nu bestellingen volgen en uw gegevens beheren.</p>");
      profile.account_welcome_email_sent_at = new Date().toISOString(); legacy.profile = profile; welcomeUser.set("legacy_data", legacy); $app.save(welcomeUser);
    }
    return e.json(200, { success: true });
  }

  if (name === "send-contact-message") {
    var from = String(p.email || "").trim();
    if (!p.name || !p.subject || !p.message || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from)) fail("Vul alle velden correct in.");
    sendMail("gijsoverweel@gmail.com", "Contact: " + String(p.subject).slice(0, 150), "<p><strong>Van:</strong> " + escapeHtml(p.name) + " (&lt;" + escapeHtml(from) + "&gt;)</p><p>" + escapeHtml(p.message).replace(/\n/g, "<br>") + "</p>", from);
    return e.json(200, { success: true });
  }

  if (name === "send-order-email") {
    var type = p.type;
    var mailOrder = byId("orders", p.orderId);
    if (type === "test_email") {
      requireAdmin(e); sendMail("gijsoverweel@gmail.com", "Overweel3D testmail", "<h1>Test geslaagd</h1><p>De PocketBase-mailverbinding werkt.</p>"); return e.json(200, { success: true });
    }
    if (!mailOrder) throw new NotFoundError("Bestelling niet gevonden.");
    var owner = e.auth && mailOrder.getString("user_id") === authSupabaseId(e);
    var guest = p.customerOrderToken && p.customerOrderToken === mailOrder.getString("customer_order_token");
    if (!isAdmin(e) && !owner && !guest) throw new ForbiddenError("Geen toegang tot deze bestelling.");
    var number = escapeHtml(mailOrder.getString("order_number"));
    var link = "https://overweel3d.gijsoverweel.nl/order/" + encodeURIComponent(mailOrder.getString("customer_order_token"));
    sendMail(mailOrder.getString("customer_email"), type === "status_changed" ? "Status gewijzigd: bestelling " + number : "Bedankt voor uw bestelling! " + number, "<h1>Bestelling " + number + "</h1><p>" + escapeHtml(p.note || "Bedankt voor uw bestelling bij Overweel3D.") + "</p><p><a href=\"" + link + "\">Bekijk uw bestelling</a></p>");
    return e.json(200, { success: true });
  }

  if (name === "send-chat-notification") {
    var chatOrder = byId("orders", p.orderId || p.order_id);
    if (!chatOrder) throw new NotFoundError("Bestelling niet gevonden.");
    var destination = isAdmin(e) ? chatOrder.getString("customer_email") : "gijsoverweel@gmail.com";
    sendMail(destination, "Nieuw bericht bij bestelling " + chatOrder.getString("order_number"), "<p>Er staat een nieuw bericht klaar bij uw bestelling.</p>");
    return e.json(200, { success: true });
  }

  if (name === "complete-order") {
    requireAdmin(e);
    var completedOrder = byId("orders", p.order_id);
    if (!completedOrder) throw new NotFoundError("Bestelling niet gevonden.");
    var completedAt = new Date().toISOString();
    completedOrder.set("status", "completed"); completedOrder.set("completed_at", completedAt); $app.save(completedOrder);
    save("order_events", { order_id: p.order_id, event_type: "order_completed", event_description: "Bestelling is voltooid en afgerond door admin.", visible_to_customer: true, performed_by: authSupabaseId(e) });
    var statusMailSent = true;
    try { sendMail(completedOrder.getString("customer_email"), "Bestelling " + completedOrder.getString("order_number") + " is voltooid", "<h1>Uw bestelling is voltooid</h1><p>Bestelling " + escapeHtml(completedOrder.getString("order_number")) + " is afgerond.</p>"); } catch (_) { statusMailSent = false; }
    return e.json(200, { success: true, statusMailSent: statusMailSent });
  }

  if (name === "generate-invoice") {
    requireAdmin(e);
    var invoiceOrder = byId("orders", p.orderId);
    if (!invoiceOrder) throw new NotFoundError("Bestelling niet gevonden.");
    var invoiceNumber = "FACT-" + invoiceOrder.getString("order_number").replace(/[^A-Z0-9-]/gi, "") + "-" + new Date().getFullYear();
    var price = Number(invoiceOrder.get("final_price") || invoiceOrder.get("instant_quote_price") || 0);
    var shipping = Number(invoiceOrder.get("shipping_cost") || 0);
    var total = Math.round((price + shipping) * 100) / 100;
    var html = "<!doctype html><html><head><meta charset=\"utf-8\"><title>" + invoiceNumber + "</title><style>body{font:15px Arial;max-width:760px;margin:40px auto;color:#111}h1{font-size:28px}table{width:100%;border-collapse:collapse;margin:30px 0}td,th{padding:12px;border-bottom:1px solid #ddd;text-align:left}.total{font-size:20px;font-weight:bold}</style></head><body><h1>Factuur " + invoiceNumber + "</h1><p><strong>Overweel3D</strong><br>gijsoverweel@gmail.com</p><p><strong>Factuur aan</strong><br>" + escapeHtml(invoiceOrder.getString("customer_name")) + "<br>" + escapeHtml(invoiceOrder.getString("shipping_address") || invoiceOrder.getString("billing_address")) + "<br>" + escapeHtml(invoiceOrder.getString("postal_code") + " " + invoiceOrder.getString("city")) + "</p><table><tr><th>Omschrijving</th><th>Bedrag</th></tr><tr><td>" + escapeHtml(p.description || ("3D-printbestelling " + invoiceOrder.getString("order_number"))) + "</td><td>€" + price.toFixed(2) + "</td></tr>" + (shipping ? "<tr><td>Verzendkosten</td><td>€" + shipping.toFixed(2) + "</td></tr>" : "") + "<tr class=\"total\"><td>Totaal</td><td>€" + total.toFixed(2) + "</td></tr></table>" + (p.bankAccount ? "<p>IBAN: " + escapeHtml(p.bankAccount) + "</p>" : "") + "</body></html>";
    return e.json(200, { html: html, invoiceNumber: invoiceNumber });
  }

  if (name === "send-marketing-email") {
    requireAdmin(e);
    if (appSetting("newsletter_enabled", true) === false) return e.json(200, { success: true, skipped: true, reason: "newsletter_disabled", recipientCount: 0, sentCount: 0, failedCount: 0 });
    var subject = String(p.subject || "").trim();
    var message = String(p.message || p.details || "").trim();
    if (p.templateKind !== "custom") {
      var labels = { color: "kleur", material: "materiaal", article: "artikel", discount: "actie" };
      var label = labels[p.templateKind] || "nieuws";
      var removed = p.changeType === "removed";
      subject = (removed ? "Wijziging: " : "Nieuw: ") + String(p.itemName || label);
      message = removed && p.temporarilyUnavailable ? "Deze " + label + " is tijdelijk niet beschikbaar en komt waarschijnlijk weer terug. " + message : (removed ? "Deze " + label + " is niet meer beschikbaar. " : "Er is een nieuwe " + label + " beschikbaar. ") + message;
    }
    if (!subject || !message) fail("Onderwerp en bericht zijn verplicht.");
    var recipients = [];
    if (p.audience === "all_customers" && p.templateKind === "custom") {
      recipients = $app.findRecordsByFilter("users", "role != 'admin'", "", 5000, 0).map(function (user) { return user.getString("email"); });
    } else {
      recipients = $app.findRecordsByFilter("newsletter_subscriptions", "active = true", "", 5000, 0).map(function (row) { return row.getString("email"); });
    }
    recipients = Array.from(new Set(recipients.filter(Boolean)));
    var sent = 0; var firstError = null;
    recipients.forEach(function (recipient) { try { sendMail(recipient, subject.slice(0, 160), "<h1>" + escapeHtml(subject) + "</h1><p>" + escapeHtml(message).replace(/\n/g, "<br>") + "</p>"); sent += 1; } catch (err) { if (!firstError) firstError = String(err); } });
    var campaign = save("email_campaigns", { created_by: authSupabaseId(e), template_kind: p.templateKind || "custom", change_type: p.changeType || null, audience: p.audience || "newsletter", subject: subject, body: message, recipient_count: recipients.length, sent_count: sent, failed_count: recipients.length - sent, status: sent === recipients.length ? "sent" : sent ? "partial" : "failed", error_message: firstError, sent_at: new Date().toISOString() });
    return e.json(200, { success: sent === recipients.length, campaignId: campaign.getString("supabase_id"), recipientCount: recipients.length, sentCount: sent, failedCount: recipients.length - sent, error: firstError });
  }

  if (name === "generate-content-marketing") {
    requireAdmin(e);
    var contentTopic = String(p.topic || "").trim(); if (!contentTopic) fail("Onderwerp ontbreekt.");
    var content = String(p.platform || "Social media") + " · " + String(p.contentType || "bericht") + "\n\n" + contentTopic + "\n\nOntdek wat Overweel3D voor u kan maken. Neem contact op voor de mogelijkheden.\n\n#Overweel3D #3Dprinten";
    return e.json(200, { content: content });
  }

  if (name === "generate-blog-post") {
    requireAdmin(e);
    var topic = String(p.topic || "").trim(); if (!topic) fail("Onderwerp ontbreekt.");
    var slug = topic.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-" + Date.now();
    var post = save("blog_posts", { title: topic, slug: slug, excerpt: "Lees meer over " + topic + " bij Overweel3D.", meta_description: "Overweel3D over " + topic, content: "<h2>" + escapeHtml(topic) + "</h2><p>Dit conceptartikel is aangemaakt in het admin-dashboard en kan nu verder worden aangevuld.</p>", tags: String(p.keywords || "").split(",").map(function (item) { return item.trim(); }).filter(Boolean), status: "draft" });
    return e.json(200, { success: true, id: post.getString("supabase_id") });
  }

  if (name === "process-referral-reward") {
    var referralUser = requireUser(e);
    var referralOrder = byId("orders", p.order_id);
    var parentCode = one("discount_codes", "code", String(p.discount_code || "").trim().toUpperCase());
    if (!referralOrder) throw new NotFoundError("Bestelling niet gevonden.");
    if (!parentCode || !parentCode.getBool("is_referral")) return e.json(200, { ok: true, skipped: "not-a-referral" });
    if (!isAdmin(e) && referralOrder.getString("user_id") !== (referralUser.getString("supabase_id") || referralUser.id)) throw new ForbiddenError("Geen toegang tot deze bestelling.");
    if (referralOrder.getString("customer_email").toLowerCase() === parentCode.getString("owner_email").toLowerCase()) return e.json(200, { ok: true, skipped: "self-referral" });
    var existingReward = null; try { existingReward = $app.findFirstRecordByFilter("discount_codes", "source_order_id = {:order}", { order: p.order_id }); } catch (_) {}
    if (existingReward) return e.json(200, { ok: true, skipped: "reward-already-created", code: existingReward.getString("code"), reward: Number(existingReward.get("discount_value") || 0) });
    var subtotal = Number(referralOrder.get("final_price") || referralOrder.get("instant_quote_price") || 0);
    var reward = Math.round(subtotal * Number(parentCode.get("reward_percentage") || 0)) / 100;
    if (reward < 1) return e.json(200, { ok: true, skipped: "reward-too-small", reward: reward });
    var rewardCode = randomCode("REF-"); var rewardExpiry = new Date(Date.now() + 90 * 86400000);
    save("discount_codes", { code: rewardCode, discount_type: "fixed", discount_value: reward, max_uses: 1, times_used: 0, active: true, is_public: false, expires_at: rewardExpiry.toISOString(), assigned_to_email: parentCode.getString("owner_email"), parent_code_id: parentCode.getString("supabase_id"), source_order_id: p.order_id });
    try { sendMail(parentCode.getString("owner_email"), "U heeft een Overweel3D-beloning ontvangen", "<h1>Uw persoonlijke kortingscode</h1><p>Code: <strong>" + escapeHtml(rewardCode) + "</strong>, waarde €" + reward.toFixed(2) + ".</p>"); } catch (_) {}
    return e.json(200, { ok: true, code: rewardCode, reward: reward });
  }

  if (name === "send-order-notification") {
    requireAdmin(e);
    var customer = p.customer || {}; var details = p.orderDetails || {};
    if (!customer.name || !customer.email) fail("Klantgegevens ontbreken.");
    sendMail("gijsoverweel@gmail.com", "Nieuwe bestelling van " + String(customer.name).slice(0, 150), "<h1>Nieuwe bestelling</h1><p>Van " + escapeHtml(customer.name) + " (&lt;" + escapeHtml(customer.email) + "&gt;).</p><pre>" + escapeHtml(JSON.stringify(details, null, 2)) + "</pre>");
    sendMail(customer.email, "Bedankt voor uw bestelling bij Overweel3D", "<h1>Bedankt voor uw bestelling</h1><p>Wij hebben uw aanvraag ontvangen en houden u per e-mail op de hoogte.</p>");
    return e.json(200, { success: true });
  }

  if (name === "check-offline-printers") {
    requireAdmin(e);
    var cutoff = Date.now() - 60 * 60 * 1000; var alerted = 0;
    $app.findRecordsByFilter("printers", "status != 'maintenance'", "", 500, 0).forEach(function (printer) {
      var seen = printer.getString("last_seen_at");
      if ((!seen || new Date(seen).getTime() < cutoff) && !printer.getString("offline_alert_sent_at")) {
        printer.set("status", "offline"); printer.set("offline_since", printer.getString("offline_since") || new Date().toISOString()); printer.set("offline_alert_sent_at", new Date().toISOString()); $app.save(printer);
        try { sendMail("gijsoverweel@gmail.com", "Printer langer dan één uur offline", "<p>Printer <strong>" + escapeHtml(printer.getString("name")) + "</strong> is langer dan één uur niet bereikbaar.</p>"); alerted += 1; } catch (_) {}
      }
    });
    return e.json(200, { success: true, alerted: alerted });
  }

  if (name === "send-abandoned-cart-reminders") {
    requireAdmin(e);
    if (appSetting("abandoned_cart_enabled", true) === false) return e.json(200, { success: true, skipped: true, sentCount: 0 });
    var hours = Math.max(1, Math.min(168, Number(appSetting("abandoned_cart_hours", 24)) || 24));
    var carts = $app.findRecordsByFilter("saved_carts", "status = 'active' && reminder_count = 0 && email != ''", "updated", 100, 0);
    var selected = 0; var reminders = 0; var cutoff = Date.now() - hours * 3600000;
    carts.forEach(function (cart) {
      if (new Date(cart.getString("updated_at") || cart.getString("updated")).getTime() >= cutoff) return;
      var items = cart.get("items") || []; if (!Array.isArray(items) || !items.length) return;
      selected += 1;
      try {
        sendMail(cart.getString("email"), "Uw winkelmandje bij Overweel3D staat nog klaar", "<h1>Uw ontwerp staat nog klaar</h1><p>U had " + items.length + " artikel(en) in uw winkelmandje met een waarde van <strong>€" + Number(cart.get("subtotal") || 0).toFixed(2) + "</strong>.</p><p><a href=\"https://overweel3d.gijsoverweel.nl/bestellen\">Winkelmandje openen</a></p>");
        cart.set("status", "abandoned"); cart.set("reminder_count", 1); cart.set("reminder_sent_at", new Date().toISOString()); $app.save(cart); reminders += 1;
      } catch (_) {}
    });
    return e.json(200, { success: true, selectedCount: selected, sentCount: reminders });
  }

  if (["bridge-token-refresh", "printer-status-ingest", "printer-queue-bridge"].indexOf(name) >= 0) {
    return e.json(410, { error: "Deze Edge Function is gemigreerd naar /api/overweel3d/bridge en wordt door add-on 1.20.1 rechtstreeks gebruikt." });
  }

  fail("Functie is nog niet geïmplementeerd: " + name);
});

routerAdd("GET", "/api/overweel3d/functions/download-order-file", function (e) {
  requireIntegrationKey(e, "OVERWEEL3D_EXPORT_API_KEY", "export_api_key");
  var fileId = e.request.url.query().get("file_id");
  var file = byId("order_files", fileId);
  if (!file) throw new NotFoundError("Bestand niet gevonden.");
  var stored = storedFileForPath(file.getString("storage_path"));
  if (!stored) throw new NotFoundError("Het bestand staat niet in PocketBase-opslag.");
  var bytes = storedFileBytes(stored, 250 * 1024 * 1024);
  var mime = file.getString("mime_type") || "application/octet-stream";
  e.response.header().set("Content-Disposition", "attachment; filename=\"" + safeDownloadName(file.getString("original_filename")) + "\"");
  e.response.header().set("Cache-Control", "private, no-store");
  return e.blob(200, mime, bytes);
}, $apis.bodyLimit(1024 * 1024));

routerAdd("POST", "/api/overweel3d/printer-camera-ingest", function (e) {
  var printer = bridgePrinter(e, false);
  var contentType = String(e.request.header.get("Content-Type") || "").split(";")[0].toLowerCase();
  if (["image/jpeg", "image/png"].indexOf(contentType) < 0) throw new BadRequestError("Alleen JPEG- of PNG-beelden zijn toegestaan.", 415);
  var image = toBytes(e.request.body, 5 * 1024 * 1024 + 1);
  if (!image.length) throw new BadRequestError("Camerabeeld is leeg.");
  if (image.length > 5 * 1024 * 1024) throw new BadRequestError("Camerabeeld is groter dan 5 MB.", 413);
  var printerId = printer.getString("supabase_id") || printer.id;
  var path = "printer-camera/" + printerId + "/latest." + (contentType === "image/png" ? "png" : "jpg");
  var stored = storedFileForPath(path);
  if (!stored) {
    stored = new Record($app.findCollectionByNameOrId("storage_files"));
    stored.set("supabase_id", $security.randomString(8) + "-" + $security.randomString(4) + "-4" + $security.randomString(3) + "-a" + $security.randomString(3) + "-" + $security.randomString(12));
    stored.set("bucket", "printer-camera"); stored.set("path", path); stored.set("owner_user_id", ""); stored.set("public", false);
  }
  stored.set("file", $filesystem.fileFromBytes(image, "latest." + (contentType === "image/png" ? "png" : "jpg")));
  $app.save(stored);
  var reported = String(e.request.header.get("X-Plate-Check-Status") || "unknown").toLowerCase();
  var plateStatus = ["correct", "attention", "unknown"].indexOf(reported) >= 0 ? reported : "unknown";
  var capturedAt = new Date().toISOString();
  printer.set("camera_status", "available"); printer.set("camera_last_seen_at", capturedAt); printer.set("plate_check_status", plateStatus); $app.save(printer);
  return e.json(200, { success: true, path: path, captured_at: capturedAt, plate_check_status: plateStatus });
}, $apis.bodyLimit(6 * 1024 * 1024));

function bridgePrinter(e, refresh) {
  var info = e.requestInfo();
  var printerId = String(info.headers["x_printer_id"] || "");
  var token = String(info.headers[refresh ? "x_bridge_refresh_token" : "x_bridge_token"] || "");
  if (!printerId || !token) throw new UnauthorizedError("Bridgegegevens ontbreken.");
  var printer = byId("printers", printerId);
  var expected = printer && printer.getString(refresh ? "bridge_refresh_token_hash" : "bridge_token_hash");
  if (!printer || !expected || !$security.equal(expected, $security.sha256(token))) throw new ForbiddenError("Ongeldige bridge-token.");
  return printer;
}

routerAdd("POST", "/api/overweel3d/bridge/refresh", function (e) {
  var printer = bridgePrinter(e, true);
  var access = $security.randomString(64);
  printer.set("bridge_token_hash", $security.sha256(access));
  printer.set("bridge_token_refreshed_at", new Date().toISOString());
  $app.save(printer);
  return e.json(200, { access_token: access });
});

routerAdd("POST", "/api/overweel3d/bridge/status", function (e) {
  var printer = bridgePrinter(e, false);
  var p = body(e);
  var allowed = ["offline", "idle", "printing", "paused", "error", "maintenance"];
  var status = allowed.indexOf(String(p.status || "")) >= 0 ? String(p.status) : "offline";
  var now = new Date().toISOString();
  printer.set("status", printer.getString("status") === "maintenance" ? "maintenance" : status);
  printer.set("last_seen_at", now);
  printer.set("offline_since", status === "offline" ? (printer.getString("offline_since") || now) : null);
  if (status !== "offline") printer.set("offline_alert_sent_at", null);
  if (!p.heartbeat_only) {
    var fields = ["current_file", "current_plate", "progress", "remaining_minutes", "current_layer", "total_layers", "nozzle_temperature", "bed_temperature", "chamber_temperature", "raw_status"];
    fields.forEach(function (field) { if (p[field] !== undefined) printer.set(field, p[field]); });
  }
  $app.save(printer);

  if (Array.isArray(p.ams_slots)) {
    p.ams_slots.forEach(function (slot) {
      var unit = Number(slot.ams_unit || 0); var number = Number(slot.slot_number || 1);
      var existing = null;
      try { existing = $app.findFirstRecordByFilter("printer_ams_slots", "printer_id = {:printer} && ams_unit = {:unit} && slot_number = {:slot}", { printer: printer.getString("supabase_id"), unit: unit, slot: number }); } catch (_) {}
      var capacity = Math.max(1, Number(slot.spool_capacity_grams || 1000));
      var percent = slot.remaining_percent === null || slot.remaining_percent === undefined ? null : Math.max(0, Math.min(100, Number(slot.remaining_percent)));
      var grams = slot.remaining_grams === null || slot.remaining_grams === undefined ? (percent === null ? null : capacity * percent / 100) : Math.max(0, Number(slot.remaining_grams));
      var values = { printer_id: printer.getString("supabase_id"), ams_unit: unit, slot_number: number, material: slot.material || null, color_name: slot.color_name || null, color_hex: slot.color_hex || null, tray_uuid: slot.tray_uuid || null, remaining_percent: percent, remaining_grams: grams, spool_capacity_grams: capacity, raw_status: slot.raw_status || slot };
      if (existing) { Object.keys(values).forEach(function (key) { existing.set(key, values[key]); }); $app.save(existing); } else save("printer_ams_slots", values);
    });
  }
  return e.json(200, { success: true, heartbeat_only: p.heartbeat_only === true, status: status });
});

routerAdd("POST", "/api/overweel3d/bridge/queue", function (e) {
  var printer = bridgePrinter(e, false);
  var p = body(e); var action = String(p.action || "");
  var printerId = printer.getString("supabase_id") || printer.id;
  if (action === "scan_config") {
    var metadata = null;
    try { metadata = ($app.findRecordsByFilter("printer_sd_files", "printer_id = {:printer} && available = true && metadata_request_id > metadata_completed_request_id", "updated", 1, 0, { printer: printerId }) || [])[0] || null; } catch (_) {}
    return e.json(200, {
      scan_paths: printer.get("ftps_scan_paths") || ["/", "/cache"],
      scan_request_id: printer.getInt("ftps_scan_request_id"), folder_scan_request_id: printer.getInt("ftps_folder_scan_request_id"),
      scan_completed_request_id: printer.getInt("ftps_scan_completed_request_id"), folder_scan_completed_request_id: printer.getInt("ftps_folder_scan_completed_request_id"),
      print_start_request_id: printer.getInt("print_start_request_id"), print_start_completed_request_id: printer.getInt("print_start_completed_request_id"),
      bambu_login_request_id: printer.getInt("bambu_login_request_id"), bambu_login_completed_request_id: printer.getInt("bambu_login_completed_request_id"),
      metadata_request: cleanRecord(metadata)
    });
  }
  if (action === "ack_bambu_login_code") {
    printer.set("bambu_login_completed_request_id", Number(p.request_id || 0));
    printer.set("bambu_login_code_sent_at", p.success === false ? null : new Date().toISOString());
    printer.set("bambu_login_last_error", p.error ? String(p.error).slice(0, 2000) : null); $app.save(printer);
    return e.json(200, { success: true });
  }
  if (action === "ack_print_start") { printer.set("print_start_completed_request_id", Number(p.request_id || 0)); $app.save(printer); return e.json(200, { success: true }); }
  if (action === "sync_host_pc_status") { printer.set("host_pc_status", p.status === "on" ? "on" : "off"); printer.set("host_pc_checked_at", new Date().toISOString()); printer.set("host_pc_uptime_seconds", p.status === "on" ? Number(p.uptime_seconds || 0) : null); $app.save(printer); return e.json(200, { success: true }); }
  if (action === "scan_error") { printer.set("ftps_last_error", String(p.error || "Onbekende FTPS-fout").slice(0, 2000)); $app.save(printer); return e.json(200, { success: true }); }
  if (action === "sync_directories") { printer.set("ftps_directory_listing", Array.isArray(p.directory_listing) ? p.directory_listing.slice(0, 5000) : []); printer.set("ftps_folder_scan_completed_request_id", Number(p.request_id || 0)); printer.set("sd_card_last_seen_at", new Date().toISOString()); printer.set("ftps_last_error", null); $app.save(printer); return e.json(200, { success: true }); }
  if (action === "sync_files") {
    var files = Array.isArray(p.files) ? p.files.slice(0, 1000) : [];
    var old = $app.findRecordsByFilter("printer_sd_files", "printer_id = {:printer}", "", 2000, 0, { printer: printerId });
    old.forEach(function (record) { record.set("available", false); $app.save(record); });
    files.forEach(function (file) {
      if (!file.path || !file.display_name) return;
      var record = null; try { record = $app.findFirstRecordByFilter("printer_sd_files", "printer_id = {:printer} && path = {:path}", { printer: printerId, path: String(file.path) }); } catch (_) {}
      var values = { printer_id: printerId, path: String(file.path).slice(0, 1000), display_name: String(file.display_name).slice(0, 255), size_bytes: file.size_bytes || null, modified_at: file.modified_at || null, plates: file.plates || [], detected_material: file.detected_material || null, detected_color_name: file.detected_color_name || null, detected_filaments: file.detected_filaments || [], available: true, last_seen_at: new Date().toISOString() };
      if (record) { Object.keys(values).forEach(function (key) { record.set(key, values[key]); }); $app.save(record); } else save("printer_sd_files", values);
    });
    printer.set("ftps_scan_completed_request_id", Number(p.request_id || 0)); printer.set("ftps_directory_listing", p.directory_listing || []); printer.set("sd_card_last_seen_at", new Date().toISOString()); printer.set("ftps_last_error", null); $app.save(printer);
    return e.json(200, { success: true, files: files.length });
  }
  if (action === "sync_file_metadata") {
    var file = byId("printer_sd_files", p.file_id); if (!file) throw new NotFoundError("Printbestand niet gevonden.");
    file.set("detected_filaments", p.detected_filaments || []); file.set("detected_material", (p.detected_filaments || [])[0]?.material || null); file.set("detected_color_name", (p.detected_filaments || [])[0]?.color_name || null); if (Array.isArray(p.plates) && p.plates.length) file.set("plates", p.plates); file.set("metadata_completed_request_id", Number(p.request_id || 0)); file.set("metadata_last_error", p.error || null); $app.save(file);
    return e.json(200, { success: true });
  }
  if (action === "active") {
    var active = null; try { active = ($app.findRecordsByFilter("printer_queue_items", "printer_id = {:printer} && (status = 'starting' || status = 'printing')", "command_claimed_at", 1, 0, { printer: printerId }) || [])[0] || null; } catch (_) {}
    return e.json(200, { item: cleanRecord(active) });
  }
  if (action === "next") {
    if (p.manual_trigger !== true) return e.json(200, { command: null, reason: "manual_trigger_required" });
    if (printer.getString("status") !== "idle") return e.json(200, { command: null, reason: "printer_not_idle" });
    var items = $app.findRecordsByFilter("printer_queue_items", "printer_id = {:printer} && (status = 'queued' || status = 'blocked')", "position,created", 100, 0, { printer: printerId });
    var item = items.find(function (candidate) { return !candidate.getString("blocked_reason"); }) || null;
    if (!item) return e.json(200, { command: null, reason: "queue_empty" });
    item.set("status", "starting"); item.set("command_claimed_at", new Date().toISOString()); $app.save(item);
    return e.json(200, { command: cleanRecord(item) });
  }
  if (action === "ack") {
    var itemToAck = byId("printer_queue_items", p.item_id); if (!itemToAck || itemToAck.getString("printer_id") !== printerId) throw new NotFoundError("Wachtrij-item niet gevonden.");
    var allowedStatus = ["printing", "completed", "failed", "paused", "queued"]; if (allowedStatus.indexOf(String(p.status)) < 0) fail("Ongeldige bevestiging.");
    itemToAck.set("status", p.status); itemToAck.set("bridge_error", p.error ? String(p.error).slice(0, 1000) : null); if (p.status === "printing") itemToAck.set("started_at", new Date().toISOString()); if (p.status === "completed") itemToAck.set("completed_at", new Date().toISOString()); if (p.status === "queued") itemToAck.set("command_claimed_at", null); $app.save(itemToAck);
    return e.json(200, { success: true });
  }
  if (action === "notify_manual_intervention") { sendMail("gijsoverweel@gmail.com", "Handmatig ingrijpen nodig bij printer", "<p>" + escapeHtml(p.error || "Controleer de printer en de wachtrij.") + "</p>"); return e.json(200, { success: true }); }
  fail("Onbekende bridgeactie: " + action);
});
