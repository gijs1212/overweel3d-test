import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const PB_URL = (process.env.POCKETBASE_URL || "https://api.gijsoverweel.nl").replace(/\/$/, "");
const TOKEN = process.env.POCKETBASE_ADMIN_TOKEN;
const BACKUP = process.env.SUPABASE_BACKUP_DIR || path.resolve("private-backups/supabase-askbgpdygdiwuocsmsfn-2026-09-13");

if (!TOKEN) throw new Error("POCKETBASE_ADMIN_TOKEN ontbreekt");

async function request(route, options = {}) {
  const response = await fetch(`${PB_URL}${route}`, {
    ...options,
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`${options.method || "GET"} ${route}: ${response.status} ${JSON.stringify(body)}`);
  return body;
}

const adminRule = '@request.auth.role = "admin"';
const publicRead = new Set(["app_settings", "blog_posts", "categories", "filament_colors", "materials", "portfolio_project_media", "portfolio_projects", "product_categories", "product_color_availability", "product_images", "product_options", "product_reviews", "product_variants", "products"]);
const ownerTables = new Set(["orders", "order_files", "order_events", "order_messages", "saved_carts", "loyalty_transactions", "gift_cards", "gift_card_redemptions", "discount_redemptions", "delivery_appointments", "profiles"]);
const guestCreate = new Set(["orders", "order_files", "order_messages", "newsletter_subscribers", "newsletter_subscriptions", "saved_carts", "product_reviews"]);

function rulesFor(name, hasUserId = false) {
  if (publicRead.has(name)) return { listRule: "", viewRule: "", createRule: adminRule, updateRule: adminRule, deleteRule: adminRule };
  if (ownerTables.has(name) && hasUserId) {
    const own = `(${adminRule}) || user_id = @request.auth.supabase_id`;
    return { listRule: own, viewRule: own, createRule: guestCreate.has(name) ? "" : own, updateRule: own, deleteRule: adminRule };
  }
  if (name.startsWith("newsletter_")) return { listRule: adminRule, viewRule: adminRule, createRule: "", updateRule: adminRule, deleteRule: adminRule };
  return { listRule: adminRule, viewRule: adminRule, createRule: adminRule, updateRule: adminRule, deleteRule: adminRule };
}

function fieldType(column) {
  const type = String(column.data_type || "").toLowerCase();
  const udt = String(column.udt_name || "").toLowerCase();
  if (type === "boolean") return "bool";
  if (["smallint", "integer", "bigint", "numeric", "decimal", "real", "double precision"].includes(type)) return "number";
  if (type.includes("timestamp") || type === "date") return "date";
  if (type === "json" || type === "jsonb" || type === "array" || udt.startsWith("_")) return "json";
  return "text";
}

function normalizeValue(value, field) {
  if (value == null) return field.type === "json" ? null : undefined;
  if (field.type === "date") return String(value).replace("T", " ");
  return value;
}

async function readJson(file) { return JSON.parse(await fs.readFile(file, "utf8")); }

function sourceId(table, row) {
  if (row.id) return String(row.id);
  for (const key of ["key", "code", "token", "version", "name"]) {
    if (row[key] != null && row[key] !== "") return `${table}:${row[key]}`;
  }
  return `${table}:${crypto.createHash("sha256").update(JSON.stringify(row)).digest("hex")}`;
}

async function ensureUsersFields() {
  const users = await request("/api/collections/users");
  const wanted = [
    { name: "supabase_id", type: "text" }, { name: "first_name", type: "text" },
    { name: "last_name", type: "text" }, { name: "phone", type: "text" },
    { name: "address", type: "text" }, { name: "postal_code", type: "text" },
    { name: "city", type: "text" }, { name: "country", type: "text" },
    { name: "newsletter_subscribed", type: "bool" }, { name: "role", type: "text" },
    { name: "legacy_data", type: "json" },
  ];
  const names = new Set(users.fields.map((field) => field.name));
  const fields = [...users.fields, ...wanted.filter((field) => !names.has(field.name))];
  await request("/api/collections/users", { method: "PATCH", body: JSON.stringify({ fields }) });
}

async function migrateUsers() {
  await ensureUsersFields();
  const auth = await readJson(path.join(BACKUP, "data", "auth__users.json"));
  const profiles = await readJson(path.join(BACKUP, "data", "public__profiles.json"));
  const roles = await readJson(path.join(BACKUP, "data", "public__user_roles.json"));
  const profileById = new Map(profiles.rows.map((row) => [row.id, row]));
  const roleById = new Map(roles.rows.map((row) => [row.user_id, row.role]));
  const existing = await request("/api/collections/users/records?perPage=500");
  const existingEmails = new Set(existing.items.map((record) => record.email.toLowerCase()));
  for (const user of auth.rows) {
    if (!user.email || existingEmails.has(user.email.toLowerCase())) continue;
    const profile = profileById.get(user.id) || {};
    const password = crypto.randomBytes(32).toString("base64url");
    await request("/api/collections/users/records", { method: "POST", body: JSON.stringify({
      email: user.email, password, passwordConfirm: password, verified: Boolean(user.email_confirmed_at),
      emailVisibility: false, supabase_id: user.id, first_name: profile.first_name || "",
      last_name: profile.last_name || "", phone: profile.phone || "", address: profile.address || "",
      postal_code: profile.postal_code || "", city: profile.city || "", country: profile.country || "",
      newsletter_subscribed: Boolean(profile.newsletter_subscribed), role: roleById.get(user.id) || "customer",
      legacy_data: { auth: user, profile },
    }) });
  }
}

function existingFields(collection) { return new Set((collection?.fields || []).map((field) => field.name)); }

async function migrateCollections() {
  const columns = await readJson(path.join(BACKUP, "catalog", "tables_columns.json"));
  const publicColumns = columns.filter((column) => column.table_schema === "public");
  const grouped = Map.groupBy(publicColumns, (column) => column.table_name);
  const all = await request("/api/collections?perPage=500");
  const collections = new Map(all.items.map((collection) => [collection.name, collection]));

  for (const [name, cols] of grouped) {
    if (name === "profiles" || name === "user_roles") continue;
    const fields = [
      { name: "supabase_id", type: "text", required: true },
      ...cols.filter((column) => column.column_name !== "id").map((column) => ({ name: column.column_name, type: fieldType(column), required: false })),
    ];
    const rules = rulesFor(name, cols.some((column) => column.column_name === "user_id"));
    let collection = collections.get(name);
    if (!collection) {
      collection = await request("/api/collections", { method: "POST", body: JSON.stringify({
        name, type: "base", fields, indexes: [`CREATE UNIQUE INDEX idx_${name}_supabase_id ON ${name} (supabase_id)`], ...rules,
      }) });
      collections.set(name, collection);
    } else {
      const names = existingFields(collection);
      const merged = [...collection.fields, ...fields.filter((field) => !names.has(field.name))];
      collection = await request(`/api/collections/${collection.id}`, { method: "PATCH", body: JSON.stringify({ fields: merged, ...rules }) });
    }

    const data = await readJson(path.join(BACKUP, "data", `public__${name}.json`));
    const existing = await request(`/api/collections/${name}/records?perPage=500&fields=id,supabase_id`);
    const imported = new Map(existing.items.map((record) => [record.supabase_id, record.id]));
    const fieldByName = new Map(fields.map((field) => [field.name, field]));
    for (const row of data.rows) {
      const legacyId = sourceId(name, row);
      const body = { supabase_id: legacyId };
      for (const [key, value] of Object.entries(row)) {
        if (key === "id" || !fieldByName.has(key)) continue;
        const normalized = normalizeValue(value, fieldByName.get(key));
        if (normalized !== undefined) body[key] = normalized;
      }
      const pocketBaseId = imported.get(legacyId);
      if (pocketBaseId) {
        await request(`/api/collections/${name}/records/${pocketBaseId}`, { method: "PATCH", body: JSON.stringify(body) });
      } else {
        const created = await request(`/api/collections/${name}/records`, { method: "POST", body: JSON.stringify(body) });
        imported.set(legacyId, created.id);
      }
    }
  }
}

async function secureOrderChildren() {
  const names = ["order_files", "order_events", "order_messages", "order_3mf_plate_mappings", "print_jobs", "print_runs"];
  const orderData = await readJson(path.join(BACKUP, "data", "public__orders.json"));
  const ownerByOrder = new Map(orderData.rows.map((row) => [row.id, row.user_id || ""]));
  const jobsData = await readJson(path.join(BACKUP, "data", "public__print_jobs.json"));
  const orderByJob = new Map(jobsData.rows.map((row) => [row.id, row.order_id]));
  for (const name of names) {
    const collection = await request(`/api/collections/${name}`);
    if (!collection.fields.some((field) => field.name === "owner_user_id")) {
      collection.fields.push({ name: "owner_user_id", type: "text" });
    }
    const own = `(@request.auth.role = "admin") || owner_user_id = @request.auth.supabase_id`;
    await request(`/api/collections/${collection.id}`, { method: "PATCH", body: JSON.stringify({
      fields: collection.fields, listRule: own, viewRule: own,
      createRule: name === "order_messages" || name === "order_files" ? own : adminRule,
      updateRule: own, deleteRule: adminRule,
    }) });
    const records = await request(`/api/collections/${name}/records?perPage=500`);
    for (const record of records.items) {
      const orderId = record.order_id || orderByJob.get(record.print_job_id);
      const owner = ownerByOrder.get(orderId) || "";
      if (record.owner_user_id !== owner) await request(`/api/collections/${name}/records/${record.id}`, { method: "PATCH", body: JSON.stringify({ owner_user_id: owner }) });
    }
  }
}

async function ensureStorageCollection() {
  const all = await request("/api/collections?perPage=500");
  const existing = all.items.find((collection) => collection.name === "storage_files");
  if (existing) {
    existing.fields = existing.fields.map((field) => field.name === "file" ? { ...field, protected: true, maxSize: 262144000 } : field);
    await request(`/api/collections/${existing.id}`, { method: "PATCH", body: JSON.stringify({ fields: existing.fields }) });
    return;
  }
  await request("/api/collections", { method: "POST", body: JSON.stringify({
    name: "storage_files", type: "base",
    fields: [
      { name: "bucket", type: "text", required: true },
      { name: "path", type: "text", required: true },
      { name: "file", type: "file", required: true, maxSelect: 1, maxSize: 262144000, protected: true },
      { name: "owner_user_id", type: "text" },
      { name: "public", type: "bool" },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_storage_bucket_path ON storage_files (bucket, path)"],
    listRule: `public = true || (${adminRule}) || owner_user_id = @request.auth.supabase_id`,
    viewRule: `public = true || (${adminRule}) || owner_user_id = @request.auth.supabase_id`,
    createRule: "", updateRule: `(${adminRule}) || owner_user_id = @request.auth.supabase_id`, deleteRule: `(${adminRule}) || owner_user_id = @request.auth.supabase_id`,
  }) });
}

async function ensurePrinterBridgeFields() {
  const collection = await request("/api/collections/printers");
  const wanted = [
    { name: "bambu_login_request_id", type: "number" },
    { name: "bambu_login_completed_request_id", type: "number" },
    { name: "bambu_login_requested_at", type: "date" },
    { name: "bambu_login_code_sent_at", type: "date" },
    { name: "bambu_login_last_error", type: "text" },
  ];
  const names = existingFields(collection);
  const fields = [...collection.fields, ...wanted.filter((field) => !names.has(field.name))];
  await request(`/api/collections/${collection.id}`, { method: "PATCH", body: JSON.stringify({ fields }) });
}

async function ensureIntegrationCollections() {
  const all = await request("/api/collections?perPage=500");
  const byName = new Map(all.items.map((collection) => [collection.name, collection]));
  const definitions = [
    {
      name: "onedrive_tokens",
      fields: [
        { name: "supabase_id", type: "text", required: true },
        { name: "access_token", type: "text", required: true },
        { name: "refresh_token", type: "text" },
        { name: "expires_at", type: "date" },
      ],
    },
    {
      name: "exported_orders",
      fields: [
        { name: "supabase_id", type: "text", required: true },
        { name: "order_id", type: "text", required: true },
        { name: "order_number", type: "text", required: true },
        { name: "download_url", type: "text" },
        { name: "completed_at", type: "date" },
      ],
    },
  ];
  for (const definition of definitions) {
    const existing = byName.get(definition.name);
    if (!existing) {
      await request("/api/collections", { method: "POST", body: JSON.stringify({
        name: definition.name,
        type: "base",
        fields: definition.fields,
        indexes: [`CREATE UNIQUE INDEX idx_${definition.name}_supabase_id ON ${definition.name} (supabase_id)`],
        listRule: adminRule,
        viewRule: adminRule,
        createRule: adminRule,
        updateRule: adminRule,
        deleteRule: adminRule,
      }) });
      continue;
    }
    const names = existingFields(existing);
    const fields = [...existing.fields, ...definition.fields.filter((field) => !names.has(field.name))];
    await request(`/api/collections/${existing.id}`, { method: "PATCH", body: JSON.stringify({
      fields,
      listRule: adminRule,
      viewRule: adminRule,
      createRule: adminRule,
      updateRule: adminRule,
      deleteRule: adminRule,
    }) });
  }
}

await migrateUsers();
await migrateCollections();
await secureOrderChildren();
await ensureStorageCollection();
await ensurePrinterBridgeFields();
await ensureIntegrationCollections();
const result = await request("/api/collections?perPage=500");
console.log(JSON.stringify({ ok: true, collections: result.totalItems }, null, 2));
