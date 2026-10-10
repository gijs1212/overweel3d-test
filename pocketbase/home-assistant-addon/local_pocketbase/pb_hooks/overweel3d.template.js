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

function mutableJsonObject(value) {
  if (!value) return {};
  value = jsonFieldValue(value);
  if (typeof value === "string") {
    try { value = JSON.parse(value); } catch (_) { return {}; }
  }
  if (typeof value !== "object" || Array.isArray(value)) return {};
  try { return JSON.parse(JSON.stringify(value)); } catch (_) { return {}; }
}

function jsonFieldValue(value) {
  // PocketBase's Go JSON fields may arrive in hooks as UTF-8 byte arrays.
  if (Array.isArray(value) && value.length > 2 &&
      (value[0] === 123 || value[0] === 91) &&
      value.every(function (byte) { return Number.isInteger(byte) && byte >= 0 && byte <= 255; })) {
    try {
      var encoded = value.map(function (byte) { return "%" + ("0" + byte.toString(16)).slice(-2); }).join("");
      return JSON.parse(decodeURIComponent(encoded));
    } catch (_) { return value; }
  }
  return value;
}

function nozzleDiameter(value) {
  if (value === null || value === undefined || value === "") return null;
  if (Array.isArray(value)) {
    for (var index = 0; index < value.length; index += 1) {
      var arrayDiameter = nozzleDiameter(value[index]);
      if (arrayDiameter !== null) return arrayDiameter;
    }
    return null;
  }
  if (typeof value === "object") {
    var keys = ["installed_nozzle_diameter", "nozzle_diameter", "nozzle_diameter_mm", "machine_nozzle_size", "diameter", "value"];
    for (var keyIndex = 0; keyIndex < keys.length; keyIndex += 1) {
      var objectDiameter = nozzleDiameter(value[keys[keyIndex]]);
      if (objectDiameter !== null) return objectDiameter;
    }
    return null;
  }
  var match = String(value).replace(",", ".").match(/(?:^|\D)(0\.\d+|1(?:\.0)?)(?:\D|$)/);
  if (!match) return null;
  var parsed = Number(match[1]);
  return isFinite(parsed) && parsed >= 0.1 && parsed <= 1.2 ? Math.round(parsed * 1000) / 1000 : null;
}

function normalizedPrintFileName(value) {
  var name = String(value || "").replace(/\\/g, "/").split("/").pop().toLowerCase().trim();
  name = name.replace(/\.gcode\.3mf$/i, "").replace(/\.3mf$/i, "").replace(/\.gcode$/i, "");
  return name.replace(/[^a-z0-9]+/g, "");
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

function route0(e) {
  var name = e.request.pathValue("name");
  var p = body(e);

  if (name === "generate_order_number") return json(e, generateOrderNumber());
  if (name === "get_social_publisher_settings") {
    requireAdmin(e);
    return json(e, cleanRecord(socialSetting()));
  }
  if (name === "social_publisher_status") {
    requireAdmin(e);
    var socialStatus = socialSetting();
    return json(e, {
      hook_version: "1.17.0",
      publisher_last_seen_at: socialStatus.getString("publisher_last_seen_at"),
      publisher_version: socialStatus.getString("publisher_version")
    });
  }
  if (name === "social_publisher_next_post") {
    requireAdmin(e);
    return json(e, socialNextPublication(socialSetting()));
  }
  if (name === "social_publisher_activity") {
    requireAdmin(e);
    return json(e, socialActivity());
  }
  if (name === "set_social_publisher_enabled") {
    requireAdmin(e);
    if (typeof p.p_enabled !== "boolean") fail("Geef expliciet actief of gepauzeerd op.");
    var socialToggleSetting = socialSetting();
    socialToggleSetting.set("enabled", p.p_enabled);
    $app.save(socialToggleSetting);
    return json(e, { enabled: socialToggleSetting.getBool("enabled") });
  }
  if (name === "publish_social_job_now") {
    requireAdmin(e);
    var immediateSetting = socialSetting();
    if (!immediateSetting.getBool("enabled")) fail("Zet de automatisering eerst op actief.");
    if (immediateSetting.getBool("dry_run")) fail("Schakel de droogloop uit om echt online te publiceren.");
    var immediateJob = byId("social_post_jobs", String(p.p_job_id || ""));
    if (!immediateJob) throw new NotFoundError("Socialmediataak niet gevonden.");
    if (["queued", "failed"].indexOf(immediateJob.getString("status")) < 0) fail("Alleen wachtende of mislukte taken kunnen direct worden geplaatst.");
    if (!socialTargetPlatforms(immediateJob, immediateSetting).length) fail("Deze taak heeft geen beschikbaar publicatiekanaal.");
    var immediatePayload = socialObject(immediateJob.get("payload"));
    if (!immediatePayload.force_now) immediatePayload.force_priority_original = immediateJob.getInt("priority");
    immediatePayload.force_now = true;
    immediateJob.set("payload", immediatePayload);
    immediateJob.set("status", "queued");
    immediateJob.set("priority", 10000);
    immediateJob.set("scheduled_at", new Date().toISOString());
    immediateJob.set("next_retry_at", "");
    immediateJob.set("attempts", 0);
    immediateJob.set("last_error", "");
    $app.save(immediateJob);
    var wakeSent = false;
    try {
      var wakeUrl = immediateSetting.getString("control_url").replace(/\/+$/, "");
      if (/^http:\/\/(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)[\d.]+:8787$/.test(wakeUrl)) {
        var wakeResponse = $http.send({ url: wakeUrl + "/api/wake", method: "POST", headers: { "X-Overweel-Social-Token": immediateSetting.getString("integration_token") }, timeout: 3 });
        wakeSent = wakeResponse.statusCode >= 200 && wakeResponse.statusCode < 300;
      }
    } catch (wakeError) { console.error("Social Publisher wekverzoek mislukt; de gewone poll verwerkt de taak alsnog:", wakeError); }
    return json(e, { queued: true, wake_sent: wakeSent, job_id: immediateJob.getString("supabase_id") || immediateJob.id });
  }
  if (name === "enqueue_social_backfill") {
    requireAdmin(e);
    return json(e, socialEnqueueExistingCatalog(socialSetting()));
  }
  if (name === "clear_social_publisher_queue") {
    requireAdmin(e);
    var queueJobs = [];
    try { queueJobs = $app.findRecordsByFilter("social_post_jobs", "id != ''", "", 5000, 0) || []; } catch (_) {}
    var cancelledAt = new Date().toISOString();
    queueJobs.forEach(function (job) {
      try {
        job.set("status", "cancelled");
        job.set("completed_at", cancelledAt);
        job.set("next_retry_at", "");
        job.set("last_error", "Geannuleerd doordat de admin de volledige wachtrij heeft leeggemaakt.");
        $app.save(job);
      } catch (_) {}
    });
    var deletedJobs = 0;
    queueJobs.forEach(function (job) {
      try { $app.delete(job); deletedJobs += 1; } catch (_) {}
    });
    return json(e, { cancelled: queueJobs.length, deleted: deletedJobs });
  }

  if (name === "pair_social_publisher") {
    requireAdmin(e);
    var rawControlUrl = String(p.p_control_url || "").trim().replace(/\/+$/, "");
    if (/^\d+\.\d+\.\d+\.\d+$/.test(rawControlUrl)) rawControlUrl = "http://" + rawControlUrl + ":8787";
    var privatePublisherUrl = /^http:\/\/(?:(?:10\.(?:\d{1,3}\.){2}\d{1,3})|(?:192\.168\.(?:\d{1,3})\.(?:\d{1,3}))|(?:172\.(?:1[6-9]|2\d|3[01])\.(?:\d{1,3})\.(?:\d{1,3}))):8787$/;
    if (!privatePublisherUrl.test(rawControlUrl)) fail("Gebruik een lokaal container-IP met poort 8787.");
    var pairingCode = String(p.p_pairing_code || "").trim();
    if (!/^\d{8}$/.test(pairingCode)) fail("Vul de 8-cijferige koppelcode van de container in.");
    var publisherSetting = socialSetting();
    var publisherToken = String(p.p_integration_token || "").trim();
    if (!/^[a-f0-9]{64}$/i.test(publisherToken)) fail("De website kon geen geldige interne koppelsleutel maken.");
    var previousToken = publisherSetting.getString("integration_token");
    var previousControlUrl = publisherSetting.getString("control_url");
    publisherSetting.set("integration_token", publisherToken);
    publisherSetting.set("control_url", rawControlUrl);
    $app.save(publisherSetting);
    var pairResponse;
    try { pairResponse = $http.send({
      url: rawControlUrl + "/api/pair",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pairing_code: pairingCode, token: publisherToken, pocketbase_url: "https://api.gijsoverweel.nl" }),
      timeout: 20
    }); } catch (error) {
      publisherSetting.set("integration_token", previousToken);
      publisherSetting.set("control_url", previousControlUrl);
      $app.save(publisherSetting);
      throw error;
    }
    if (pairResponse.statusCode < 200 || pairResponse.statusCode >= 300) {
      publisherSetting.set("integration_token", previousToken);
      publisherSetting.set("control_url", previousControlUrl);
      $app.save(publisherSetting);
      var pairMessage = pairResponse.json && pairResponse.json.detail ? pairResponse.json.detail : (pairResponse.raw || "Container antwoordde niet.");
      throw new BadRequestError("Koppelen mislukt: " + pairMessage);
    }
    return json(e, { paired: true, connected: !!(pairResponse.json && pairResponse.json.connected), control_url: rawControlUrl, container_version: pairResponse.json && pairResponse.json.version || "" });
  }

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

  if (name === "request_printer_ams_refresh") {
    requireAdmin(e);
    var amsPrinter = byId("printers", p.p_printer_id);
    if (!amsPrinter) fail("Printer niet gevonden.");
    var amsRaw = mutableJsonObject(amsPrinter.get("raw_status"));
    var nextAmsRequest = Number(amsRaw.ams_refresh_request_id || 0) + 1;
    amsRaw.ams_refresh_request_id = nextAmsRequest;
    amsRaw.ams_refresh_requested_at = new Date().toISOString();
    amsPrinter.set("raw_status", amsRaw);
    $app.save(amsPrinter);
    return json(e, nextAmsRequest);
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
}

function route1(e) {
  return e.json(200, { ok: true, service: "overweel3d-pocketbase", version: "1.17.0" });
}

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

function route2(e) {
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
      save("printer_pairing_codes", {
        printer_id: pairPrinter.getString("supabase_id") || pairPrinter.id,
        code_hash: $security.sha256(code),
        // De gebruiker beheert deze code lokaal in Home Assistant. Bewaar hem
        // herbruikbaar zodat een herstart of herinstallatie opnieuw kan koppelen.
        expires_at: null,
        created_by: authSupabaseId(e)
      });
      return e.json(200, { code: code, expires_at: null, reusable: true });
    }
    if (p.action === "exchange") {
      var canonicalPairingCode = String(p.code || "").replace(/[^A-Z0-9]/gi, "").toUpperCase();
      var pairing = one("printer_pairing_codes", "code_hash", $security.sha256(canonicalPairingCode));
      if (!pairing) throw new ForbiddenError("Koppelcode is ongeldig.");
      var pairingExpiry = pairing.getString("expires_at");
      if (pairingExpiry && new Date(pairingExpiry) <= new Date()) throw new ForbiddenError("Koppelcode is verlopen.");
      var pairedPrinter = byId("printers", pairing.getString("printer_id"));
      if (!pairedPrinter) throw new NotFoundError("Printer niet gevonden.");
      var accessToken = canonicalPairingCode;
      var refreshToken = canonicalPairingCode;
      pairedPrinter.set("bridge_token_hash", $security.sha256(accessToken));
      pairedPrinter.set("bridge_refresh_token_hash", $security.sha256(refreshToken));
      pairedPrinter.set("bridge_token_refreshed_at", new Date().toISOString());
      $app.save(pairedPrinter);
      var pairingResult = {
        printer_id: pairedPrinter.getString("supabase_id") || pairedPrinter.id,
        bambu_serial: pairedPrinter.getString("device_serial"),
        bridge_token: accessToken,
        bridge_refresh_token: refreshToken,
        token_mode: "permanent"
      };
      pairing.set("redeemed_at", new Date().toISOString());
      $app.save(pairing);
      return e.json(200, pairingResult);
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

  if (["bridge-token-refresh", "printer-status-ingest"].indexOf(name) >= 0) {
    return e.json(410, { error: "Deze Edge Function is gemigreerd naar /api/overweel3d/bridge en wordt door add-on 1.20.9 rechtstreeks gebruikt." });
  }

  fail("Functie is nog niet geïmplementeerd: " + name);
}

function route3(e) {
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
}

function route4(e) {
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
}

function bridgePrinter(e, refresh) {
  var info = e.requestInfo();
  var printerId = String(info.headers["x_printer_id"] || "");
  var token = String(info.headers[refresh ? "x_bridge_refresh_token" : "x_bridge_token"] || "");
  if (!printerId || !token) throw new UnauthorizedError("Bridgegegevens ontbreken.");
  var printer = byId("printers", printerId);
  var tokenHash = $security.sha256(token);
  var expected = printer && printer.getString(refresh ? "bridge_refresh_token_hash" : "bridge_token_hash");
  var valid = !!(printer && expected && $security.equal(expected, tokenHash));
  if (printer && !valid) {
    var printerSupabaseId = printer.getString("supabase_id") || printer.id;
    var permanentPairing = null;
    try { permanentPairing = $app.findFirstRecordByFilter("printer_pairing_codes", "printer_id = {:printer} && code_hash = {:hash}", { printer: printerSupabaseId, hash: tokenHash }); } catch (_) {}
    valid = !!permanentPairing;
  }
  if (!printer || !valid) throw new ForbiddenError("Ongeldige blijvende bridge-token.");
  return printer;
}

function route5(e) {
  bridgePrinter(e, true);
  var stableToken = String(e.requestInfo().headers["x_bridge_refresh_token"] || "");
  return e.json(200, { access_token: stableToken, token_mode: "permanent", rotated: false });
}

function route6(e) {
  var printer = bridgePrinter(e, false);
  var p = body(e);
  var amsOnly = p.ams_only === true;
  var allowed = ["offline", "idle", "printing", "paused", "error", "maintenance"];
  var status = allowed.indexOf(String(p.status || "")) >= 0 ? String(p.status) : "offline";
  var now = new Date().toISOString();
  if (!amsOnly) {
    printer.set("status", printer.getString("status") === "maintenance" ? "maintenance" : status);
    printer.set("last_seen_at", now);
    printer.set("offline_since", status === "offline" ? (printer.getString("offline_since") || now) : null);
    if (status !== "offline") printer.set("offline_alert_sent_at", null);
  }
  if (!amsOnly && !p.heartbeat_only) {
    var fields = ["current_file", "current_plate", "progress", "remaining_minutes", "current_layer", "total_layers", "nozzle_temperature", "bed_temperature", "chamber_temperature"];
    fields.forEach(function (field) { if (p[field] !== undefined) printer.set(field, p[field]); });
    if (p.raw_status !== undefined) {
      var incomingRaw = mutableJsonObject(p.raw_status);
      var storedRaw = mutableJsonObject(printer.get("raw_status"));
      ["ams_refresh_request_id", "ams_refresh_requested_at", "ams_refresh_completed_request_id", "ams_refresh_completed_at", "ams_last_refreshed_at"].forEach(function (key) {
        if (storedRaw[key] !== undefined) incomingRaw[key] = storedRaw[key];
      });
      printer.set("raw_status", incomingRaw);
    }
  }
  if (!amsOnly && p.installed_nozzle_diameter !== undefined) {
    var nozzleRaw = mutableJsonObject(printer.get("raw_status"));
    var installedNozzle = nozzleDiameter(p.installed_nozzle_diameter);
    if (installedNozzle !== null) nozzleRaw.installed_nozzle_diameter = installedNozzle;
    printer.set("raw_status", nozzleRaw);
  }
  if (amsOnly) {
    var amsStatusRaw = mutableJsonObject(printer.get("raw_status"));
    amsStatusRaw.ams_last_refreshed_at = now;
    printer.set("raw_status", amsStatusRaw);
  }
  $app.save(printer);

  // Een actieve Bambu-print blijft rechtstreeks aan bestaande bestelplaten
  // gekoppeld. Dit is alleen een adminvoorstel; de bridge start geen prints en
  // telt zonder expliciete goedkeuring niets als geprint.
  if (!amsOnly && ["printing", "paused"].indexOf(status) >= 0 && p.current_file) {
    var observedName = String(p.current_file).slice(0, 500);
    var normalizedObserved = normalizedPrintFileName(observedName);
    var reportedPlate = Number(p.current_plate || 0);
    var candidates = [];
    try { candidates = $app.findRecordsByFilter("print_jobs", "active = true", "", 5000, 0) || []; } catch (_) {}
    candidates.forEach(function (job) {
      if (["completed", "cancelled"].indexOf(job.getString("status")) >= 0) return;
      if (job.getInt("runs_completed") >= Math.max(1, job.getInt("runs_required"))) return;
      if (normalizedPrintFileName(job.getString("expected_file_name")) !== normalizedObserved) return;
      var sourcePlate = job.getInt("source_plate_number");
      if (reportedPlate > 0 && sourcePlate > 0 && sourcePlate !== reportedPlate) return;
      var linkedOrder = byId("orders", job.getString("order_id"));
      if (!linkedOrder || ["completed", "cancelled"].indexOf(linkedOrder.getString("status")) >= 0) return;
      if (["approved", "printing", "paused"].indexOf(job.getString("status")) < 0) job.set("status", "suggested");
      job.set("printer_id", printer.getString("supabase_id") || printer.id);
      job.set("observed_file_name", observedName);
      job.set("suggested_at", now);
      $app.save(job);
    });
  }

  if (Array.isArray(p.ams_slots)) {
    var seenAmsSlots = {};
    p.ams_slots.forEach(function (slot) {
      var unit = Number(slot.ams_unit || 0); var number = Number(slot.slot_number || 1);
      var slotKey = unit + ":" + number;
      if (seenAmsSlots[slotKey]) return;
      seenAmsSlots[slotKey] = true;
      var canonicalPrinterId = printer.getString("supabase_id") || printer.id;
      var printerIds = [canonicalPrinterId];
      if (printer.id !== canonicalPrinterId) printerIds.push(printer.id);
      var matches = [];
      printerIds.forEach(function (lookupPrinterId) {
        try {
          ($app.findRecordsByFilter("printer_ams_slots", "printer_id = {:printer} && ams_unit = {:unit} && slot_number = {:slot}", "", 100, 0, { printer: lookupPrinterId, unit: unit, slot: number }) || []).forEach(function (candidate) {
            if (!matches.some(function (known) { return known.id === candidate.id; })) matches.push(candidate);
          });
        } catch (_) {}
      });
      var existing = matches[0] || null;
      var capacity = Math.max(1, Number(slot.spool_capacity_grams || 1000));
      var percent = slot.remaining_percent === null || slot.remaining_percent === undefined ? null : Math.max(0, Math.min(100, Number(slot.remaining_percent)));
      var grams = slot.remaining_grams === null || slot.remaining_grams === undefined ? (percent === null ? null : capacity * percent / 100) : Math.max(0, Number(slot.remaining_grams));
      var values = { printer_id: canonicalPrinterId, ams_unit: unit, slot_number: number, material: slot.material || null, color_name: slot.color_name || null, color_hex: slot.color_hex || null, tray_uuid: slot.tray_uuid || null, remaining_percent: percent, remaining_grams: grams, spool_capacity_grams: capacity, raw_status: slot.raw_status || slot };
      if (existing) { Object.keys(values).forEach(function (key) { existing.set(key, values[key]); }); $app.save(existing); } else save("printer_ams_slots", values);
      matches.slice(1).forEach(function (duplicate) { try { $app.delete(duplicate); } catch (_) {} });

      // Houd per printer en AMS-vak precies een actuele voorraadregel bij. Een
      // nieuwe rol in hetzelfde vak vervangt daarmee het gemeten totaalgewicht,
      // terwijl een handmatige admincorrectie intact blijft.
      var inventoryKey = "ams:" + canonicalPrinterId + ":" + unit + ":" + number;
      var inventory = null;
      try { inventory = $app.findFirstRecordByFilter("filament_inventory", "inventory_key = {:key}", { key: inventoryKey }); } catch (_) {}
      var material = String(slot.material || "").trim();
      var colorName = String(slot.color_name || "").trim();
      var colorHex = String(slot.color_hex || "").trim().toUpperCase();
      if (colorHex && colorHex.charAt(0) !== "#") colorHex = "#" + colorHex;
      if (!/^#[0-9A-F]{6}$/.test(colorHex)) colorHex = "";
      var linkedColor = null;
      try {
        var candidateColors = $app.findRecordsByFilter("filament_colors", "material = {:material}", "sort_order", 500, 0, { material: material }) || [];
        linkedColor = candidateColors.find(function (candidate) {
          var candidateHex = String(candidate.getString("hex") || "").trim().toUpperCase();
          var candidateName = String(candidate.getString("name") || "").trim().toLowerCase();
          return (colorHex && candidateHex === colorHex) || (colorName && candidateName === colorName.toLowerCase());
        }) || null;
        if (!linkedColor && material && colorHex) {
          var automaticName = colorName && colorName.toLowerCase() !== material.toLowerCase() ? colorName : material + " " + colorHex;
          var maxSortOrder = candidateColors.reduce(function (maximum, candidate) { return Math.max(maximum, candidate.getInt("sort_order")); }, -1);
          linkedColor = save("filament_colors", {
            name: automaticName,
            material: material,
            hex: colorHex,
            description: "Automatisch herkend vanuit een gekoppelde AMS.",
            sort_order: maxSortOrder + 1,
            active: true
          });
        }
      } catch (_) {}
      var inventoryValues = {
        inventory_key: inventoryKey,
        color_name: colorName || null,
        material: material || null,
        color_hex: colorHex || null,
        filament_color_id: linkedColor ? (linkedColor.getString("supabase_id") || linkedColor.id) : null,
        tray_uuid: slot.tray_uuid || null,
        spool_capacity_grams: capacity,
        total_weight_grams: grams,
        remaining_percent: percent,
        source_printer_id: canonicalPrinterId,
        source_ams_unit: unit,
        source_slot_number: number,
        last_seen_at: now
      };
      if (inventory) {
        Object.keys(inventoryValues).forEach(function (key) { inventory.set(key, inventoryValues[key]); });
        $app.save(inventory);
      } else {
        save("filament_inventory", inventoryValues);
      }
    });
  }
  return e.json(200, { success: true, heartbeat_only: p.heartbeat_only === true, ams_only: amsOnly, status: status });
}

function route7(e) {
  var printer = bridgePrinter(e, false);
  var p = body(e); var action = String(p.action || "");
  if (action === "scan_config") {
    var scanRaw = mutableJsonObject(printer.get("raw_status"));
    return e.json(200, {
      bambu_login_request_id: printer.getInt("bambu_login_request_id"), bambu_login_completed_request_id: printer.getInt("bambu_login_completed_request_id"),
      ams_refresh_request_id: Number(scanRaw.ams_refresh_request_id || 0),
      ams_refresh_completed_request_id: Number(scanRaw.ams_refresh_completed_request_id || 0)
    });
  }
  if (action === "sync_bambu_color_catalog") {
    var catalog = Array.isArray(p.colors) ? p.colors.slice(0, 2000) : [];
    var websiteColors = $app.findRecordsByFilter("filament_colors", "supabase_id != ''", "", 5000, 0) || [];
    var inventoryRecords = $app.findRecordsByFilter("filament_inventory", "supabase_id != ''", "", 5000, 0) || [];
    var inventoryByKey = {};
    inventoryRecords.forEach(function (record) { inventoryByKey[record.getString("inventory_key")] = record; });
    var normalizeName = function (value) { return String(value || "").trim().toLowerCase(); };
    var normalizeMaterial = function (value) { return String(value || "").trim().toUpperCase(); };
    var normalizeHex = function (value) {
      var hex = String(value || "").trim().toUpperCase();
      return /^#[0-9A-F]{6}$/.test(hex) ? hex : "";
    };
    var newProposals = 0;
    var openProposals = 0;
    var linkedExisting = 0;
    catalog.forEach(function (candidate) {
      var name = String(candidate.name || "").trim();
      var material = normalizeMaterial(candidate.material);
      var hex = normalizeHex(candidate.color_hex);
      var catalogKey = String(candidate.catalog_key || "").trim().slice(0, 180);
      if (!name || !material || !hex || !catalogKey) return;
      var inventoryKey = "bambu-catalog:" + catalogKey;
      var matchingColor = websiteColors.find(function (color) {
        if (normalizeMaterial(color.getString("material")) !== material) return false;
        return normalizeHex(color.getString("hex")) === hex || normalizeName(color.getString("name")) === normalizeName(name);
      }) || null;
      var proposal = inventoryByKey[inventoryKey] || null;
      if (matchingColor) {
        if (proposal && !proposal.getString("filament_color_id")) {
          proposal.set("filament_color_id", matchingColor.getString("supabase_id") || matchingColor.id);
          proposal.set("last_seen_at", new Date().toISOString());
          $app.save(proposal);
          linkedExisting += 1;
        }
        return;
      }
      var values = {
        inventory_key: inventoryKey,
        color_name: name,
        material: material,
        color_hex: hex,
        tray_uuid: catalogKey,
        spool_capacity_grams: 1000,
        total_weight_grams: null,
        remaining_percent: null,
        last_seen_at: new Date().toISOString()
      };
      if (proposal) {
        Object.keys(values).forEach(function (key) { proposal.set(key, values[key]); });
        $app.save(proposal);
      } else {
        proposal = save("filament_inventory", values);
        inventoryByKey[inventoryKey] = proposal;
        newProposals += 1;
      }
      openProposals += 1;
    });
    return e.json(200, { success: true, received: catalog.length, new_proposals: newProposals, open_proposals: openProposals, linked_existing: linkedExisting });
  }
  if (action === "ack_ams_refresh") {
    var ackAmsRaw = mutableJsonObject(printer.get("raw_status"));
    ackAmsRaw.ams_refresh_completed_request_id = Number(p.request_id || 0);
    ackAmsRaw.ams_refresh_completed_at = new Date().toISOString();
    printer.set("raw_status", ackAmsRaw); $app.save(printer);
    return e.json(200, { success: true });
  }
  if (action === "ack_bambu_login_code") {
    printer.set("bambu_login_completed_request_id", Number(p.request_id || 0));
    printer.set("bambu_login_code_sent_at", p.success === false ? null : new Date().toISOString());
    printer.set("bambu_login_last_error", p.error ? String(p.error).slice(0, 2000) : null); $app.save(printer);
    return e.json(200, { success: true });
  }
  fail("Onbekende bridgeactie: " + action);
}

var SOCIAL_DEFAULT_TEMPLATES = {
  product: {
    facebook: "{direct_url}\n\nNieuw bij Overweel3D: {name} ✨\n\nBekijk dit nieuwe product en stel het samen.\n\n#Overweel3D #3Dprinten #Nieuw\n\nhttps://overweel3d.gijsoverweel.nl/",
    instagram: "{direct_url}\n\nNieuw bij Overweel3D: {name} ✨\n\nBekijk dit nieuwe product en stel het samen.\n\n#Overweel3D #3Dprinten #Nieuw\n\nhttps://overweel3d.gijsoverweel.nl/",
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
  }
};

function socialArray(value) {
  value = jsonFieldValue(value);
  if (Array.isArray(value)) return value;
  if (typeof value === "string") { try { var parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch (_) {} }
  return [];
}

function socialObject(value) {
  return mutableJsonObject(value);
}

function socialSetting() {
  var records = [];
  try { records = $app.findRecordsByFilter("social_publisher_settings", "integration_token != ''", "", 100, 0) || []; } catch (error) { console.error("Social Publisher-instellingen met koppelsleutel zoeken mislukt:", error); throw error; }
  if (!records.length) {
    records = $app.findRecordsByFilter("social_publisher_settings", "id != ''", "", 10000, 0) || [];
  }
  if (records.length) return records.filter(function (record) { return record.getBool("enabled"); })[0] || records[0];
  return save("social_publisher_settings", {
    enabled: false, dry_run: true, spotlight_enabled: true, paused_platforms: [], templates: SOCIAL_DEFAULT_TEMPLATES,
    control_url: "http://192.168.2.50:8787", backfill_started_at: new Date().toISOString()
  });
}

function socialRequireToken(e) {
  var supplied = String(e.requestInfo().headers["x_overweel_social_token"] || "");
  var setting = socialSetting();
  var expected = setting.getString("integration_token");
  if (!expected || !supplied || !$security.equal($security.sha256(expected), $security.sha256(supplied))) {
    throw new ForbiddenError("Ongeldige Social Publisher-koppelsleutel.");
  }
  return setting;
}

function socialImagesForProduct(product) {
  var productId = product.getString("supabase_id") || product.id;
  var rows = [];
  try { rows = $app.findRecordsByFilter("product_images", "product_id = {:id}", "", 100, 0, { id: productId }) || []; } catch (_) {}
  if (product.id !== productId) {
    try { rows = rows.concat($app.findRecordsByFilter("product_images", "product_id = {:id}", "", 100, 0, { id: product.id }) || []); } catch (_) {}
  }
  rows.sort(function (a, b) { return Number(b.getBool("is_primary")) - Number(a.getBool("is_primary")) || a.getInt("sort_order") - b.getInt("sort_order"); });
  var paths = rows.filter(function (row) { return row.getString("media_type").toLowerCase() !== "video"; }).map(function (row) { return row.getString("storage_path"); });
  paths = paths.concat(socialArray(product.get("photos")));
  var seen = {};
  return paths.map(socialExistingMediaPath).filter(function (path) {
    if (!path || /\.(mp4|webm|mov|m4v)(?:\?|$)/i.test(path) || seen[path]) return false;
    seen[path] = true;
    return true;
  }).slice(0, 10);
}

function socialExistingMediaPath(value) {
  var path = String(value || "").trim();
  if (!path) return "";
  if (storedFileForPath(path)) return path;
  try { path = decodeURIComponent(path.split("?")[0]); } catch (_) {}
  path = path.replace(/^.*?\/storage\/v1\/object\/(?:public|sign)\/orders\//, "").replace(/^orders\//, "").replace(/^\/+/, "");
  return storedFileForPath(path) ? path : "";
}

function socialColorMedia(color) {
  var hex = String(color.getString("hex") || "").trim().toUpperCase();
  if (/^#[0-9A-F]{6}$/.test(hex)) return ["generated-color:" + hex];
  return socialArray(color.get("photos")).map(socialExistingMediaPath).filter(Boolean).slice(0, 1);
}

function socialColorPng(hex) {
  if (!/^#[0-9A-F]{6}$/.test(hex)) throw new BadRequestError("Ongeldige hexkleur.");
  var width = 512, height = 512;
  var rgb = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  var ink = (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000 > 150 ? [0, 0, 0] : [255, 255, 255];
  var glyphs = {
    "#": ["01010", "11111", "01010", "11111", "01010", "00000", "00000"],
    "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
    "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
    "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
    "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
    "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
    "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
    "6": ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
    "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
    "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
    "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
    "A": ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
    "B": ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
    "C": ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
    "D": ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
    "E": ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
    "F": ["11111", "10000", "10000", "11110", "10000", "10000", "10000"]
  };
  var raw = [], text = hex, scale = 9, advance = 54, textLeft = Math.floor((width - text.length * advance + 9) / 2), textTop = 404;
  for (var y = 0; y < height; y++) {
    raw.push(0);
    for (var x = 0; x < width; x++) {
      var pixel = (x < 12 || y < 12 || x >= width - 12 || y >= height - 12) ? ink : rgb;
      if (y >= textTop && y < textTop + 7 * scale) {
        var glyphIndex = Math.floor((x - textLeft) / advance);
        if (glyphIndex >= 0 && glyphIndex < text.length) {
          var localX = x - textLeft - glyphIndex * advance;
          var gx = Math.floor(localX / scale), gy = Math.floor((y - textTop) / scale);
          if (gx >= 0 && gx < 5 && glyphs[text[glyphIndex]][gy][gx] === "1") pixel = ink;
        }
      }
      raw.push(pixel[0], pixel[1], pixel[2]);
    }
  }
  function be32(value) { return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255]; }
  function crc(bytes) {
    var result = -1;
    for (var i = 0; i < bytes.length; i++) {
      result ^= bytes[i];
      for (var bit = 0; bit < 8; bit++) result = (result >>> 1) ^ ((result & 1) ? 0xEDB88320 : 0);
    }
    return (result ^ -1) >>> 0;
  }
  function chunk(name, data) {
    var type = [name.charCodeAt(0), name.charCodeAt(1), name.charCodeAt(2), name.charCodeAt(3)];
    return be32(data.length).concat(type, data, be32(crc(type.concat(data))));
  }
  var compressed = [0x78, 0x01], s1 = 1, s2 = 0;
  for (var start = 0; start < raw.length; start += 65535) {
    var block = raw.slice(start, start + 65535), length = block.length;
    compressed.push(start + length >= raw.length ? 1 : 0, length & 255, length >>> 8, (~length) & 255, ((~length) >>> 8) & 255);
    for (var n = 0; n < length; n++) { s1 = (s1 + block[n]) % 65521; s2 = (s2 + s1) % 65521; }
    compressed = compressed.concat(block);
  }
  compressed = compressed.concat(be32((s2 << 16) | s1));
  return [137, 80, 78, 71, 13, 10, 26, 10].concat(chunk("IHDR", be32(width).concat(be32(height), [8, 2, 0, 0, 0])), chunk("IDAT", compressed), chunk("IEND", []));
}

function socialJob(eventKey) {
  try { return $app.findFirstRecordByFilter("social_post_jobs", "event_key = {:key}", { key: eventKey }); } catch (_) { return null; }
}

function socialCreateJob(setting, sourceType, record, media, payload, isBackfill, eventKey, scheduledAt) {
  var existing = socialJob(eventKey);
  if (existing) {
    if (existing.getString("status") === "waiting_for_media" && media.length) {
      existing.set("media_paths", media); existing.set("payload", payload); existing.set("status", "queued"); existing.set("scheduled_at", new Date().toISOString());
      $app.save(existing);
    }
    return null;
  }
  var name = record.getString("name") || record.getString("code") || sourceType;
  return save("social_post_jobs", {
    event_key: eventKey, source_type: sourceType, source_id: record.getString("supabase_id") || record.id, source_name: name,
    status: media.length ? "queued" : "waiting_for_media", priority: isBackfill ? 10 : (sourceType === "spotlight" ? 50 : 100),
    scheduled_at: scheduledAt || new Date().toISOString(), media_paths: media, payload: payload, attempts: 0, is_backfill: isBackfill,
    platform_state: { facebook: "pending", instagram: "pending" }
  });
}

function socialEnqueueExistingCatalog(setting) {
  var counts = { queued: 0, updated: 0, already_done: 0, waiting_for_media: 0, products: 0, colors: 0 };
  function enqueue(type, record, media, payload) {
    var id = record.getString("supabase_id") || record.id;
    var key = "new:" + type + ":" + id;
    var existing = socialJob(key);
    if (existing) {
      var status = existing.getString("status");
      if (["completed", "published", "dry_run_complete"].indexOf(status) >= 0) {
        if (socialCreateJob(setting, type, record, media, payload, true, "backfill:" + type + ":" + id)) {
          counts.queued += 1;
          if (!media.length) counts.waiting_for_media += 1;
        } else counts.already_done += 1;
        return;
      }
      if (["processing", "manual_attention", "cancelled"].indexOf(status) >= 0) { counts.already_done += 1; return; }
      existing.set("is_backfill", true);
      existing.set("priority", 10);
      existing.set("media_paths", media);
      existing.set("payload", payload);
      existing.set("status", media.length ? "queued" : "waiting_for_media");
      existing.set("scheduled_at", new Date().toISOString());
      $app.save(existing);
      counts.updated += 1;
    } else if (socialCreateJob(setting, type, record, media, payload, true, key)) {
      counts.queued += 1;
    }
    if (!media.length) counts.waiting_for_media += 1;
  }
  var products = $app.findRecordsByFilter("products", "active = true", "", 5000, 0) || [];
  products.forEach(function (product) {
    counts.products += 1;
    var id = product.getString("supabase_id") || product.id;
    enqueue("product", product, socialImagesForProduct(product), { name: product.getString("name"), direct_url: "https://overweel3d.gijsoverweel.nl/bestellen?product=" + encodeURIComponent(id) });
  });
  var colors = $app.findRecordsByFilter("filament_colors", "active = true", "", 5000, 0) || [];
  colors.forEach(function (color) {
    counts.colors += 1;
    var id = color.getString("supabase_id") || color.id;
    enqueue("color", color, socialColorMedia(color), { name: color.getString("name"), material: color.getString("material"), direct_url: "https://overweel3d.gijsoverweel.nl/kleuren?color=" + encodeURIComponent(id) });
  });
  return counts;
}

function socialSyncCatalog(setting) {
  var startedAt = setting.getString("backfill_started_at");
  if (!startedAt) { startedAt = new Date().toISOString(); setting.set("backfill_started_at", startedAt); $app.save(setting); }
  var initialSync = !setting.getString("last_sync_at");
  var created = 0;
  var products = [];
  try { products = $app.findRecordsByFilter("products", "active = true", "created", 5000, 0) || []; } catch (_) {}
  products.forEach(function (product) {
    var id = product.getString("supabase_id") || product.id;
    var productKey = "new:product:" + id;
    var existingProductJob = socialJob(productKey);
    if (existingProductJob && existingProductJob.getString("status") !== "waiting_for_media") return;
    var media = socialImagesForProduct(product);
    var isBackfill = initialSync;
    if (socialCreateJob(setting, "product", product, media, { name: product.getString("name"), direct_url: "https://overweel3d.gijsoverweel.nl/bestellen?product=" + encodeURIComponent(id) }, isBackfill, productKey)) created += 1;
  });
  var colors = [];
  try { colors = $app.findRecordsByFilter("filament_colors", "active = true", "created", 5000, 0) || []; } catch (_) {}
  colors.forEach(function (color) {
    var id = color.getString("supabase_id") || color.id;
    var colorKey = "new:color:" + id;
    var existingColorJob = socialJob(colorKey);
    if (existingColorJob && existingColorJob.getString("status") !== "waiting_for_media") return;
    var photos = socialColorMedia(color);
    var isBackfill = initialSync;
    if (socialCreateJob(setting, "color", color, photos, { name: color.getString("name"), material: color.getString("material"), direct_url: "https://overweel3d.gijsoverweel.nl/kleuren?color=" + encodeURIComponent(id) }, isBackfill, colorKey)) created += 1;
  });
  var discounts = [];
  try { discounts = $app.findRecordsByFilter("discount_codes", "active = true && is_public = true", "created", 5000, 0) || []; } catch (_) {}
  discounts.forEach(function (discount) {
    var id = discount.getString("supabase_id") || discount.id;
    var discountPath = setting.getString("discount_image_path");
    var discountType = discount.getString("discount_type");
    var amount = Number(discount.get("discount_value") || 0);
    var label = discountType === "percentage" ? amount + "%" : "€" + amount.toFixed(2);
    var expires = discount.getString("expires_at");
    var maxUses = discount.getInt("max_uses");
    var payload = { code: discount.getString("code"), discount_label: label, expires_label: expires ? expires.slice(0, 10) : "geen einddatum", usage_label: maxUses > 0 ? "maximaal " + maxUses + " keer te gebruiken" : "onbeperkt te gebruiken", direct_url: "https://overweel3d.gijsoverweel.nl/bestellen?kortingscode=" + encodeURIComponent(discount.getString("code")) };
    var isBackfill = initialSync;
    if (socialCreateJob(setting, "discount", discount, discountPath ? [discountPath] : [], payload, isBackfill, "new:discount:" + id)) created += 1;
  });
  setting.set("last_sync_at", new Date().toISOString()); $app.save(setting);
  return created;
}

function socialAmsterdamOffset(date) {
  var year = date.getUTCFullYear();
  function lastSunday(month) { var d = new Date(Date.UTC(year, month + 1, 0)); return d.getUTCDate() - d.getUTCDay(); }
  var start = new Date(Date.UTC(year, 2, lastSunday(2), 1));
  var end = new Date(Date.UTC(year, 9, lastSunday(9), 1));
  return date >= start && date < end ? 2 : 1;
}

function socialNextLocal19(now, days) {
  var offset = socialAmsterdamOffset(now);
  var local = new Date(now.getTime() + offset * 3600000);
  var target = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + (days || 0), 19, 0, 0));
  if (!days && target <= local) target.setUTCDate(target.getUTCDate() + 1);
  var estimatedUtc = new Date(target.getTime() - offset * 3600000);
  var correctedOffset = socialAmsterdamOffset(estimatedUtc);
  return new Date(target.getTime() - correctedOffset * 3600000);
}

function socialStableIndex(seed, length) {
  var hash = 5381;
  String(seed || "").split("").forEach(function (character) { hash = (hash * 33 + character.charCodeAt(0)) >>> 0; });
  return hash % length;
}

function socialChooseBackfill(jobs, setting) {
  if (!jobs.length) return null;
  var sorted = jobs.slice().sort(function (a, b) { return String(a.getString("event_key") || a.id).localeCompare(String(b.getString("event_key") || b.id)); });
  var seed = setting.getString("backfill_last_published_at") || setting.getString("backfill_started_at") || "first-backfill";
  return sorted[socialStableIndex(seed, sorted.length)];
}

function socialTargetPlatforms(job, setting) {
  var payload = socialObject(job.get("payload"));
  var requested = socialArray(payload.target_platforms).filter(function (platform) { return ["facebook", "instagram"].indexOf(platform) >= 0; });
  if (!requested.length) requested = ["facebook", "instagram"];
  var paused = socialArray(setting.get("paused_platforms"));
  var state = socialObject(job.get("platform_state"));
  return requested.filter(function (platform) { return paused.indexOf(platform) < 0 && ["published", "dry_run"].indexOf(state[platform]) < 0; });
}

function socialReadyAt(job, setting, now) {
  var time = new Date(job.getString("scheduled_at") || now.toISOString()).getTime();
  if (!isFinite(time)) time = now.getTime();
  // A manual "publish now" raises priority to 10000. Honour that even when
  // PocketBase exposes the JSON payload in a form that doesn't round-trip here.
  if (job.getInt("priority") >= 10000 || socialObject(job.get("payload")).force_now === true) return time;
  var retry = new Date(job.getString("next_retry_at")).getTime();
  if (isFinite(retry)) time = Math.max(time, retry);
  if (job.getBool("is_backfill")) {
    var last = new Date(setting.getString("backfill_last_published_at")).getTime();
    if (isFinite(last)) time = Math.max(time, last + 2 * 3600000);
  }
  return time;
}

function socialSelectNextJob(candidates, setting, now) {
  var available = candidates.filter(function (job) { return job.getString("source_type") !== "session_check" && socialTargetPlatforms(job, setting).length > 0; });
  var due = available.filter(function (job) { return socialReadyAt(job, setting, now) <= now.getTime(); });
  var pool = due.length ? due : available;
  if (!pool.length) return null;
  if (!due.length) pool.sort(function (a, b) { return socialReadyAt(a, setting, now) - socialReadyAt(b, setting, now) || b.getInt("priority") - a.getInt("priority"); });
  else pool.sort(function (a, b) { return b.getInt("priority") - a.getInt("priority") || socialReadyAt(a, setting, now) - socialReadyAt(b, setting, now); });
  var first = pool[0];
  var tied = pool.filter(function (job) {
    return job.getInt("priority") === first.getInt("priority") &&
      (due.length || socialReadyAt(job, setting, now) === socialReadyAt(first, setting, now));
  });
  var selected = first.getBool("is_backfill") ? socialChooseBackfill(tied.filter(function (job) { return job.getBool("is_backfill"); }), setting) : first;
  var readyAt = socialReadyAt(selected, setting, now);
  return { job: selected, scheduled_at: new Date(readyAt).toISOString(), due: readyAt <= now.getTime() };
}

function socialSpotlightProduct(nextAt) {
  var products = [];
  try { products = $app.findRecordsByFilter("products", "active = true", "", 5000, 0) || []; } catch (_) {}
  products = products.filter(function (product) { return socialImagesForProduct(product).length > 0; });
  if (!products.length) return null;
  products.sort(function (a, b) { return String(a.getString("supabase_id") || a.id).localeCompare(String(b.getString("supabase_id") || b.id)); });
  return products[socialStableIndex(nextAt, products.length)];
}

function socialNextPublication(setting) {
  var now = new Date();
  var state = setting.getBool("enabled") ? (setting.getBool("dry_run") ? "dry_run" : "scheduled") : "paused";
  var processing = [];
  try { processing = $app.findRecordsByFilter("social_post_jobs", "status = 'processing' && source_type != 'session_check'", "-priority,scheduled_at", 1, 0) || []; } catch (_) {}
  if (processing.length) return { state: state === "scheduled" ? "processing" : state, source_name: processing[0].getString("source_name"), source_type: processing[0].getString("source_type"), scheduled_at: processing[0].getString("claimed_at") || processing[0].getString("scheduled_at"), due: true, platforms: socialTargetPlatforms(processing[0], setting), is_backfill: processing[0].getBool("is_backfill") };
  var candidates = [];
  try { candidates = $app.findRecordsByFilter("social_post_jobs", "status = 'queued' || status = 'failed'", "-priority,scheduled_at", 5000, 0) || []; } catch (_) {}
  var next = socialSelectNextJob(candidates, setting, now);
  if (next) return { state: state, source_name: next.job.getString("source_name"), source_type: next.job.getString("source_type"), scheduled_at: next.scheduled_at, due: next.due, platforms: socialTargetPlatforms(next.job, setting), is_backfill: next.job.getBool("is_backfill") };
  var unfinished = [];
  try { unfinished = $app.findRecordsByFilter("social_post_jobs", "is_backfill = true && status != 'completed' && status != 'dry_run_complete' && status != 'cancelled'", "", 1, 0) || []; } catch (_) {}
  if (unfinished.length) return { state: "waiting_for_media", source_name: "Bestaande catalogus", source_type: "backfill", scheduled_at: null, platforms: [], is_backfill: true };
  if (setting.getBool("spotlight_enabled")) {
    var nextAt = setting.getString("spotlight_next_at") || socialNextLocal19(now, 0).toISOString();
    var product = socialSpotlightProduct(nextAt);
    if (product) {
      var platforms = ["facebook", "instagram"].filter(function (platform) { return socialArray(setting.get("paused_platforms")).indexOf(platform) < 0; });
      return { state: platforms.length ? state : "paused", source_name: product.getString("name"), source_type: "spotlight", scheduled_at: nextAt, platforms: platforms, is_backfill: false };
    }
  }
  return { state: "none", source_name: "", source_type: "", scheduled_at: null, platforms: [], is_backfill: false };
}

function socialActivity() {
  var rows = $app.findRecordsByFilter("social_post_history", "id != ''", "-published_at", 100, 0) || [];
  var jobs = {};
  return rows.map(function (row) {
    var jobId = row.getString("job_id");
    if (jobs[jobId] === undefined) jobs[jobId] = byId("social_post_jobs", jobId) || null;
    var job = jobs[jobId];
    var details = socialObject(row.get("details"));
    return {
      id: row.getString("supabase_id") || row.id,
      job_id: jobId,
      source_name: String(details.source_name || (job && job.getString("source_name")) || "Onbekende taak"),
      source_type: String(details.source_type || (job && job.getString("source_type")) || ""),
      platform: row.getString("platform"),
      status: row.getString("status"),
      post_url: row.getString("post_url"),
      error: String(details.error || ""),
      happened_at: row.getString("published_at")
    };
  });
}

function socialScheduleSpotlight(setting) {
  if (!setting.getBool("spotlight_enabled")) return;
  var now = new Date();
  var planned = [];
  try { planned = $app.findRecordsByFilter("social_post_jobs", "source_type = 'spotlight' && (status = 'queued' || status = 'failed' || status = 'processing' || status = 'waiting_for_media')", "scheduled_at", 1, 0) || []; } catch (_) {}
  if (planned.length) return;
  var nextText = setting.getString("spotlight_next_at");
  if (!nextText) {
    nextText = socialNextLocal19(now, 0).toISOString();
    setting.set("spotlight_next_at", nextText);
    $app.save(setting);
  }
  var next = new Date(nextText);
  if (!isFinite(next.getTime())) {
    next = socialNextLocal19(now, 0);
    nextText = next.toISOString();
    setting.set("spotlight_next_at", nextText);
    $app.save(setting);
  }
  var product = socialSpotlightProduct(nextText);
  if (product) {
    var id = product.getString("supabase_id") || product.id;
    var dateKey = next.toISOString().slice(0, 10);
    socialCreateJob(setting, "spotlight", product, socialImagesForProduct(product), { name: product.getString("name"), direct_url: "https://overweel3d.gijsoverweel.nl/bestellen?product=" + encodeURIComponent(id) }, false, "spotlight:" + dateKey, nextText);
  }
}

function socialRender(template, values) {
  return String(template || "").replace(/\{([a-z_]+)\}/g, function (_, key) { return values[key] === undefined || values[key] === null ? "" : String(values[key]); });
}

function socialMediaSignature(setting, jobId, index, expiresAt, path) {
  var secret = setting && setting.getString("integration_token");
  if (!secret) return "";
  return $security.sha256([String(jobId || ""), String(index), String(expiresAt), String(path || ""), secret].join("|"));
}

function socialCreateMediaGrant(jobId, index, path, expiresAt) {
  var token = $security.randomString(48);
  var grant = save("social_media_grants", {
    job_id: jobId,
    // PocketBase Required NumberField accepteert 0 niet. Sla de positie daarom
    // 1-gebaseerd op; de publieke API en publisher blijven 0-gebaseerd.
    media_index: index + 1,
    path: path,
    prepared_path: "",
    token_hash: $security.sha256(token),
    expires_at: expiresAt
  });
  return { id: grant.getString("supabase_id") || grant.id, token: token };
}

function socialClaim(setting, metaReady) {
  var now = new Date();
  var candidates = [];
  // Do not filter on scheduled_at in PocketBase: legacy date values and
  // force_now tasks must be compared by socialReadyAt below, not SQL text order.
  try { candidates = $app.findRecordsByFilter("social_post_jobs", "status = 'queued' || status = 'failed'", "-priority,scheduled_at", 5000, 0) || []; }
  catch (error) { console.error("Social Publisher kon de wachtrij niet lezen:", error); throw error; }
  var sessionChecks = candidates.filter(function (candidate) { return candidate.getString("source_type") === "session_check" && socialReadyAt(candidate, setting, now) <= now.getTime(); });
  var next = metaReady ? socialSelectNextJob(candidates, setting, now) : null;
  var job = sessionChecks.length && (!next || sessionChecks[0].getInt("priority") >= next.job.getInt("priority")) ? sessionChecks[0] : next && next.due ? next.job : null;
  if (!job) return null;
  var type = job.getString("source_type");
  if (!setting.getBool("enabled") && type !== "session_check") return null;
  var templates = socialObject(setting.get("templates"));
  var selected = templates[type] || SOCIAL_DEFAULT_TEMPLATES[type] || {};
  var payload = socialObject(job.get("payload"));
  if (payload.force_now === true) {
    job.set("priority", Number(payload.force_priority_original) || (job.getBool("is_backfill") ? 10 : 100));
    delete payload.force_now;
    delete payload.force_priority_original;
  }
  var requestedPlatforms = socialArray(payload.target_platforms).filter(function (platform) { return ["facebook", "instagram"].indexOf(platform) >= 0; });
  if (!requestedPlatforms.length) requestedPlatforms = ["facebook", "instagram"];
  var platforms = type === "session_check" ? requestedPlatforms : socialTargetPlatforms(job, setting);
  if (!platforms.length) return null;
  var mediaPaths = socialArray(job.get("media_paths")).slice(0, 10);
  if (type === "product" || type === "spotlight") {
    var sourceProduct = byId("products", job.getString("source_id"));
    if (sourceProduct) {
      var productId = sourceProduct.getString("supabase_id") || sourceProduct.id;
      payload.name = sourceProduct.getString("name");
      payload.direct_url = "https://overweel3d.gijsoverweel.nl/bestellen?product=" + encodeURIComponent(productId);
      var currentMedia = socialImagesForProduct(sourceProduct);
      if (currentMedia.length) { mediaPaths = currentMedia; job.set("media_paths", mediaPaths); }
    }
  }
  var mediaGrant = { token: $security.randomString(48), expires_at: new Date(now.getTime() + 24 * 3600000).toISOString(), paths: mediaPaths };
  payload.social_media_grant = mediaGrant;
  job.set("payload", payload);
  var texts = {};
  var customTexts = socialObject(payload.texts);
  platforms.forEach(function (platform) {
    texts[platform] = type === "manual" ? String(customTexts[platform] || customTexts.default || "") : socialRender(selected[platform] || (SOCIAL_DEFAULT_TEMPLATES[type] || {})[platform], payload);
  });
  // The publisher now reads sources through /media and uses a prepared
  // PocketBase file URL for Meta. No new public-media grants are issued.
  job.set("status", "processing"); job.set("claimed_at", now.toISOString()); $app.save(job);
  if (type !== "session_check") {
    try {
      save("social_post_history", {
        job_id: job.getString("supabase_id") || job.id, platform: "system", status: "started",
        details: { source_name: job.getString("source_name"), source_type: type }, published_at: now.toISOString()
      });
    } catch (historyError) { console.error("Social Publisher-start niet in activiteitengeschiedenis opgeslagen:", historyError); }
  }
  if (job.getBool("is_backfill")) { setting.set("backfill_last_published_at", now.toISOString()); $app.save(setting); }
  return { id: job.getString("supabase_id") || job.id, source_type: type, source_name: job.getString("source_name"), media_paths: mediaPaths, media_urls: [], texts: texts, platforms: platforms, dry_run: setting.getBool("dry_run") };
}

function socialReport(setting, p) {
  var job = byId("social_post_jobs", String(p.job_id || ""));
  if (!job) throw new NotFoundError("Socialmediataak niet gevonden.");
  var platform = String(p.platform || "");
  if (["facebook", "instagram"].indexOf(platform) < 0) fail("Onbekend platform.");
  var state = socialObject(job.get("platform_state"));
  var reportedStatus = String(p.status || "failed");
  state[platform] = reportedStatus;
  var paused = socialArray(setting.get("paused_platforms"));
  var jobPayload = socialObject(job.get("payload"));
  var jobTargets = socialArray(jobPayload.target_platforms).filter(function (name) { return ["facebook", "instagram"].indexOf(name) >= 0; });
  if (!jobTargets.length) jobTargets = ["facebook", "instagram"];
  job.set("platform_state", state);
  if (p.error) job.set("last_error", String(p.error).slice(0, 10000));
  if (job.getString("source_type") === "session_check") {
    var checksDone = jobTargets.every(function (name) { return ["connected", "disconnected", "manual_attention"].indexOf(state[name]) >= 0; });
    if (checksDone) {
      var allConnected = jobTargets.every(function (name) { return state[name] === "connected"; });
      job.set("status", allConnected ? "completed" : "manual_attention");
      job.set("completed_at", new Date().toISOString());
    }
    $app.save(job);
    save("social_post_history", { job_id: job.getString("supabase_id") || job.id, platform: platform, status: reportedStatus, post_url: p.post_url || "", details: { error: p.error || "", screenshot_path: p.screenshot_path || "", source_name: job.getString("source_name"), source_type: job.getString("source_type") }, published_at: new Date().toISOString() });
    return cleanRecord(job);
  }
  var successStates = ["published", "dry_run"];
  var payload = jobPayload;
  var requestedPlatforms = jobTargets;
  var allDone = requestedPlatforms.every(function (name) { return paused.indexOf(name) >= 0 || successStates.indexOf(state[name]) >= 0; });
  if (requestedPlatforms.some(function (name) { return state[name] === "manual_attention"; })) job.set("status", "manual_attention");
  else if (allDone) {
    job.set("status", setting.getBool("dry_run") ? "dry_run_complete" : "completed");
    job.set("completed_at", new Date().toISOString());
    if (job.getString("source_type") === "spotlight") {
      setting.set("spotlight_next_at", socialNextLocal19(new Date(), 2).toISOString());
      $app.save(setting);
    }
  }
  else if (reportedStatus === "failed") {
    var attempts = job.getInt("attempts") + 1; job.set("attempts", attempts);
    if (attempts >= 3) job.set("status", "manual_attention");
    else { job.set("status", "failed"); job.set("next_retry_at", new Date(Date.now() + [60000, 300000, 900000][attempts - 1]).toISOString()); }
  } else job.set("status", requestedPlatforms.some(function (name) { return state[name] === "failed"; }) ? "failed" : "processing");
  $app.save(job);
  if (allDone && job.getString("source_type") === "spotlight") socialScheduleSpotlight(setting);
  save("social_post_history", { job_id: job.getString("supabase_id") || job.id, platform: platform, status: reportedStatus, post_url: p.post_url || "", details: { error: p.error || "", screenshot_path: p.screenshot_path || "", source_name: job.getString("source_name"), source_type: job.getString("source_type") }, published_at: new Date().toISOString() });
  return cleanRecord(job);
}

function socialSessionCheckResult(p) {
  var job = byId("social_post_jobs", String(p.job_id || ""));
  if (!job || job.getString("source_type") !== "session_check") throw new NotFoundError("Accountcontrole niet gevonden.");
  if (["completed", "manual_attention"].indexOf(job.getString("status")) >= 0) return cleanRecord(job);
  var results = socialObject(p.results);
  var targets = socialArray(socialObject(job.get("payload")).target_platforms).filter(function (name) { return ["facebook", "instagram"].indexOf(name) >= 0; });
  if (!targets.length) targets = ["facebook", "instagram"];
  var state = {};
  var errors = [];
  targets.forEach(function (platform) {
    var result = socialObject(results[platform]);
    var resultStatus = String(result.status || "");
    if (["connected", "disconnected", "manual_attention"].indexOf(resultStatus) < 0) fail("Ongeldige accountcontrolestatus voor " + platform + ".");
    state[platform] = resultStatus;
    var error = String(result.error || "").slice(0, 10000);
    if (error) errors.push(platform + ": " + error);
    var values = {
      platform: platform, status: resultStatus, last_checked_at: new Date().toISOString(),
      last_error: error, screenshot_path: String(result.screenshot_path || ""),
      account_name: String(result.account_name || ""), account_url: String(result.account_url || ""),
      check_steps: socialArray(result.check_steps)
    };
    var existing = one("social_publisher_sessions", "platform", platform);
    if (existing) { Object.keys(values).forEach(function (key) { existing.set(key, values[key]); }); $app.save(existing); }
    else save("social_publisher_sessions", values);
    save("social_post_history", {
      job_id: job.getString("supabase_id") || job.id, platform: platform, status: resultStatus,
      post_url: values.account_url, details: { error: error, screenshot_path: values.screenshot_path, source_name: job.getString("source_name"), source_type: job.getString("source_type") },
      published_at: new Date().toISOString()
    });
  });
  job.set("platform_state", state);
  job.set("status", targets.every(function (name) { return state[name] === "connected"; }) ? "completed" : "manual_attention");
  job.set("last_error", errors.join("; ").slice(0, 10000));
  job.set("completed_at", new Date().toISOString());
  $app.save(job);
  return cleanRecord(job);
}

function route8(e) {
  var setting = socialRequireToken(e);
  var action = String(e.request.pathValue("action") || "");
  var p = body(e);
  if (action === "heartbeat") {
    var heartbeatAt = new Date().toISOString();
    setting.set("publisher_last_seen_at", heartbeatAt);
    setting.set("publisher_version", String(p.version || "").slice(0, 100));
    $app.save(setting);
    return json(e, { connected: true, received_at: heartbeatAt, hook_version: "1.17.0" });
  }
  if (action === "poll") {
    var publisherVersion = String(p.version || "").match(/^(\d+)\.(\d+)\.(\d+)$/);
    if (!publisherVersion || Number(publisherVersion[1]) < 2 || (Number(publisherVersion[1]) === 2 && Number(publisherVersion[2]) < 6)) {
      throw new BadRequestError("Social Publisher 2.6.0 of nieuwer is vereist; oudere containers ondersteunen de nieuwe media-URL niet.");
    }
    socialSyncCatalog(setting); socialScheduleSpotlight(setting);
    if (p.diagnose === true) {
      var diagnosticCandidates = $app.findRecordsByFilter("social_post_jobs", "status = 'queued' || status = 'failed'", "-priority,scheduled_at", 5000, 0) || [];
      var diagnosticNow = new Date();
      var diagnosticNext = socialSelectNextJob(diagnosticCandidates, setting, diagnosticNow);
      return json(e, { diagnostic: {
        now: diagnosticNow.toISOString(), enabled: setting.getBool("enabled"), meta_ready: p.meta_ready === true,
        candidate_count: diagnosticCandidates.length,
        next_id: diagnosticNext ? diagnosticNext.job.id : "",
        next_due: diagnosticNext ? diagnosticNext.due : false,
        next_scheduled_at: diagnosticNext ? diagnosticNext.scheduled_at : "",
        next_platforms: diagnosticNext ? socialTargetPlatforms(diagnosticNext.job, setting) : []
      }, version: "1.17.0" });
    }
    return json(e, { job: socialClaim(setting, p.meta_ready === true), version: "1.17.0" });
  }
  if (action === "prepare_media") {
    var mediaJob = byId("social_post_jobs", String(p.job_id || ""));
    if (!mediaJob || mediaJob.getString("status") !== "processing") throw new NotFoundError("Actieve publicatietaak niet gevonden.");
    var mediaPayload = socialObject(mediaJob.get("payload"));
    var mediaGrant = socialObject(mediaPayload.social_media_grant);
    var mediaIndex = Number(p.index);
    var mediaPaths = socialArray(mediaGrant.paths);
    if (!mediaGrant.expires_at || new Date(mediaGrant.expires_at).getTime() <= Date.now() || !Number.isInteger(mediaIndex) || mediaIndex < 0 || mediaIndex >= mediaPaths.length) fail("Ongeldige of verlopen afbeelding.");
    var encoded = String(p.image_base64 || "");
    if (encoded.length > 11 * 1024 * 1024) throw new BadRequestError("Afbeelding is te groot.", 413);
    var jpeg = base64Bytes(encoded);
    if (jpeg.length < 100 || jpeg.length > 8 * 1024 * 1024 || jpeg[0] !== 255 || jpeg[1] !== 216 || jpeg[jpeg.length - 2] !== 255 || jpeg[jpeg.length - 1] !== 217) fail("Alleen volledige JPEG-afbeeldingen zijn toegestaan.");
    var imagePath = "social-publisher/" + mediaJob.id + "/" + mediaIndex + ".jpg";
    var imageRecord = storedFileForPath(imagePath);
    if (!imageRecord) {
      imageRecord = new Record($app.findCollectionByNameOrId("storage_files"));
      imageRecord.set("supabase_id", $security.randomString(8) + "-" + $security.randomString(4) + "-4" + $security.randomString(3) + "-a" + $security.randomString(3) + "-" + $security.randomString(12));
      imageRecord.set("bucket", "social-publisher"); imageRecord.set("path", imagePath); imageRecord.set("owner_user_id", ""); imageRecord.set("public", true);
    }
    // Meta fetches this JPEG without our integration token. Existing records
    // from older attempts may still be private, so make retries public too.
    imageRecord.set("public", true);
    imageRecord.set("file", $filesystem.fileFromBytes(jpeg, mediaJob.id + "-" + mediaIndex + ".jpg"));
    $app.save(imageRecord);
    var prepared = socialObject(mediaGrant.prepared);
    prepared[String(mediaIndex)] = imagePath;
    mediaGrant.prepared = prepared;
    mediaPayload.social_media_grant = mediaGrant;
    mediaJob.set("payload", mediaPayload); $app.save(mediaJob);
    var mediaJobId = mediaJob.getString("supabase_id") || mediaJob.id;
    var activeMediaGrants = [];
    try {
      activeMediaGrants = $app.findRecordsByFilter("social_media_grants", "job_id = {:job} && media_index = {:index} && expires_at > {:now}", "", 100, 0, {
        job: mediaJobId, index: mediaIndex + 1, now: new Date().toISOString()
      }) || [];
    } catch (_) {}
    activeMediaGrants.forEach(function (activeGrant) {
      activeGrant.set("prepared_path", imagePath);
      $app.save(activeGrant);
    });
    return json(e, {
      prepared: true,
      url: publicBaseUrl(e) + "/api/files/storage_files/" + encodeURIComponent(imageRecord.id) + "/" + encodeURIComponent(imageRecord.getString("file"))
    });
  }
  if (action === "report") return json(e, socialReport(setting, p));
  if (action === "session_check_result") return json(e, socialSessionCheckResult(p));
  if (action === "session") {
    var sessionPlatform = String(p.platform || "");
    if (["facebook", "instagram"].indexOf(sessionPlatform) < 0) fail("Onbekend platform.");
    var existing = one("social_publisher_sessions", "platform", sessionPlatform);
    var values = { platform: p.platform, status: p.status, last_checked_at: new Date().toISOString(), last_error: p.error || "", screenshot_path: p.screenshot_path || "", account_name: p.account_name || "", account_url: p.account_url || "", check_steps: socialArray(p.check_steps) };
    if (existing) { Object.keys(values).forEach(function (key) { existing.set(key, values[key]); }); $app.save(existing); return json(e, cleanRecord(existing)); }
    return json(e, cleanRecord(save("social_publisher_sessions", values)));
  }
  fail("Onbekende Social Publisher-actie: " + action);
}

function route9(e) {
  socialRequireToken(e);
  var path = String(e.request.url.query().get("path") || "");
  if (!path || path.indexOf("..") >= 0) fail("Ongeldig mediapad.");
  if (path.indexOf("generated-color:") === 0) {
    e.response.header().set("Cache-Control", "private, no-store");
    return e.blob(200, "image/png", socialColorPng(path.slice("generated-color:".length)));
  }
  var stored = storedFileForPath(path);
  if (!stored) throw new NotFoundError("Socialmedia-afbeelding niet gevonden.");
  var bytes = storedFileBytes(stored, 30 * 1024 * 1024);
  var name = stored.getString("file").toLowerCase();
  var mime = /\.png$/.test(name) ? "image/png" : /\.webp$/.test(name) ? "image/webp" : "image/jpeg";
  e.response.header().set("Cache-Control", "private, no-store");
  return e.blob(200, mime, bytes);
}

function route10(e) {
  var query = e.request.url.query();
  var path = "";
  var grantId = String(query.get("grant_id") || "");
  var grantToken = String(query.get("token") || "");
  if (grantId && grantToken) {
    var mediaAccess = byId("social_media_grants", grantId);
    var tokenHash = $security.sha256(grantToken);
    if (!mediaAccess || !mediaAccess.getString("token_hash") || !$security.equal(mediaAccess.getString("token_hash"), tokenHash) || !mediaAccess.getString("expires_at") || new Date(mediaAccess.getString("expires_at")).getTime() <= Date.now()) {
      throw new NotFoundError("Socialmedia-afbeelding niet gevonden.");
    }
    path = mediaAccess.getString("prepared_path") || mediaAccess.getString("path");
  } else {
    // Achterwaartse compatibiliteit voor reeds geclaimde taken van 1.16.7 en ouder.
    var jobId = String(query.get("job_id") || "");
    var job = byId("social_post_jobs", jobId);
    var index = Number(query.get("index"));
    var signedPath = String(query.get("path") || "");
    var signedExpires = Number(query.get("expires"));
    var suppliedSignature = String(query.get("signature") || "");
    if (jobId && signedPath && Number.isInteger(index) && index >= 0 && Number.isFinite(signedExpires) && signedExpires > Date.now() && suppliedSignature) {
      var expectedSignature = socialMediaSignature(socialSetting(), jobId, index, signedExpires, signedPath);
      if (!expectedSignature || !$security.equal(expectedSignature, suppliedSignature)) throw new NotFoundError("Socialmedia-afbeelding niet gevonden.");
      path = signedPath;
      if (job) {
        var signedGrant = socialObject(socialObject(job.get("payload")).social_media_grant);
        path = String(socialObject(signedGrant.prepared)[String(index)] || path);
      }
    } else {
      if (!job) throw new NotFoundError("Socialmedia-afbeelding niet gevonden.");
      var legacyGrant = socialObject(socialObject(job.get("payload")).social_media_grant);
      var legacyToken = String(query.get("token") || "");
      var paths = socialArray(legacyGrant.paths);
      if (!legacyToken || legacyToken !== String(legacyGrant.token || "") || !legacyGrant.expires_at || new Date(legacyGrant.expires_at).getTime() <= Date.now() || !Number.isInteger(index) || index < 0 || index >= paths.length) {
        throw new NotFoundError("Socialmedia-afbeelding niet gevonden.");
      }
      path = String(socialObject(legacyGrant.prepared)[String(index)] || paths[index] || "");
    }
  }
  if (!path || path.indexOf("..") >= 0) throw new NotFoundError("Socialmedia-afbeelding niet gevonden.");
  if (path.indexOf("generated-color:") === 0) {
    e.response.header().set("Cache-Control", "private, max-age=3600");
    return e.blob(200, "image/png", socialColorPng(path.slice("generated-color:".length)));
  }
  var stored = storedFileForPath(path);
  if (!stored) throw new NotFoundError("Socialmedia-afbeelding niet gevonden.");
  var name = stored.getString("file").toLowerCase();
  var mime = /\.png$/.test(name) ? "image/png" : /\.webp$/.test(name) ? "image/webp" : "image/jpeg";
  e.response.header().set("Cache-Control", "private, no-store");
  return e.blob(200, mime, storedFileBytes(stored, 30 * 1024 * 1024));
}

function socialCleanupJobs(nowMs) {
  var referenceTime = Number(nowMs);
  if (!Number.isFinite(referenceTime)) referenceTime = Date.now();
  var result = { deleted: 0, cancelled: 0, expired: 0, grants: 0 };
  var expiredGrants = [];
  try {
    expiredGrants = $app.findRecordsByFilter("social_media_grants", "expires_at <= {:now}", "", 5000, 0, { now: new Date(referenceTime).toISOString() }) || [];
  } catch (_) {}
  expiredGrants.forEach(function (grant) {
    try { $app.delete(grant); result.grants += 1; } catch (_) {}
  });
  var jobs = [];
  try { jobs = $app.findRecordsByFilter("social_post_jobs", "id != ''", "", 5000, 0) || []; } catch (_) { return result; }
  jobs.forEach(function (job) {
    var status = job.getString("status");
    if (status !== "cancelled" && ["completed", "dry_run_complete"].indexOf(status) < 0) return;
    var timestamp = job.getString("completed_at") || job.getString("updated") || job.getString("created");
    var timestampMs = timestamp ? new Date(timestamp).getTime() : NaN;
    if (!Number.isFinite(timestampMs)) return;
    var retentionMs = status === "cancelled" ? 5 * 60 * 1000 : 60 * 60 * 1000;
    if (referenceTime - timestampMs < retentionMs) return;
    try {
      $app.delete(job);
      // Prepared images are public only while the post is active and for its
      // short retention window. Never leave those copies behind with the job.
      for (var mediaIndex = 0; mediaIndex < 10; mediaIndex += 1) {
        var preparedFile = storedFileForPath("social-publisher/" + job.id + "/" + mediaIndex + ".jpg");
        if (preparedFile && preparedFile.getString("bucket") === "social-publisher") {
          try { $app.delete(preparedFile); } catch (mediaCleanupError) { console.error("Socialmedia-afbeelding opruimen mislukt:", mediaCleanupError); }
        }
      }
      result.deleted += 1;
      if (status === "cancelled") result.cancelled += 1;
      else result.expired += 1;
    } catch (_) {}
  });
  return result;
}


module.exports = { route0, route1, route2, route3, route4, route5, route6, route7, route8, route9, route10, socialColorPng, socialColorMedia, socialImagesForProduct, socialEnqueueExistingCatalog, socialClaim, socialReport, socialScheduleSpotlight, socialNextPublication, socialCleanupJobs };
