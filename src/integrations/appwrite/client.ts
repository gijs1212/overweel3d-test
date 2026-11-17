import { createClientId } from "@/lib/clientId";

export const APPWRITE_ENDPOINT = (import.meta.env.VITE_APPWRITE_ENDPOINT || "https://appwrite.gijsoverweel.nl/v1").replace(/\/$/, "");
export const APPWRITE_PROJECT_ID = import.meta.env.VITE_APPWRITE_PROJECT_ID || "6af9acde00152998cadb";
export const APPWRITE_DATABASE_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID || "overweel3d-v2";
export const APPWRITE_PUBLIC_BUCKET_ID = import.meta.env.VITE_APPWRITE_PUBLIC_BUCKET_ID || "public-media-v2";
export const APPWRITE_PRIVATE_BUCKET_ID = import.meta.env.VITE_APPWRITE_PRIVATE_BUCKET_ID || "private-files-v2";
export const APPWRITE_FUNCTION_ID = import.meta.env.VITE_APPWRITE_FUNCTION_ID || "overweel3d-api";
export const UPLOAD_PROGRESS_EVENT = "overweel3d-upload-progress";

type Result<T = unknown> = { data: T | null; error: Error | null; count?: number | null };
type Filter = { op: "eq" | "neq" | "gte" | "like" | "in" | "is"; field: string; value: unknown };
type Order = { field: string; ascending: boolean };
type AppwriteRow = { $id: string; $permissions?: string[]; legacy_id: string; payload: string | Record<string, unknown> };

const relationTables: Record<string, string[]> = {
  products: ["product_categories", "product_images", "product_options", "product_variants"],
  orders: ["order_files", "order_events", "order_messages", "print_jobs"],
  print_jobs: ["print_runs"],
  portfolio_projects: ["portfolio_project_media"],
};

const publicTables = new Set([
  "app_settings", "blog_posts", "categories", "filament_colors", "materials",
  "portfolio_project_media", "portfolio_projects", "product_categories",
  "product_color_availability", "product_images", "product_options", "product_reviews",
  "product_variants", "products",
]);

const storageUrlCache = new Map<string, string>();
const authListeners = new Set<(event: string, session: any) => void>();
const APPWRITE_FALLBACK_COOKIE_KEY = "cookieFallback";
let currentAccount: any | null = null;
let accountRequest: Promise<any | null> | null = null;
let accountRequestGeneration = 0;

function emitUploadProgress(detail: { id: string; name: string; path: string; percent: number; status: "uploading" | "completed" | "failed"; error?: string }) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(UPLOAD_PROGRESS_EVENT, { detail }));
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

async function appwriteFetch(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("X-Appwrite-Project", APPWRITE_PROJECT_ID);
  headers.set("X-Appwrite-Response-Format", "2.4.0");
  try {
    const fallbackCookie = window.localStorage.getItem(APPWRITE_FALLBACK_COOKIE_KEY);
    if (fallbackCookie) headers.set("X-Fallback-Cookies", fallbackCookie);
  } catch { /* Cookies remain the primary session mechanism. */ }
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(`${APPWRITE_ENDPOINT}${path}`, { ...init, headers, credentials: "include" });
  const fallbackCookie = response.headers.get("X-Fallback-Cookies");
  if (fallbackCookie !== null) {
    try {
      if (fallbackCookie) window.localStorage.setItem(APPWRITE_FALLBACK_COOKIE_KEY, fallbackCookie);
      else window.localStorage.removeItem(APPWRITE_FALLBACK_COOKIE_KEY);
    } catch { /* Storage can be disabled; first-party cookies may still work. */ }
  }
  const text = await response.text();
  let payload: any = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
  if (!response.ok) throw new Error(payload?.message || payload?.error || `Appwrite-verzoek mislukt (${response.status})`);
  return payload?.data ?? payload;
}

function query(method: string, values: unknown[]) {
  return JSON.stringify({ method, values });
}

async function listRows(table: string): Promise<AppwriteRow[]> {
  const rows: AppwriteRow[] = [];
  let offset = 0;
  for (;;) {
    const params = new URLSearchParams();
    params.append("queries[]", query("limit", [100]));
    params.append("queries[]", query("offset", [offset]));
    const page = await appwriteFetch(`/tablesdb/${APPWRITE_DATABASE_ID}/tables/${table}/rows?${params}`);
    const batch = (page?.rows || []) as AppwriteRow[];
    rows.push(...batch);
    if (batch.length < 100) return rows;
    offset += batch.length;
  }
}

function parsePayload(row: AppwriteRow): Record<string, any> {
  const payload = typeof row.payload === "string" ? JSON.parse(row.payload || "{}") : row.payload || {};
  const value = { ...(payload as Record<string, any>) };
  value.id ||= row.legacy_id;
  value._appwrite_row_id = row.$id;
  value._appwrite_permissions = row.$permissions || [];
  if (value._appwrite_bucket_id && value._appwrite_file_id && value.bucket && value.path) {
    storageUrlCache.set(`${value.bucket}:${value.path}`, fileViewUrl(value._appwrite_bucket_id, value._appwrite_file_id));
  }
  return value;
}

async function allRecords(table: string) {
  return (await listRows(table)).map(parsePayload);
}

function accountUser(account: any | null) {
  if (!account) return null;
  const prefs = account.prefs || {};
  const role = account.labels?.includes("admin") ? "admin" : prefs.role || "customer";
  const id = prefs.legacy_user_id || account.$id;
  return {
    id,
    email: account.email,
    user_metadata: { full_name: account.name || "" },
    app_metadata: { role },
    identities: [{ id: account.$id }],
    created_at: account.$createdAt,
  } as any;
}

function sessionShape(account = currentAccount) {
  const user = accountUser(account);
  return user ? { access_token: "appwrite-cookie-session", token_type: "bearer", user } as any : null;
}

async function refreshAccount(force = false) {
  if (accountRequest && !force) return accountRequest;
  const generation = ++accountRequestGeneration;
  const request = appwriteFetch("/account")
    .then((account) => {
      // An anonymous account check can still be in flight when the user logs
      // in. Never let that older response erase the newly authenticated user.
      if (generation === accountRequestGeneration) currentAccount = account;
      return account;
    })
    .catch(() => {
      if (generation === accountRequestGeneration) currentAccount = null;
      return null;
    })
    .finally(() => {
      if (accountRequest === request) accountRequest = null;
    });
  accountRequest = request;
  return request;
}

function notifyAuth(event: string) {
  const session = sessionShape();
  for (const listener of authListeners) listener(event, session);
}

function compare(row: Record<string, any>, filter: Filter) {
  const value = row[filter.field];
  if (filter.op === "eq") return value === filter.value;
  if (filter.op === "neq") return value !== filter.value;
  if (filter.op === "gte") return value >= filter.value!;
  if (filter.op === "is") return filter.value === null ? value == null : value === filter.value;
  if (filter.op === "in") return (filter.value as unknown[]).includes(value);
  if (filter.op === "like") return new RegExp(`^${String(filter.value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*")}$`, "i").test(String(value ?? ""));
  return true;
}

function cleanPayload(row: Record<string, any>) {
  const result = { ...row };
  for (const key of Object.keys(result)) if (key.startsWith("_appwrite_")) delete result[key];
  delete result.created;
  delete result.updated;
  result.id ||= result.supabase_id || createClientId();
  result.supabase_id ||= result.id;
  if (result.status === undefined && result.id && "customer_email" in result) result.status = "submitted";
  return result;
}

function rowPermissions(record: Record<string, any>) {
  const permissions = ['read("label:admin")', 'update("label:admin")', 'delete("label:admin")'];
  if (publicTables.has(String(record.__table || ""))) permissions.push('read("any")');
  if (currentAccount?.$id) permissions.push(`read("user:${currentAccount.$id}")`, `update("user:${currentAccount.$id}")`, `delete("user:${currentAccount.$id}")`);
  return permissions;
}

async function createRow(table: string, input: Record<string, any>) {
  const payload = cleanPayload(input);
  const body = {
    rowId: createClientId(),
    data: { legacy_id: String(payload.id), payload: JSON.stringify(payload) },
    permissions: rowPermissions({ ...payload, __table: table }),
  };
  return parsePayload(await appwriteFetch(`/tablesdb/${APPWRITE_DATABASE_ID}/tables/${table}/rows`, { method: "POST", body: JSON.stringify(body) }));
}

async function updateRow(table: string, row: Record<string, any>, changes: Record<string, any>) {
  const payload = cleanPayload({ ...row, ...changes });
  return parsePayload(await appwriteFetch(`/tablesdb/${APPWRITE_DATABASE_ID}/tables/${table}/rows/${row._appwrite_row_id}`, {
    method: "PATCH",
    body: JSON.stringify({ data: { legacy_id: String(payload.id), payload: JSON.stringify(payload) }, permissions: row._appwrite_permissions || rowPermissions({ ...payload, __table: table }) }),
  }));
}

class AppwriteQuery implements PromiseLike<Result<any>> {
  private action: "select" | "insert" | "update" | "delete" | "upsert" = "select";
  private payload: any;
  private filters: Filter[] = [];
  private orders: Order[] = [];
  private selected = "*";
  private singleMode: "none" | "single" | "maybe" = "none";
  private first = 0;
  private last: number | null = null;
  private max: number | null = null;
  private countRequested = false;
  private head = false;
  constructor(private table: string) {}
  select(columns = "*", options?: { count?: string; head?: boolean }) { this.selected = columns; this.countRequested = Boolean(options?.count); this.head = Boolean(options?.head); return this; }
  insert(payload: any) { this.action = "insert"; this.payload = payload; return this; }
  update(payload: any) { this.action = "update"; this.payload = payload; return this; }
  delete() { this.action = "delete"; return this; }
  upsert(payload: any, _options?: any) { this.action = "upsert"; this.payload = payload; return this; }
  eq(field: string, value: unknown) { this.filters.push({ op: "eq", field, value }); return this; }
  neq(field: string, value: unknown) { this.filters.push({ op: "neq", field, value }); return this; }
  gte(field: string, value: unknown) { this.filters.push({ op: "gte", field, value }); return this; }
  is(field: string, value: unknown) { this.filters.push({ op: "is", field, value }); return this; }
  in(field: string, value: unknown[]) { this.filters.push({ op: "in", field, value }); return this; }
  not(field: string, _operator: string, value: unknown) { this.filters.push({ op: "neq", field, value }); return this; }
  like(field: string, value: string) { this.filters.push({ op: "like", field, value }); return this; }
  order(field: string, options?: { ascending?: boolean }) { this.orders.push({ field, ascending: options?.ascending !== false }); return this; }
  range(first: number, last: number) { this.first = first; this.last = last; return this; }
  limit(value: number) { this.max = value; return this; }
  single() { this.singleMode = "single"; return this; }
  maybeSingle() { this.singleMode = "maybe"; return this; }
  private async matching() { return (await allRecords(this.table)).filter((row) => this.filters.every((filter) => compare(row, filter))); }
  private async relations(rows: Record<string, any>[]) {
    const requested = relationTables[this.table]?.filter((name) => this.selected.includes(name)) || [];
    for (const relation of requested) {
      const related = await allRecords(relation);
      for (const row of rows) {
        if (this.table === "products" && relation === "product_categories") {
          row[relation] = related.find((candidate) => candidate.id === row.category_id) || null;
        } else {
          row[relation] = related.filter((candidate) => candidate[`${this.table.slice(0, -1)}_id`] === row.id || candidate.product_id === row.id || candidate.order_id === row.id || candidate.project_id === row.id || candidate.print_job_id === row.id);
        }
      }
    }
    return rows;
  }
  async execute(): Promise<Result<any>> {
    try {
      if (this.action === "select") {
        let rows = await this.matching();
        for (const order of this.orders.slice().reverse()) rows.sort((a, b) => (a[order.field] > b[order.field] ? 1 : a[order.field] < b[order.field] ? -1 : 0) * (order.ascending ? 1 : -1));
        const count = rows.length;
        if (this.last != null) rows = rows.slice(this.first, this.last + 1); else if (this.first) rows = rows.slice(this.first);
        if (this.max != null) rows = rows.slice(0, this.max);
        rows = await this.relations(rows);
        if (this.head) return { data: null, error: null, count };
        if (this.singleMode !== "none") {
          if (!rows.length && this.singleMode === "single") return { data: null, error: new Error("Geen record gevonden"), count };
          if (rows.length > 1) return { data: null, error: new Error("Meerdere records gevonden"), count };
          return { data: rows[0] || null, error: null, count };
        }
        return { data: rows, error: null, count: this.countRequested ? count : null };
      }
      const input = Array.isArray(this.payload) ? this.payload : [this.payload];
      if (this.action === "insert") {
        const created = [];
        for (const row of input) created.push(await createRow(this.table, row));
        return { data: Array.isArray(this.payload) ? created : created[0], error: null };
      }
      const rows = await this.matching();
      if (this.action === "delete") {
        for (const row of rows) await appwriteFetch(`/tablesdb/${APPWRITE_DATABASE_ID}/tables/${this.table}/rows/${row._appwrite_row_id}`, { method: "DELETE" });
        return { data: rows, error: null };
      }
      if (this.action === "update") {
        const updated = [];
        for (const row of rows) updated.push(await updateRow(this.table, row, this.payload));
        return { data: updated, error: null };
      }
      const upserted = [];
      for (const row of input) {
        const id = row.id || row.supabase_id;
        const found = (await allRecords(this.table)).find((item) => item.id === id);
        upserted.push(found ? await updateRow(this.table, found, row) : await createRow(this.table, row));
      }
      return { data: Array.isArray(this.payload) ? upserted : upserted[0], error: null };
    } catch (error) { return { data: null, error: asError(error), count: null }; }
  }
  then<TResult1 = Result<any>, TResult2 = never>(onfulfilled?: ((value: Result<any>) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null) { return this.execute().then(onfulfilled, onrejected); }
}

export async function executeBackend(kind: "rpc" | "function", name: string, body: any) {
  const execution = await appwriteFetch(`/functions/${APPWRITE_FUNCTION_ID}/executions`, {
    method: "POST",
    body: JSON.stringify({ body: JSON.stringify({ kind, name, body: body || {} }), async: false, path: "/", method: "POST", headers: JSON.stringify({ "content-type": "application/json" }) }),
  });
  const payload = execution?.responseBody ? JSON.parse(execution.responseBody) : null;
  const statusCode = Number(execution?.responseStatusCode ?? execution?.statusCode ?? 500);
  if (execution?.status === "failed" || statusCode >= 400) throw new Error(payload?.error || payload?.message || `Serverfunctie ${name} mislukt`);
  return payload && typeof payload === "object" && "data" in payload ? payload.data : payload;
}

function fileViewUrl(bucketId: string, fileId: string) {
  return `${APPWRITE_ENDPOINT}/storage/buckets/${bucketId}/files/${fileId}/view?project=${encodeURIComponent(APPWRITE_PROJECT_ID)}`;
}

function sha256Hex(value: string) {
  const initial = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const constants = [
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
  ];
  const bytes = Array.from(new TextEncoder().encode(value));
  const bitLength = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  const high = Math.floor(bitLength / 0x100000000);
  const low = bitLength >>> 0;
  for (let shift = 24; shift >= 0; shift -= 8) bytes.push((high >>> shift) & 0xff);
  for (let shift = 24; shift >= 0; shift -= 8) bytes.push((low >>> shift) & 0xff);
  const hash = initial.slice();
  const rotate = (word: number, bits: number) => (word >>> bits) | (word << (32 - bits));
  for (let offset = 0; offset < bytes.length; offset += 64) {
    const words = new Array<number>(64);
    for (let index = 0; index < 16; index += 1) {
      const position = offset + index * 4;
      words[index] = ((bytes[position] << 24) | (bytes[position + 1] << 16) | (bytes[position + 2] << 8) | bytes[position + 3]) >>> 0;
    }
    for (let index = 16; index < 64; index += 1) {
      const s0 = rotate(words[index - 15], 7) ^ rotate(words[index - 15], 18) ^ (words[index - 15] >>> 3);
      const s1 = rotate(words[index - 2], 17) ^ rotate(words[index - 2], 19) ^ (words[index - 2] >>> 10);
      words[index] = (words[index - 16] + s0 + words[index - 7] + s1) >>> 0;
    }
    let [a,b,c,d,e,f,g,h] = hash;
    for (let index = 0; index < 64; index += 1) {
      const sigma1 = rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temp1 = (h + sigma1 + choice + constants[index] + words[index]) >>> 0;
      const sigma0 = rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (sigma0 + majority) >>> 0;
      h = g; g = f; f = e; e = (d + temp1) >>> 0; d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    [a,b,c,d,e,f,g,h].forEach((word, index) => { hash[index] = (hash[index] + word) >>> 0; });
  }
  return hash.map((word) => word.toString(16).padStart(8, "0")).join("");
}

export function stableMigratedFileId(bucket: string, path: string) {
  return `file_${sha256Hex(`${bucket}:${path}`)}`.slice(0, 36);
}

function publicPath(path: string) {
  return /^(products|portfolio|colors|reviews|social)\//.test(path);
}

async function findStoredFile(bucket: string, path: string) {
  return (await allRecords("storage_files")).find((record) => record.bucket === bucket && record.path === path) || null;
}

function uploadBinary(bucketId: string, fileId: string, file: File, permissions: string[], progress: (percent: number) => void) {
  return new Promise<any>((resolve, reject) => {
    const form = new FormData();
    form.set("fileId", fileId);
    for (const permission of permissions) form.append("permissions[]", permission);
    form.set("file", file, file.name);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${APPWRITE_ENDPOINT}/storage/buckets/${bucketId}/files`);
    xhr.withCredentials = true;
    xhr.timeout = 30 * 60_000;
    xhr.setRequestHeader("X-Appwrite-Project", APPWRITE_PROJECT_ID);
    xhr.setRequestHeader("X-Appwrite-Response-Format", "2.4.0");
    try {
      const fallbackCookie = window.localStorage.getItem(APPWRITE_FALLBACK_COOKIE_KEY);
      if (fallbackCookie) xhr.setRequestHeader("X-Fallback-Cookies", fallbackCookie);
    } catch { /* First-party cookies may still authenticate the upload. */ }
    xhr.upload.onprogress = (event) => event.lengthComputable && progress(Math.min(99, Math.round(event.loaded / event.total * 100)));
    xhr.onerror = () => reject(new Error("Netwerkfout tijdens uploaden."));
    xhr.onabort = () => reject(new Error("Upload geannuleerd."));
    xhr.ontimeout = () => reject(new Error("Upload duurde langer dan 30 minuten."));
    xhr.onload = () => {
      const fallbackCookie = xhr.getResponseHeader("X-Fallback-Cookies");
      if (fallbackCookie !== null) {
        try {
          if (fallbackCookie) window.localStorage.setItem(APPWRITE_FALLBACK_COOKIE_KEY, fallbackCookie);
          else window.localStorage.removeItem(APPWRITE_FALLBACK_COOKIE_KEY);
        } catch {}
      }
      let payload: any = null;
      try { payload = xhr.responseText ? JSON.parse(xhr.responseText) : null; } catch { /* handled below */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(payload);
      else reject(new Error(payload?.message || `Upload mislukt (${xhr.status})`));
    };
    xhr.send(form);
  });
}

async function verifyUploadedBinary(bucketId: string, fileId: string, expectedSize: number) {
  const metadata = await appwriteFetch(`/storage/buckets/${bucketId}/files/${fileId}`);
  const actualSize = Number(metadata?.sizeOriginal ?? metadata?.size ?? -1);
  if (actualSize !== expectedSize) throw new Error(`Uploadcontrole mislukt: ${actualSize} van ${expectedSize} bytes opgeslagen.`);
  const headers = new Headers({ Range: "bytes=0-0", "X-Appwrite-Project": APPWRITE_PROJECT_ID });
  try {
    const fallbackCookie = window.localStorage.getItem(APPWRITE_FALLBACK_COOKIE_KEY);
    if (fallbackCookie) headers.set("X-Fallback-Cookies", fallbackCookie);
  } catch {}
  const response = await fetch(fileViewUrl(bucketId, fileId), {
    credentials: "include",
    headers,
  });
  if (!response.ok) throw new Error(`Uploadcontrole kon het bestand niet teruglezen (${response.status}).`);
  if (expectedSize > 0 && (await response.arrayBuffer()).byteLength < 1) throw new Error("Uploadcontrole ontving geen bestandsdata.");
  return metadata;
}

export const supabase = {
  from: (table: string) => new AppwriteQuery(table),
  auth: {
    getSession: async () => ({ data: { session: sessionShape(await refreshAccount()) }, error: null }),
    getUser: async () => ({ data: { user: accountUser(await refreshAccount()) }, error: null }),
    signInWithPassword: async ({ email, password }: any) => {
      try {
        await appwriteFetch("/account/sessions/email", { method: "POST", body: JSON.stringify({ email, password }) });
        const account = await refreshAccount(true);
        if (!account) throw new Error("De sessie is aangemaakt, maar uw account kon niet worden geladen. Probeer opnieuw in te loggen.");
        notifyAuth("SIGNED_IN");
        return { data: { user: accountUser(account), session: sessionShape(account) }, error: null };
      } catch (error) { return { data: { user: null, session: null }, error: asError(error) }; }
    },
    signUp: async ({ email, password, options }: any) => {
      try {
        const account = await appwriteFetch("/account", { method: "POST", body: JSON.stringify({ userId: createClientId(), email, password, name: options?.data?.full_name || email }) });
        await appwriteFetch("/account/sessions/email", { method: "POST", body: JSON.stringify({ email, password }) });
        await refreshAccount(true);
        notifyAuth("SIGNED_IN");
        return { data: { user: { ...accountUser(currentAccount || account), identities: [{ id: account.$id }] }, session: sessionShape() }, error: null };
      } catch (error) { return { data: { user: null, session: null }, error: asError(error) }; }
    },
    signOut: async () => { try { await appwriteFetch("/account/sessions/current", { method: "DELETE" }); } catch { /* already signed out */ } try { window.localStorage.removeItem(APPWRITE_FALLBACK_COOKIE_KEY); } catch {} currentAccount = null; notifyAuth("SIGNED_OUT"); return { error: null }; },
    resetPasswordForEmail: async (email: string, options?: any) => { try { await appwriteFetch("/account/recovery", { method: "POST", body: JSON.stringify({ email, url: options?.redirectTo || `${window.location.origin}/reset-password` }) }); return { error: null }; } catch (error) { return { error: asError(error) }; } },
    updateUser: async ({ password }: any) => { try { const account = await appwriteFetch("/account/password", { method: "PATCH", body: JSON.stringify({ password }) }); currentAccount = account; return { data: { user: accountUser(account) }, error: null }; } catch (error) { return { data: { user: null }, error: asError(error) }; } },
    onAuthStateChange: (callback: any) => { authListeners.add(callback); return { data: { subscription: { unsubscribe: () => authListeners.delete(callback) } } }; },
  },
  rpc: async (name: string, body: any = {}) => { try { const data = await executeBackend("rpc", name, body); return { data, error: null }; } catch (error) { return { data: null, error: asError(error) }; } },
  functions: { invoke: async (name: string, { body }: any = {}) => { try { return { data: await executeBackend("function", name, body), error: null }; } catch (error) { return { data: null, error: asError(error) }; } } },
  channel: (_name: string) => ({ on(..._args: any[]) { return this; }, subscribe(..._args: any[]) { return this; }, unsubscribe(..._args: any[]) { return Promise.resolve("ok"); } }),
  removeChannel: async (..._args: any[]) => "ok",
  storage: { from: (bucket: string) => ({
    upload: async (path: string, file: File, options?: any) => {
      const uploadId = `${path}:${Date.now()}:${Math.random()}`;
      try {
        const existing = await findStoredFile(bucket, path);
        if (existing && !options?.upsert) throw new Error("Er bestaat al een bestand op dit pad.");
        if (existing?._appwrite_file_id) await appwriteFetch(`/storage/buckets/${existing._appwrite_bucket_id}/files/${existing._appwrite_file_id}`, { method: "DELETE" });
        const isPublic = publicPath(path);
        const bucketId = isPublic ? APPWRITE_PUBLIC_BUCKET_ID : APPWRITE_PRIVATE_BUCKET_ID;
          // Keep the Appwrite file id deterministic. getPublicUrl is synchronous,
          // so it must be able to rebuild the URL after a page refresh without
          // first querying the storage_files table.
          const fileId = stableMigratedFileId(bucket, path);
        const permissions = ['read("label:admin")', 'update("label:admin")', 'delete("label:admin")'];
        if (isPublic) permissions.push('read("any")');
        if (currentAccount?.$id) permissions.push(`read("user:${currentAccount.$id}")`);
        emitUploadProgress({ id: uploadId, name: file.name, path, percent: 0, status: "uploading" });
        let stored: any;
        try {
          stored = await uploadBinary(bucketId, fileId, file, permissions, (percent) => emitUploadProgress({ id: uploadId, name: file.name, path, percent, status: "uploading" }));
        } catch (uploadError) {
          // A mobile browser can lose the final XHR response after Appwrite has
          // already persisted the deterministic file. Recover that successful
          // upload instead of forcing the user to upload hundreds of MB again.
          try { stored = await verifyUploadedBinary(bucketId, fileId, file.size); }
          catch { throw uploadError; }
        }
        emitUploadProgress({ id: uploadId, name: file.name, path, percent: 99, status: "uploading" });
        await verifyUploadedBinary(bucketId, fileId, file.size);
        const logicalId = existing?.id || existing?.supabase_id || createClientId();
        const recordPayload = {
          id: logicalId, supabase_id: logicalId, bucket, path,
          file: stored?.name || file.name, size: file.size, content_type: file.type || "application/octet-stream",
          public: isPublic, owner_user_id: accountUser(currentAccount)?.id || null,
          created_at: existing?.created_at || new Date().toISOString(), updated_at: new Date().toISOString(),
          _appwrite_bucket_id: bucketId, _appwrite_file_id: fileId,
        };
        const savedRecord = existing ? await updateRow("storage_files", existing, recordPayload) : await createRow("storage_files", recordPayload);
        if (!savedRecord?._appwrite_file_id || savedRecord._appwrite_file_id !== fileId) throw new Error("Upload is opgeslagen, maar de bestandsregistratie kon niet worden bevestigd.");
        storageUrlCache.set(`${bucket}:${path}`, fileViewUrl(bucketId, fileId));
        emitUploadProgress({ id: uploadId, name: file.name, path, percent: 100, status: "completed" });
        return { data: { path, id: recordPayload.id }, error: null };
      } catch (error) {
        const value = asError(error); emitUploadProgress({ id: uploadId, name: file.name, path, percent: 0, status: "failed", error: value.message });
        return { data: null, error: value };
      }
    },
    remove: async (paths: string[]) => { try { for (const path of paths) { const record = await findStoredFile(bucket, path); if (!record) continue; await appwriteFetch(`/storage/buckets/${record._appwrite_bucket_id}/files/${record._appwrite_file_id}`, { method: "DELETE" }); await appwriteFetch(`/tablesdb/${APPWRITE_DATABASE_ID}/tables/storage_files/rows/${record._appwrite_row_id}`, { method: "DELETE" }); storageUrlCache.delete(`${bucket}:${path}`); } return { data: {}, error: null }; } catch (error) { return { data: null, error: asError(error) }; } },
    download: async (path: string) => { try { const record = await findStoredFile(bucket, path); if (!record) throw new Error("Bestand niet gevonden"); const response = await fetch(fileViewUrl(record._appwrite_bucket_id, record._appwrite_file_id), { credentials: "include" }); if (!response.ok) throw new Error(`Download mislukt (${response.status})`); return { data: await response.blob(), error: null }; } catch (error) { return { data: null, error: asError(error) }; } },
    createSignedUrl: async (path: string, _expires?: number) => { try { const record = await findStoredFile(bucket, path); if (!record) throw new Error("Bestand niet gevonden"); const signedUrl = fileViewUrl(record._appwrite_bucket_id, record._appwrite_file_id); storageUrlCache.set(`${bucket}:${path}`, signedUrl); return { data: { signedUrl }, error: null }; } catch (error) { return { data: null, error: asError(error) }; } },
    createSignedUrls: async (paths: string[], expires?: number) => { const data = await Promise.all(paths.map(async (path) => { const result = await (supabase.storage.from(bucket) as any).createSignedUrl(path, expires); return { path, signedUrl: result.data?.signedUrl || "", error: result.error }; })); return { data, error: null }; },
    getPublicUrl: (path: string) => ({ data: { publicUrl: storageUrlCache.get(`${bucket}:${path}`) || (publicPath(path) ? fileViewUrl(APPWRITE_PUBLIC_BUCKET_ID, stableMigratedFileId(bucket, path)) : "") } }),
  }) },
};


