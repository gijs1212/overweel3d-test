import PocketBase, { ClientResponseError, type RecordModel } from "pocketbase";
import { createClientId } from "@/lib/clientId";

export const POCKETBASE_URL = "https://api.gijsoverweel.nl";
export const pocketbase = new PocketBase(POCKETBASE_URL);
pocketbase.autoCancellation(false);
const storageUrlCache = new Map<string, string>();

export const UPLOAD_PROGRESS_EVENT = "overweel3d-upload-progress";

function emitUploadProgress(detail: { id: string; name: string; path: string; percent: number; status: "uploading" | "completed" | "failed"; error?: string }) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(UPLOAD_PROGRESS_EVENT, { detail }));
}

function uploadStorageRecord(existingId: string | null, form: FormData, file: File, path: string): Promise<RecordModel> {
  const id = `${path}:${Date.now()}:${Math.random()}`;
  emitUploadProgress({ id, name: file.name, path, percent: 0, status: "uploading" });
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(existingId ? "PATCH" : "POST", `${POCKETBASE_URL}/api/collections/storage_files/records${existingId ? `/${existingId}` : ""}`);
    xhr.timeout = 180_000;
    if (pocketbase.authStore.token) xhr.setRequestHeader("Authorization", pocketbase.authStore.token);
    xhr.responseType = "json";
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      emitUploadProgress({ id, name: file.name, path, percent: Math.min(99, Math.round(event.loaded / event.total * 100)), status: "uploading" });
    };
    xhr.onerror = () => {
      const error = "Netwerkfout tijdens uploaden.";
      emitUploadProgress({ id, name: file.name, path, percent: 0, status: "failed", error });
      reject(new Error(error));
    };
    xhr.onabort = () => {
      const error = "Upload geannuleerd.";
      emitUploadProgress({ id, name: file.name, path, percent: 0, status: "failed", error });
      reject(new Error(error));
    };
    xhr.ontimeout = () => {
      const error = "Upload duurde langer dan 3 minuten en is afgebroken. Controleer de internetverbinding en probeer het bestand opnieuw.";
      emitUploadProgress({ id, name: file.name, path, percent: 0, status: "failed", error });
      reject(new Error(error));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        emitUploadProgress({ id, name: file.name, path, percent: 100, status: "completed" });
        resolve(xhr.response as RecordModel);
        return;
      }
      const message = xhr.response?.message || xhr.response?.data?.file?.message || `Upload mislukt (${xhr.status}).`;
      emitUploadProgress({ id, name: file.name, path, percent: 0, status: "failed", error: message });
      reject(new Error(message));
    };
    xhr.send(form);
  });
}

type Result<T = unknown> = { data: T | null; error: Error | null; count?: number | null };
type Filter = { op: "eq" | "neq" | "gte" | "like" | "in" | "is"; field: string; value: unknown };
type Order = { field: string; ascending: boolean };

const relationTables: Record<string, string[]> = {
  products: ["product_categories", "product_images", "product_options", "product_variants"],
  orders: ["order_files", "order_events", "order_messages", "print_jobs"],
  print_jobs: ["print_runs"],
  portfolio_projects: ["portfolio_project_media"],
};

function asError(error: unknown): Error {
  if (error instanceof ClientResponseError) return new Error(error.response?.message || error.message);
  return error instanceof Error ? error : new Error(String(error));
}

function sourceRecord(record: RecordModel): Record<string, any> {
  const { collectionId: _collectionId, collectionName: _collectionName, expand: _expand, ...value } = record as any;
  return { ...value, _pocketbase_id: record.id, id: (record as any).supabase_id || record.id };
}

function userShape(model: RecordModel | null) {
  if (!model) return null;
  return {
    id: (model as any).supabase_id || model.id,
    email: (model as any).email,
    user_metadata: { full_name: [(model as any).first_name, (model as any).last_name].filter(Boolean).join(" ") },
    app_metadata: { role: (model as any).role },
    identities: [{ id: model.id }],
    created_at: model.created,
  } as any;
}

function sessionShape() {
  const user = userShape(pocketbase.authStore.record);
  return user ? { access_token: pocketbase.authStore.token, token_type: "bearer", user } as any : null;
}

let sessionRefreshPromise: Promise<ReturnType<typeof sessionShape>> | null = null;

async function refreshStoredSession() {
  if (!pocketbase.authStore.token || !pocketbase.authStore.record) return null;
  if (!sessionRefreshPromise) {
    sessionRefreshPromise = pocketbase.collection("users")
      .authRefresh({ requestKey: null })
      .then(() => sessionShape())
      .catch(() => {
        pocketbase.authStore.clear();
        return null;
      })
      .finally(() => {
        sessionRefreshPromise = null;
      });
  }
  return sessionRefreshPromise;
}

async function findStoredFile(bucket: string, path: string) {
  return pocketbase.collection("storage_files").getFirstListItem(
    pocketbase.filter("bucket = {:bucket} && path = {:path}", { bucket, path }),
    { requestKey: null },
  );
}

async function storedFileUrl(bucket: string, path: string) {
  const record = await findStoredFile(bucket, path);
  const token = await pocketbase.files.getToken();
  const url = pocketbase.files.getURL(record, record.file, { token });
  storageUrlCache.set(`${bucket}:${path}`, url);
  return url;
}

function profileFromUser(record: RecordModel) {
  const raw: any = record;
  return {
    id: raw.supabase_id || raw.id,
    user_id: raw.supabase_id || raw.id,
    full_name: [raw.first_name, raw.last_name].filter(Boolean).join(" ") || raw.name || "",
    email: raw.email || "", phone: raw.phone || "", company_name: raw.legacy_data?.profile?.company_name || "",
    billing_address: raw.legacy_data?.profile?.billing_address || "", shipping_address: raw.address || raw.legacy_data?.profile?.shipping_address || "",
    postal_code: raw.postal_code || "", city: raw.city || "", country: raw.country || "", vat_number: raw.legacy_data?.profile?.vat_number || "",
    newsletter_subscribed: Boolean(raw.newsletter_subscribed), account_welcome_email_sent_at: raw.legacy_data?.profile?.account_welcome_email_sent_at || null,
    loyalty_points: Number(raw.legacy_data?.profile?.loyalty_points || 0), _pocketbase_id: raw.id,
  };
}

async function allRecords(table: string): Promise<Record<string, any>[]> {
  if (table === "profiles") {
    const records = await pocketbase.collection("users").getFullList({ requestKey: null });
    return records.map(profileFromUser);
  }
  if (table === "user_roles") {
    const records = await pocketbase.collection("users").getFullList({ requestKey: null });
    return records.map((record: any) => ({ id: `role:${record.supabase_id || record.id}`, user_id: record.supabase_id || record.id, role: record.role || "customer", _pocketbase_id: record.id }));
  }
  const records = await pocketbase.collection(table).getFullList({ requestKey: null });
  return records.map(sourceRecord);
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

class PocketQuery implements PromiseLike<Result<any>> {
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
  not(field: string, operator: string, value: unknown) { this.filters.push({ op: operator === "is" ? "neq" : "neq", field, value }); return this; }
  like(field: string, value: string) { this.filters.push({ op: "like", field, value }); return this; }
  order(field: string, options?: { ascending?: boolean; nullsFirst?: boolean }) { this.orders.push({ field, ascending: options?.ascending !== false }); return this; }
  range(first: number, last: number) { this.first = first; this.last = last; return this; }
  limit(value: number) { this.max = value; return this; }
  single() { this.singleMode = "single"; return this; }
  maybeSingle() { this.singleMode = "maybe"; return this; }

  private async matching() { return (await allRecords(this.table)).filter((row) => this.filters.every((filter) => compare(row, filter))); }
  private body(row: Record<string, any>) {
    const result = { ...row }; delete result.id; delete result._pocketbase_id; delete result.created; delete result.updated;
    result.supabase_id = row.id || row.supabase_id || createClientId();
    return result;
  }
  private async relations(rows: Record<string, any>[]) {
    const requested = relationTables[this.table]?.filter((name) => this.selected.includes(name)) || [];
    for (const relation of requested) {
      const related = await allRecords(relation);
      for (const row of rows) row[relation] = related.filter((candidate) => candidate[`${this.table.slice(0, -1)}_id`] === row.id || candidate.product_id === row.id || candidate.order_id === row.id || candidate.project_id === row.id || candidate.print_job_id === row.id);
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
        for (const row of input) created.push(sourceRecord(await pocketbase.collection(this.table).create(this.body(row), { requestKey: null })));
        return { data: Array.isArray(this.payload) ? created : created[0], error: null };
      }
      const rows = await this.matching();
      if (this.action === "delete") { for (const row of rows) await pocketbase.collection(this.table).delete(row._pocketbase_id, { requestKey: null }); return { data: rows, error: null }; }
      if (this.action === "update") { const updated=[]; for (const row of rows) { if(this.table === "profiles") { const mapped:any={}; if("full_name" in this.payload){const names=String(this.payload.full_name||"").trim().split(/\s+/);mapped.first_name=names.shift()||"";mapped.last_name=names.join(" ");} if("shipping_address" in this.payload)mapped.address=this.payload.shipping_address; for(const key of ["phone","postal_code","city","country","newsletter_subscribed"])if(key in this.payload)mapped[key]=this.payload[key]; updated.push(profileFromUser(await pocketbase.collection("users").update(row._pocketbase_id,mapped,{requestKey:null}))); } else updated.push(sourceRecord(await pocketbase.collection(this.table).update(row._pocketbase_id, this.payload, { requestKey: null }))); } return { data: updated, error: null }; }
      const upserted=[];
      for (const row of input) { const id=row.id || row.supabase_id; const found=(await allRecords(this.table)).find((item)=>item.id===id); upserted.push(found ? sourceRecord(await pocketbase.collection(this.table).update(found._pocketbase_id, row,{requestKey:null})) : sourceRecord(await pocketbase.collection(this.table).create(this.body(row),{requestKey:null}))); }
      return { data: Array.isArray(this.payload) ? upserted : upserted[0], error: null };
    } catch (error) { return { data: null, error: asError(error), count: null }; }
  }
  then<TResult1 = Result<any>, TResult2 = never>(onfulfilled?: ((value: Result<any>) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null) { return this.execute().then(onfulfilled, onrejected); }
}

export const supabase = {
  from: (table: string) => new PocketQuery(table),
  auth: {
    getSession: async () => ({ data: { session: await refreshStoredSession() }, error: null }),
    getUser: async () => {
      const session = await refreshStoredSession();
      return { data: { user: session?.user ?? null }, error: null };
    },
    signInWithPassword: async ({ email, password }: any) => { try { const auth=await pocketbase.collection("users").authWithPassword(email,password); return { data:{user:userShape(auth.record),session:sessionShape()},error:null }; } catch(e){ return {data:{user:null,session:null},error:asError(e)}; } },
    signUp: async ({ email, password, options }: any) => { try { const names=String(options?.data?.full_name||"").trim().split(/\s+/); const record=await pocketbase.collection("users").create({email,password,passwordConfirm:password,first_name:names.shift()||"",last_name:names.join(" "),role:"customer",supabase_id:createClientId()}); return {data:{user:userShape(record),session:null},error:null}; } catch(e){return {data:{user:null,session:null},error:asError(e)}} },
    signOut: async () => { pocketbase.authStore.clear(); return { error: null }; },
    resetPasswordForEmail: async (email: string, _options?: any) => { try { await pocketbase.collection("users").requestPasswordReset(email); return {error:null}; } catch(e){return {error:asError(e)}} },
    updateUser: async ({ password }: any) => { try { const id=pocketbase.authStore.record?.id; if(!id) throw new Error("Niet ingelogd"); const record=await pocketbase.collection("users").update(id,{password,passwordConfirm:password}); return {data:{user:userShape(record)},error:null}; } catch(e){return {data:{user:null},error:asError(e)}} },
    onAuthStateChange: (callback: any) => { const unsub=pocketbase.authStore.onChange(()=>callback(pocketbase.authStore.isValid?"SIGNED_IN":"SIGNED_OUT",sessionShape()),false); return {data:{subscription:{unsubscribe:unsub}}}; },
  },
  rpc: async (name: string, body: any = {}): Promise<any> => { try { const response=await fetch(`${POCKETBASE_URL}/api/overweel3d/rpc/${name}`,{method:"POST",headers:{"Content-Type":"application/json",...(pocketbase.authStore.token?{Authorization:pocketbase.authStore.token}: {})},body:JSON.stringify(body)}); const data=await response.json(); if(!response.ok) throw new Error(data?.message||data?.error||`RPC ${name} mislukt`); return {data:data?.data ?? data,error:null}; } catch(e){return {data:null,error:asError(e)}} },
  functions: { invoke: async (name: string,{body}:any={}) => { try { const response=await fetch(`${POCKETBASE_URL}/api/overweel3d/functions/${name}`,{method:"POST",headers:{"Content-Type":"application/json",...(pocketbase.authStore.token?{Authorization:pocketbase.authStore.token}:{})},body:JSON.stringify(body||{})}); const data=await response.json(); if(response.status===404) throw new Error("De Overweel3D-serverfunctie ontbreekt op PocketBase. Installeer of herlaad de PocketBase-hook."); if(!response.ok) throw new Error(data?.message||data?.error||`${name} mislukt`); return {data,error:null}; }catch(e){return {data:null,error:asError(e)}} } },
  channel: (_name:string) => ({ on(..._args:any[]){return this;}, subscribe(..._args:any[]){return this;}, unsubscribe(..._args:any[]){return Promise.resolve("ok");} }),
  removeChannel: async (..._args:any[]) => "ok",
  storage: { from: (bucket:string) => ({
    upload:async(path:string,file:File,_options?:any)=>{try{const existing=await findStoredFile(bucket,path).catch(()=>null); if(existing&&!_options?.upsert)throw new Error("Er bestaat al een bestand op dit pad."); const form=new FormData();form.set("bucket",bucket);form.set("path",path);form.set("file",file,file.name);form.set("owner_user_id",(pocketbase.authStore.record as any)?.supabase_id||"");form.set("public",String(path.startsWith("products/")||path.startsWith("portfolio/")||path.startsWith("colors/")||path.startsWith("reviews/"))); const record=await uploadStorageRecord(existing?.id||null,form,file,path);return{data:{path,id:record.id},error:null}}catch(e){return{data:null,error:asError(e)}}},
    remove:async(paths:string[])=>{try{for(const path of paths){const record=await findStoredFile(bucket,path).catch(()=>null);if(record)await pocketbase.collection("storage_files").delete(record.id,{requestKey:null});storageUrlCache.delete(`${bucket}:${path}`)}return{data:paths,error:null}}catch(e){return{data:null,error:asError(e)}}},
    download:async(path:string)=>{try{const url=await storedFileUrl(bucket,path);const response=await fetch(url);if(!response.ok)throw new Error(`Download mislukt (${response.status})`);return{data:await response.blob(),error:null}}catch(e){return{data:null,error:asError(e)}}},
    createSignedUrl:async(path:string,_expires?:number)=>{try{const signedUrl=await storedFileUrl(bucket,path);return{data:{signedUrl},error:null}}catch(e){return{data:null,error:asError(e)}}},
    createSignedUrls:async(paths:string[],_expires?:number)=>{const data=await Promise.all(paths.map(async path=>{try{return{path,signedUrl:await storedFileUrl(bucket,path),error:null}}catch(e){return{path,signedUrl:"",error:asError(e)}}}));return{data,error:null}},
    getPublicUrl:(path:string)=>({data:{publicUrl:storageUrlCache.get(`${bucket}:${path}`)||""}}),
  }) },
};
