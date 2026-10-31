const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const zlib = require("node:zlib");
const sandbox = { module: { exports: {} }, console };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../pb_hooks/overweel3d-core.js"), "utf8"), sandbox);
const { applyOrderDefaults, socialColorPng, socialColorMedia, socialImagesForProduct, socialClaim, socialReport, socialScheduleSpotlight, socialNextPublication, socialCleanupJobs, route0, route2, route8, route9, route10, route11 } = sandbox.module.exports;

function record(data) {
  return {
    id: data.id || "pocketbase-id",
    getString: (name) => String(data[name] || ""),
    getBool: (name) => Boolean(data[name]),
    getInt: (name) => Number(data[name] || 0),
    get: (name) => data[name],
    set: (name, value) => { data[name] = value; },
    publicExport: () => ({ ...data }),
  };
}

sandbox.Record = class {
  constructor() { this.id = "history-record"; this.data = {}; }
  getString(name) { return String(this.data[name] || ""); }
  set(name, value) { this.data[name] = value; }
};

function pngPixels(bytes) {
  const png = Buffer.from(bytes);
  assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  const imageData = [];
  let offset = 8;
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("ascii", offset + 4, offset + 8);
    if (type === "IDAT") imageData.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  return zlib.inflateSync(Buffer.concat(imageData));
}

test("generated hex image is a valid 512px PNG with the expected swatch", () => {
  const pixels = pngPixels(socialColorPng("#A12B3C"));
  const width = 512;
  const center = 256 * (width * 3 + 1) + 1 + 256 * 3;
  assert.deepEqual([...pixels.subarray(center, center + 3)], [0xA1, 0x2B, 0x3C]);
  assert.equal(pixels.length, 512 * (512 * 3 + 1));
});

test("colors with a hex code always use their generated image", () => {
  const color = { getString: (name) => name === "hex" ? "#0a2b89" : "", get: () => ["colors/old.jpg"] };
  assert.deepEqual(Array.from(socialColorMedia(color)), ["generated-color:#0A2B89"]);
});

test("order creation always assigns a token, timestamps and authenticated owner", () => {
  const saved = [];
  sandbox.$security = { randomString: () => "secure-customer-token" };
  sandbox.$app = {
    findCollectionByNameOrId: () => ({}),
    save: (value) => saved.push(value),
  };
  const event = {
    auth: { id: "user-record", getString: (name) => name === "supabase_id" ? "customer-id" : "" },
    request: { pathValue: () => "create_guest_order" },
    requestInfo: () => ({ body: { p_order: {
      order_number: "OW3D-00034",
      customer_name: "Testklant",
      customer_email: "test@example.com",
      user_id: "forged-user-id",
    } } }),
    json: (_status, payload) => payload,
  };

  const response = route0(event);
  assert.equal(response.data[0].customer_order_token, "secure-customer-token");
  assert.equal(saved[0].data.customer_order_token, "secure-customer-token");
  assert.equal(saved[0].data.user_id, "customer-id");
  assert.notEqual(saved[0].data.user_id, "forged-user-id");
  assert.match(saved[0].data.submitted_at, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(saved[0].data.created_at, saved[0].data.submitted_at);
  assert.equal(saved[0].data.updated_at, saved[0].data.submitted_at);
  delete sandbox.$security;
  delete sandbox.$app;
});

test("guest order creation assigns a token without accepting a forged owner", () => {
  const saved = [];
  sandbox.$security = { randomString: () => "guest-customer-token" };
  sandbox.$app = { findCollectionByNameOrId: () => ({}), save: (value) => saved.push(value) };
  const event = {
    auth: null,
    request: { pathValue: () => "create_guest_order" },
    requestInfo: () => ({ body: { p_order: {
      order_number: "OW3D-00035",
      customer_name: "Gastklant",
      customer_email: "guest@example.com",
      user_id: "forged-user-id",
    } } }),
    json: (_status, payload) => payload,
  };

  const response = route0(event);
  assert.equal(response.data[0].customer_order_token, "guest-customer-token");
  assert.equal(saved[0].data.user_id, undefined);
  delete sandbox.$security;
  delete sandbox.$app;
});

test("all PocketBase order creation paths receive the former database defaults", () => {
  const order = record({ customer_name: "Adminbestelling" });
  sandbox.$security = { randomString: () => "default-customer-token" };
  sandbox.$app = { findRecordsByFilter: () => [] };
  applyOrderDefaults(order);
  assert.equal(order.getString("order_number"), "OW3D-00001");
  assert.equal(order.getString("customer_order_token"), "default-customer-token");
  assert.equal(order.getString("status"), "submitted");
  assert.match(order.getString("submitted_at"), /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(order.getString("created_at"), order.getString("submitted_at"));
  assert.equal(order.getString("updated_at"), order.getString("submitted_at"));
  delete sandbox.$security;
  delete sandbox.$app;
});

test("PocketBase registers the order defaults hook for direct record creation", () => {
  const wrapper = fs.readFileSync(path.join(__dirname, "../pb_hooks/overweel3d.pb.js"), "utf8");
  assert.match(wrapper, /onRecordCreate\([\s\S]*applyOrderDefaults\(e\.record\)[\s\S]*"orders"\)/);
});

test("customer order detail uses migrated timestamp fields and preserves the response contract", () => {
  const order = record({
    id: "order-record",
    supabase_id: "order-public-id",
    customer_order_token: "customer-token-with-more-than-24-chars",
    order_number: "OW3D-00034",
    customer_name: "Testklant",
    user_id: "customer-user-id",
  });
  const sorts = [];
  sandbox.$app = {
    findFirstRecordByFilter: (collection) => collection === "orders" ? order : null,
    findRecordsByFilter: (collection, _filter, sort) => {
      sorts.push([collection, sort]);
      return [];
    },
    settings: () => ({ fileToken: { secret: "file-token" } }),
    save: () => {},
  };
  const event = {
    auth: { id: "user-record", getString: (name) => name === "supabase_id" ? "customer-user-id" : "" },
    request: { pathValue: () => "get-order-by-token" },
    requestInfo: () => ({ body: { token: "customer-token-with-more-than-24-chars", registerVisit: false } }),
    json: (status, payload) => ({ status, ...payload }),
  };

  const response = route2(event);
  assert.equal(response.status, 200);
  assert.equal(response.order.id, "order-public-id");
  assert.equal(response.order.linked_to_current_user, true);
  assert.deepEqual(sorts, [
    ["order_3mf_plate_mappings", "logical_plate_number"],
    ["order_files", "created_at"],
    ["order_events", "-created_at"],
    ["order_messages", "created_at"],
    ["delivery_appointments", "-created_at"],
  ]);
  delete sandbox.$app;
});

test("customer order token actions store chat messages and delivery proposals", () => {
  const order = record({
    supabase_id: "order-public-id",
    customer_order_token: "customer-token-with-more-than-24-chars",
    order_number: "OW3D-00034",
    user_id: "customer-user-id",
  });
  const saved = [];
  sandbox.$security = { randomString: () => "random" };
  sandbox.MailerMessage = class { constructor(value) { Object.assign(this, value); } };
  sandbox.$app = {
    findFirstRecordByFilter: (collection) => collection === "orders" ? order : null,
    findCollectionByNameOrId: () => ({}),
    save: (value) => saved.push(value),
    settings: () => ({ meta: { senderAddress: "test@example.com", senderName: "Overweel3D" } }),
    newMailClient: () => ({ send: () => {} }),
  };
  const event = (body) => ({
    auth: null,
    request: { pathValue: () => "get-order-by-token" },
    requestInfo: () => ({ body: { token: "customer-token-with-more-than-24-chars", ...body } }),
    json: (status, payload) => ({ status, ...payload }),
  });

  assert.deepEqual(route2(event({ action: "send_message", message: "Wanneer is mijn bestelling klaar?" })), { status: 200, success: true });
  assert.deepEqual(route2(event({ action: "propose_delivery", appointmentData: { date: "2026-10-20", timeSlot: "13:00-17:00", notes: "Bel bij aankomst" } })), { status: 200, success: true });
  assert.equal(saved[0].data.message, "Wanneer is mijn bestelling klaar?");
  assert.equal(saved[0].data.sender_type, "customer");
  assert.equal(saved[1].data.proposed_date, "2026-10-20");
  assert.equal(saved[1].data.status, "pending");
  delete sandbox.$security;
  delete sandbox.MailerMessage;
  delete sandbox.$app;
});

test("authenticated source route serves a generated color without a storage record", () => {
  const setting = record({ integration_token: "local-token" });
  sandbox.$app = { findRecordsByFilter: () => [setting] };
  sandbox.$security = { sha256: (value) => `hash:${value}`, equal: (a, b) => a === b };
  const event = {
    requestInfo: () => ({ headers: { x_overweel_social_token: "local-token" } }),
    request: { url: { query: () => ({ get: () => "generated-color:#A12B3C" }) } },
    response: { header: () => ({ set: () => {} }) },
    blob: (status, mime, bytes) => ({ status, mime, bytes }),
  };
  const result = route9(event);
  assert.equal(result.status, 200);
  assert.equal(result.mime, "image/png");
  assert.equal(Buffer.from(result.bytes).subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  delete sandbox.$app;
  delete sandbox.$security;
});

test("prepared media returns a direct PocketBase file URL and makes the copy public", () => {
  const setting = record({ integration_token: "local-token" });
  const job = record({ id: "job-pb", supabase_id: "job-public", status: "processing", payload: {
    social_media_grant: { expires_at: "2099-01-01T00:00:00.000Z", paths: ["products/roos/photo.jpeg"] },
  } });
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.alloc(120), Buffer.from([0xff, 0xd9])]);
  const saved = [];
  sandbox.$security = { randomString: () => "a", sha256: (value) => `hash:${value}`, equal: (a, b) => a === b };
  sandbox.$os = { getenv: () => "https://api.example.test" };
  sandbox.$filesystem = { fileFromBytes: () => "prepared.jpg" };
  sandbox.$app = {
    findRecordsByFilter: (collection) => collection === "social_publisher_settings" ? [setting] : [],
    findFirstRecordByFilter: (collection, _filter, params) => collection === "social_post_jobs" && params.value === "job-public" ? job : null,
    findCollectionByNameOrId: () => ({}),
    save: (value) => saved.push(value),
  };
  const event = {
    requestInfo: () => ({ headers: { x_overweel_social_token: "local-token" }, body: { job_id: "job-public", index: 0, image_base64: jpeg.toString("base64") } }),
    request: { pathValue: () => "prepare_media" },
    json: (status, payload) => ({ status, ...payload }),
  };
  const response = route8(event);
  assert.equal(response.status, 200);
  assert.equal(response.data.url, "https://api.example.test/api/files/storage_files/history-record/prepared.jpg");
  assert.equal(saved.find((value) => value.data?.bucket === "social-publisher")?.data?.public, true);
  delete sandbox.$security;
  delete sandbox.$os;
  delete sandbox.$filesystem;
  delete sandbox.$app;
});

test("prepared MP4 is stored publicly for Meta to fetch", () => {
  const setting = record({ integration_token: "local-token" });
  const job = record({ id: "job-pb", supabase_id: "job-public", status: "processing", payload: {
    social_media_grant: { expires_at: "2099-01-01T00:00:00.000Z", paths: ["products/item/video.mov"] },
  } });
  const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 24, 102, 116, 121, 112]), Buffer.alloc(120)]);
  sandbox.$security = { randomString: () => "a", sha256: (value) => `hash:${value}`, equal: (a, b) => a === b };
  sandbox.$os = { getenv: () => "https://api.example.test" };
  sandbox.$filesystem = { fileFromBytes: (_bytes, name) => name };
  sandbox.$app = {
    findRecordsByFilter: (collection) => collection === "social_publisher_settings" ? [setting] : [],
    findFirstRecordByFilter: (collection, _filter, params) => collection === "social_post_jobs" && params.value === "job-public" ? job : null,
    findCollectionByNameOrId: () => ({}), save: () => {},
  };
  const event = {
    requestInfo: () => ({ headers: { x_overweel_social_token: "local-token" }, body: { job_id: "job-public", index: 0, media_kind: "video", video_base64: mp4.toString("base64") } }),
    request: { pathValue: () => "prepare_media" }, json: (status, payload) => ({ status, ...payload }),
  };
  const response = route8(event);
  assert.equal(response.status, 200);
  assert.match(response.data.url, /\.mp4$/);
  assert.equal(job.get("payload").social_media_grant.prepared["0"], "social-publisher/job-pb/0.mp4");
  delete sandbox.$security; delete sandbox.$os; delete sandbox.$filesystem; delete sandbox.$app;
});

test("Facebook media progress is retained for safe retries", () => {
  const setting = record({ integration_token: "local-token" });
  const job = record({ id: "job-pb", supabase_id: "job-public", status: "processing", media_paths: ["products/item/photo.jpg", "products/item/video.mov"], payload: {} });
  sandbox.$security = { sha256: (value) => `hash:${value}`, equal: (a, b) => a === b };
  sandbox.$app = {
    findRecordsByFilter: (collection) => collection === "social_publisher_settings" ? [setting] : [],
    findFirstRecordByFilter: (collection, _filter, params) => collection === "social_post_jobs" && params.value === "job-public" ? job : null,
    save: () => {},
  };
  const event = {
    requestInfo: () => ({ headers: { x_overweel_social_token: "local-token" }, body: { job_id: "job-public", platform: "facebook", index: 0, path: "products/item/photo.jpg", post_url: "https://www.facebook.com/123_456" } }),
    request: { pathValue: () => "record_post" }, json: (status, payload) => ({ status, ...payload }),
  };
  const response = route8(event);
  assert.equal(response.data.recorded, true);
  assert.equal(job.get("payload").social_platform_posts.facebook["products/item/photo.jpg"], "https://www.facebook.com/123_456");
  delete sandbox.$security; delete sandbox.$app;
});

test("outdated publisher cannot claim a job and silently publish without photos", () => {
  sandbox.BadRequestError = class extends Error {};
  sandbox.$security = { sha256: (value) => `hash:${value}`, equal: (a, b) => a === b };
  sandbox.$app = { findRecordsByFilter: () => [record({ integration_token: "local-token" })] };
  const event = {
    requestInfo: () => ({ headers: { x_overweel_social_token: "local-token" }, body: { version: "2.5.3" } }),
    request: { pathValue: () => "poll" },
  };
  assert.throws(() => route8(event), /2\.8\.0 of nieuwer/);
  delete sandbox.BadRequestError;
  delete sandbox.$security;
  delete sandbox.$app;
});

test("admin can choose Facebook mode for an unpublished queued job only", () => {
  const job = record({ id: "pocketbase-job", supabase_id: "queued-job", source_type: "product", status: "queued", payload: { name: "Roos" }, platform_state: { facebook: "pending" } });
  let saves = 0;
  sandbox.BadRequestError = class extends Error {};
  sandbox.$app = {
    findFirstRecordByFilter: (collection, _filter, params) => collection === "social_post_jobs" && params.value === "queued-job" ? job : null,
    save: () => { saves += 1; },
  };
  const event = {
    auth: { getString: () => "admin" },
    request: { pathValue: () => "set_social_facebook_mode" },
    requestInfo: () => ({ body: { p_job_id: "queued-job", p_mode: "combined" } }),
    json: (_status, response) => response,
  };
  assert.equal(route0(event).data.facebook_media_mode, "combined");
  assert.equal(job.get("payload").facebook_media_mode, "combined");
  assert.equal(saves, 1);
  job.set("status", "processing");
  assert.throws(() => route0(event), /verwerkt|afgerond/);
  job.set("status", "queued");
  job.set("payload", { social_platform_posts: { facebook: { "products/roos.jpg": "https://facebook.com/1" } } });
  assert.throws(() => route0(event), /al media/);
  assert.equal(saves, 1);
  delete sandbox.BadRequestError;
  delete sandbox.$app;
});

test("social cleanup removes cancelled jobs after five minutes and completed jobs after one hour", () => {
  const now = Date.parse("2026-10-09T12:00:00.000Z");
  const cancelledExpired = record({ id: "cancelled-expired", status: "cancelled", updated: "2026-10-09T11:54:59.000Z" });
  const cancelledFresh = record({ id: "cancelled-fresh", status: "cancelled", updated: "2026-10-09T11:55:01.000Z" });
  const completedExpired = record({ id: "completed-expired", status: "completed", updated: "2026-10-09T10:59:59.000Z" });
  const processingExpired = record({ id: "processing-expired", status: "processing", updated: "2026-10-09T10:00:00.000Z" });
  const failedExpired = record({ id: "failed-expired", status: "failed", updated: "2026-10-09T10:00:00.000Z" });
  const mediaGrantExpired = record({ id: "grant-expired", expires_at: "2026-10-09T11:59:59.000Z" });
  const preparedCopy = record({ id: "prepared-copy", bucket: "social-publisher", path: "social-publisher/completed-expired/0.jpg" });
  const removed = [];
  sandbox.$app = {
    findRecordsByFilter: (collection) => collection === "social_media_grants"
      ? [mediaGrantExpired]
      : [cancelledExpired, cancelledFresh, completedExpired, processingExpired, failedExpired],
    findFirstRecordByFilter: (collection, _filter, params) => collection === "storage_files" && params.value === preparedCopy.getString("path") ? preparedCopy : null,
    delete: (job) => removed.push(job.id),
  };
  assert.deepEqual(JSON.parse(JSON.stringify(socialCleanupJobs(now))), { deleted: 2, cancelled: 1, expired: 1, grants: 1 });
  assert.deepEqual(removed, ["grant-expired", "cancelled-expired", "completed-expired", "prepared-copy"], "actieve taken blijven staan en voorbereide kopieën verdwijnen met afgeronde taken");
  delete sandbox.$app;
});

test("product media uses its own primary photo and includes video", () => {
  const images = [
    { getString: (name) => ({ media_type: "image", storage_path: "products/second.jpg" })[name] || "", getBool: () => false, getInt: () => 1 },
    { getString: (name) => ({ media_type: "image", storage_path: "products/first.jpg" })[name] || "", getBool: () => true, getInt: () => 2 },
    { getString: (name) => ({ media_type: "video", storage_path: "products/movie.mp4" })[name] || "", getBool: () => false, getInt: () => 3 },
  ];
  sandbox.$app = {
    findRecordsByFilter: (collection) => collection === "product_images" ? images : [],
    findFirstRecordByFilter: () => ({ id: "file" }),
  };
  const product = { id: "pb-product", getString: (name) => name === "supabase_id" ? "catalog-product" : "", get: () => [] };
  assert.deepEqual(Array.from(socialImagesForProduct(product)), ["products/first.jpg", "products/second.jpg", "products/movie.mp4"]);
  delete sandbox.$app;
});

test("product media resolves to its real PocketBase file URL", () => {
  sandbox.$security = { sha256: (value) => `hash:${value}`, equal: (a, b) => a === b };
  sandbox.$os = { getenv: () => "https://api.example.test" };
  sandbox.$app = {
    findRecordsByFilter: () => [record({ integration_token: "local-token" })],
    findFirstRecordByFilter: (collection, _filter, params) => collection === "storage_files" && params.value === "products/id/photo.jpeg"
      ? record({ id: "photo-record", file: "stored-photo.jpeg" }) : null,
  };
  const event = {
    requestInfo: () => ({ headers: { x_overweel_social_token: "local-token" }, body: { path: "products/id/photo.jpeg" } }),
    request: { pathValue: () => "resolve_media" },
    json: (status, payload) => ({ status, ...payload }),
  };
  const response = route8(event);
  assert.equal(response.status, 200);
  assert.equal(response.data.url, "https://api.example.test/api/files/storage_files/photo-record/stored-photo.jpeg");
  delete sandbox.$app;
  delete sandbox.$os;
  delete sandbox.$security;
});

test("public catalog resolves only media attached to active products without login", () => {
  sandbox.NotFoundError = class extends Error {};
  sandbox.$os = { getenv: () => "https://api.example.test", dirFS: (directory) => directory };
  const product = record({ id: "product-pb", supabase_id: "product-public", active: true });
  const photo = record({ product_id: "product-public", storage_path: "products/product-public/photo.jpg" });
  const stored = record({ id: "file-pb", path: "products/product-public/photo.jpg", bucket: "orders", file: "actual.jpg", public: true });
  stored.collection = () => ({ id: "pbc_storage" });
  stored.baseFilesPath = () => "C:/pocketbase/files/file-pb";
  sandbox.$app = {
    findRecordsByFilter: (collection, filter) => collection === "product_images" && filter.includes("storage_path") ? [photo] : [],
    findFirstRecordByFilter: (collection, _filter, params) => {
      if (collection === "products" && params.value === "product-public") return product;
      if (collection === "storage_files" && params.value === stored.getString("path")) return stored;
      return null;
    },
  };
  let resolve = true;
  const event = {
    request: { url: { query: () => ({ get: (key) => key === "path" ? "products/product-public/photo.jpg" : resolve ? "1" : "" }) } },
    response: { header: () => ({ set: () => {} }) },
    json: (status, payload) => ({ status, ...payload }),
    redirect: (status, url) => ({ status, url }),
  };
  assert.equal(route11(event).url, "https://api.example.test/api/overweel3d/catalog/media?path=products%2Fproduct-public%2Fphoto.jpg");
  resolve = false;
  assert.deepEqual(JSON.parse(JSON.stringify(route11(event))), { status: 302, url: "https://api.example.test/api/files/pbc_storage/file-pb/actual.jpg" });
  product.set("active", false);
  assert.throws(() => route11(event), /media niet gevonden/);
  product.set("active", true);
  const privateEvent = { ...event, request: { url: { query: () => ({ get: () => "orders/private-file.3mf" }) } } };
  assert.throws(() => route11(privateEvent), /media niet gevonden/);
  delete sandbox.$app; delete sandbox.$os; delete sandbox.NotFoundError;
});

test("backfill preview matches the next claimed item and waits two hours", () => {
  const settingsData = { enabled: true, dry_run: false, paused_platforms: [], templates: {}, backfill_started_at: "2026-01-01T00:00:00.000Z" };
  const settings = record(settingsData);
  const first = record({ id: "first", supabase_id: "first", event_key: "backfill:first", source_type: "product", source_name: "Eerste", status: "queued", priority: 10, is_backfill: true, media_paths: ["products/first.jpg"], payload: { name: "Eerste", direct_url: "https://example.test/first" } });
  const second = record({ id: "second", supabase_id: "second", event_key: "backfill:second", source_type: "product", source_name: "Tweede", status: "queued", priority: 10, is_backfill: true, media_paths: ["products/second.jpg"], payload: { name: "Tweede", direct_url: "https://example.test/second" } });
  sandbox.$app = { findRecordsByFilter: (_collection, filter) => filter.includes("status = 'processing'") ? [] : [first, second].filter((job) => job.getString("status") === "queued"), findCollectionByNameOrId: () => ({}), save: () => {} };
  sandbox.$security = { randomString: () => "testgrant", sha256: (value) => `hash:${value}` };
  sandbox.$os = { getenv: () => "https://api.example.test" };
  const preview = socialNextPublication(settings);
  assert.equal(socialNextPublication(settings).source_name, preview.source_name);
  assert.equal(socialClaim(settings, true).source_name, preview.source_name);
  assert.ok(settingsData.backfill_last_published_at);
  [first, second].find((job) => job.getString("status") === "processing").set("status", "completed");
  assert.equal(socialClaim(settings, true), null);
  assert.ok(new Date(socialNextPublication(settings).scheduled_at).getTime() >= new Date(settingsData.backfill_last_published_at).getTime() + 2 * 3600000);
  delete sandbox.$app;
  delete sandbox.$security;
  delete sandbox.$os;
});

test("next publication explains paused mode without changing the scheduled item", () => {
  const settings = record({ enabled: false, dry_run: false, paused_platforms: [] });
  const queued = record({ id: "queued", status: "queued", source_type: "color", source_name: "Zwart", priority: 100, scheduled_at: "2026-01-01T00:00:00.000Z", payload: {} });
  sandbox.$app = { findRecordsByFilter: (_collection, filter) => filter.includes("status = 'processing'") ? [] : [queued] };
  const preview = socialNextPublication(settings);
  assert.equal(preview.state, "paused");
  assert.equal(preview.source_name, "Zwart");
  delete sandbox.$app;
});

test("an overdue post keeps its original time and is actually claimed", () => {
  const settings = record({ enabled: true, dry_run: false, paused_platforms: [], templates: {} });
  const scheduledAt = "2026-01-01T12:00:00.000Z";
  const job = record({ id: "due-job", supabase_id: "due-job", status: "queued", source_type: "color", source_name: "Zwart", priority: 100, scheduled_at: scheduledAt, media_paths: ["generated-color:#000000"], payload: {} });
  const saved = [];
  sandbox.$app = { findRecordsByFilter: (_collection, filter) => filter.includes("status = 'processing'") ? [] : [job], findCollectionByNameOrId: () => ({}), save: (value) => saved.push(value) };
  sandbox.$security = { randomString: () => "testgrant", sha256: (value) => `hash:${value}` };
  sandbox.$os = { getenv: () => "https://api.example.test" };
  const preview = socialNextPublication(settings);
  assert.equal(preview.scheduled_at, scheduledAt);
  assert.equal(preview.due, true);
  const claimed = socialClaim(settings, true);
  assert.equal(claimed.id, "due-job");
  assert.deepEqual(Array.from(claimed.media_urls), [], "nieuwe taken mogen de falende public-media-route niet meer gebruiken");
  assert.equal(claimed.media_paths[0], "generated-color:#000000");
  assert.equal(saved.some((value) => value.data?.media_index === 1), false, "nieuwe taken maken geen tijdelijke grant meer aan");
  assert.ok(saved.some((value) => value.data?.status === "started" && value.data?.platform === "system"));
  delete sandbox.$app;
  delete sandbox.$security;
  delete sandbox.$os;
});

test("claiming a job no longer needs the media-grant collection", () => {
  const settings = record({ enabled: true, dry_run: false, paused_platforms: [], templates: {} });
  const job = record({ id: "safe-job", supabase_id: "safe-job", status: "queued", source_type: "color", source_name: "Zwart", priority: 100, scheduled_at: "2026-01-01T00:00:00.000Z", media_paths: ["generated-color:#000000"], payload: { facebook_media_mode: "combined" } });
  sandbox.$app = {
    findRecordsByFilter: (_collection, filter) => filter.includes("status = 'processing'") ? [] : [job],
    findCollectionByNameOrId: (collection) => { if (collection === "social_media_grants") throw new Error(`missing collection: ${collection}`); return {}; },
    save: () => {},
  };
  sandbox.$security = { randomString: () => "testgrant", sha256: (value) => `hash:${value}` };
  sandbox.$os = { getenv: () => "https://api.example.test" };
  const claimed = socialClaim(settings, true);
  assert.equal(claimed.id, "safe-job");
  assert.equal(claimed.facebook_media_mode, "combined");
  assert.equal(job.getString("status"), "processing");
  delete sandbox.$app;
  delete sandbox.$security;
  delete sandbox.$os;
});

test("admin can prioritize one queued job without reopening an already published channel", () => {
  const settings = record({ enabled: true, dry_run: false, paused_platforms: [], integration_token: "local-token", control_url: "http://192.168.2.50:8787", templates: {} });
  const job = record({ id: "pb-job", supabase_id: "chosen-job", status: "queued", source_type: "product", source_name: "Roos", priority: 10, is_backfill: true, scheduled_at: "2099-01-01T00:00:00.000Z", media_paths: ["products/rose.jpg"], payload: {}, platform_state: { facebook: "published", instagram: "pending" } });
  let claimFilter = "";
  sandbox.$app = {
    findRecordsByFilter: (collection, filter) => {
      if (collection === "social_publisher_settings") return [settings];
      if (filter.includes("status = 'processing'")) return [];
      if (filter.includes("status = 'queued'") && job.get("payload").force_now) claimFilter = filter;
      return [job];
    },
    findFirstRecordByFilter: (collection, _filter, params) => collection === "social_post_jobs" && params.value === "chosen-job" ? job : null,
    findCollectionByNameOrId: () => ({}),
    save: () => {},
  };
  sandbox.$http = { send: () => ({ statusCode: 200 }) };
  const event = { auth: { getString: () => "admin" }, request: { pathValue: () => "publish_social_job_now" }, requestInfo: () => ({ body: { p_job_id: "chosen-job" } }), json: (_status, response) => response };
  assert.equal(route0(event).data.wake_sent, true);
  assert.equal(job.getInt("priority"), 10000);
  assert.equal(socialNextPublication(settings).source_name, "Roos");
  sandbox.$security = { randomString: () => "testgrant", sha256: (value) => `hash:${value}` };
  sandbox.$os = { getenv: () => "https://api.example.test" };
  const claimed = socialClaim(settings, true);
  assert.deepEqual(Array.from(claimed.platforms), ["instagram"]);
  assert.equal(claimFilter.includes("scheduled_at <="), false, "directe taken mogen niet door een database-datumfilter verdwijnen");
  assert.equal(job.getInt("priority"), 10);
  assert.equal(job.get("payload").force_now, undefined);
  delete sandbox.$app;
  delete sandbox.$http;
  delete sandbox.$security;
  delete sandbox.$os;
});

test("manual priority bypasses backfill delay even when payload is unreadable", () => {
  const settings = record({ backfill_last_published_at: "2026-10-09T10:00:00.000Z" });
  const job = record({ priority: 10000, is_backfill: true, scheduled_at: "2026-10-09T10:01:00.000Z", payload: "invalid-json" });
  const now = new Date("2026-10-09T10:02:00.000Z");
  assert.equal(sandbox.socialReadyAt(job, settings, now), new Date("2026-10-09T10:01:00.000Z").getTime());
});

test("PocketBase UTF-8 JSON byte fields decode to media and payload values", () => {
  const paths = ["products/roos/afbeelding-één.jpeg"];
  const payload = { force_now: true, name: "Roos" };
  assert.deepEqual(Array.from(sandbox.socialArray(Array.from(Buffer.from(JSON.stringify(paths)))), String), paths);
  assert.equal(sandbox.socialObject(Array.from(Buffer.from(JSON.stringify(payload)))).force_now, true);
  assert.equal(sandbox.socialObject(Array.from(Buffer.from(JSON.stringify(payload)))).name, "Roos");
});

test("admin activity shows channel result, source name and error without exposing the job payload", () => {
  const history = record({ id: "history-id", supabase_id: "history-id", job_id: "older-job", platform: "instagram", status: "failed", details: { error: "Meta weigerde afbeelding" }, published_at: "2026-10-08T19:00:00.000Z" });
  const job = record({ id: "pocketbase-job", supabase_id: "older-job", source_name: "Roos", source_type: "product", payload: { social_media_grant: { token: "secret" } } });
  sandbox.$app = {
    findRecordsByFilter: (collection) => collection === "social_post_history" ? [history] : [],
    findFirstRecordByFilter: (collection, _filter, params) => collection === "social_post_jobs" && params.value === "older-job" ? job : null,
  };
  const event = { auth: { getString: () => "admin" }, request: { pathValue: () => "social_publisher_activity" }, requestInfo: () => ({ body: {} }), json: (_status, response) => response };
  const result = route0(event).data[0];
  assert.equal(result.source_name, "Roos");
  assert.equal(result.status, "failed");
  assert.equal(result.error, "Meta weigerde afbeelding");
  assert.equal(JSON.stringify(result).includes("secret"), false);
  delete sandbox.$app;
});

test("the next spotlight is stored in the queue before its publication time", () => {
  const nextAt = "2099-01-03T18:00:00.000Z";
  const data = { spotlight_enabled: true, spotlight_next_at: nextAt };
  const product = record({ id: "product-pb", supabase_id: "product-1", name: "Roos", active: true });
  const image = record({ media_type: "image", storage_path: "products/roos.jpg", is_primary: true, display_order: 0 });
  const saved = [];
  sandbox.$security = { randomString: () => "random-id", sha256: (value) => `hash:${value}` };
  sandbox.$app = {
    findRecordsByFilter: (collection, filter) => collection === "social_post_jobs" && filter.includes("source_type = 'spotlight'") ? [] : collection === "products" ? [product] : collection === "product_images" ? [image] : [],
    findFirstRecordByFilter: (collection) => collection === "storage_files" ? { id: "stored-photo" } : null,
    findCollectionByNameOrId: () => ({}),
    save: (item) => saved.push(item),
  };
  socialScheduleSpotlight(record(data));
  const queued = saved.find((item) => item.data?.source_type === "spotlight");
  assert.equal(queued?.data?.source_name, "Roos");
  assert.equal(queued?.data?.scheduled_at, nextAt);
  assert.equal(queued?.data?.status, "queued");
  delete sandbox.$app;
  delete sandbox.$security;
});

test("completing a spotlight immediately queues the next product two days ahead", () => {
  const settingsData = { enabled: true, dry_run: false, spotlight_enabled: true, spotlight_next_at: "2026-10-09T17:00:00.000Z", paused_platforms: [] };
  const settings = record(settingsData);
  const current = record({ id: "current-pb", supabase_id: "current-job", source_type: "spotlight", source_id: "product-1", source_name: "Roos", status: "processing", platform_state: { facebook: "published", instagram: "pending" }, payload: { target_platforms: ["facebook", "instagram"] } });
  const nextProduct = record({ id: "next-product-pb", supabase_id: "product-2", name: "Tetr_s", active: true });
  const image = record({ media_type: "image", storage_path: "products/tetr-s.jpg", is_primary: true, display_order: 0 });
  const saved = [];
  sandbox.$security = { randomString: () => "random-id", sha256: (value) => `hash:${value}` };
  sandbox.$app = {
    findFirstRecordByFilter: (collection, _filter, params) => collection === "social_post_jobs" && params.value === "current-job" ? current : collection === "storage_files" ? { id: "stored-photo" } : null,
    findRecordsByFilter: (collection, filter) => collection === "social_post_jobs" && filter.includes("source_type = 'spotlight'") ? [] : collection === "products" ? [nextProduct] : collection === "product_images" ? [image] : [],
    findCollectionByNameOrId: () => ({}),
    save: (item) => saved.push(item),
  };
  socialReport(settings, { job_id: "current-job", platform: "instagram", status: "published", post_url: "https://instagram.test/post" });
  assert.equal(current.getString("status"), "completed");
  const queued = saved.find((item) => item.data?.source_type === "spotlight");
  assert.equal(queued?.data?.source_name, "Tetr_s");
  assert.equal(queued?.data?.scheduled_at, settingsData.spotlight_next_at);
  assert.ok(new Date(settingsData.spotlight_next_at).getTime() > Date.now() + 24 * 60 * 60 * 1000);
  delete sandbox.$app;
  delete sandbox.$security;
});

test("temporary social media link serves the photo uploaded for custom text", () => {
  const job = record({ supabase_id: "job-1", payload: { social_media_grant: { token: "grant", expires_at: "2099-01-01T00:00:00.000Z", paths: ["social/manual/photo.jpg"] } } });
  const file = { getString: () => "photo.jpg", baseFilesPath: () => "/files" };
  sandbox.$app = { findFirstRecordByFilter: (collection, _filter, params) => collection === "social_post_jobs" && params.value === "job-1" ? job : collection === "storage_files" && params.value === "social/manual/photo.jpg" ? file : null };
  sandbox.$os = { stat: () => ({ size: () => 3 }), readFile: () => [1, 2, 3] };
  sandbox.$filepath = { join: (...parts) => parts.join("/") };
  const query = { job_id: "job-1", token: "grant", index: "0" };
  const event = { request: { url: { query: () => ({ get: (key) => query[key] }) } }, response: { header: () => ({ set: () => {} }) }, blob: (status, mime, bytes) => ({ status, mime, bytes }) };
  const response = route10(event);
  assert.equal(response.status, 200);
  assert.equal(response.mime, "image/jpeg");
  assert.deepEqual(Array.from(response.bytes), [1, 2, 3]);
  delete sandbox.$app;
  delete sandbox.$os;
  delete sandbox.$filepath;
});

test("signed public media link works without reading the job payload", () => {
  const path = "products/roos/photo.jpeg";
  const expires = Date.parse("2099-01-01T00:00:00.000Z");
  const secret = "publisher-secret";
  const signature = `hash:job-1|0|${expires}|${path}|${secret}`;
  const settings = record({ integration_token: secret });
  const file = { getString: () => "photo.jpeg", baseFilesPath: () => "/files" };
  sandbox.$security = { sha256: (value) => `hash:${value}`, equal: (left, right) => left === right };
  sandbox.$app = {
    findRecordsByFilter: (collection) => collection === "social_publisher_settings" ? [settings] : [],
    findFirstRecordByFilter: (collection, _filter, params) => collection === "storage_files" && params.value === path ? file : null,
  };
  sandbox.$os = { stat: () => ({ size: () => 3 }), readFile: () => [4, 5, 6] };
  sandbox.$filepath = { join: (...parts) => parts.join("/") };
  const query = { job_id: "job-1", index: "0", path, expires: String(expires), signature };
  const event = { request: { url: { query: () => ({ get: (key) => query[key] || "" }) } }, response: { header: () => ({ set: () => {} }) }, blob: (status, mime, bytes) => ({ status, mime, bytes }) };
  const response = route10(event);
  assert.equal(response.status, 200);
  assert.equal(response.mime, "image/jpeg");
  assert.deepEqual(Array.from(response.bytes), [4, 5, 6]);
  delete sandbox.$app;
  delete sandbox.$security;
  delete sandbox.$os;
  delete sandbox.$filepath;
});

test("media grant serves the prepared image without reading jobs or settings", () => {
  const originalPath = "products/roos/photo.jpeg";
  const preparedPath = "social-publisher/job-1/0.jpg";
  const grant = record({
    id: "grant-pb", supabase_id: "grant-public", token_hash: "hash:secret-token",
    expires_at: "2099-01-01T00:00:00.000Z", path: originalPath, prepared_path: preparedPath,
  });
  const file = { getString: () => "prepared.jpg", baseFilesPath: () => "/files" };
  sandbox.$security = { sha256: (value) => `hash:${value}`, equal: (left, right) => left === right };
  sandbox.$app = {
    findFirstRecordByFilter: (collection, _filter, params) => {
      if (collection === "social_media_grants" && params.value === "grant-public") return grant;
      if (collection === "storage_files" && params.value === preparedPath) return file;
      return null;
    },
  };
  sandbox.$os = { stat: () => ({ size: () => 3 }), readFile: () => [7, 8, 9] };
  sandbox.$filepath = { join: (...parts) => parts.join("/") };
  const query = { grant_id: "grant-public", token: "secret-token" };
  const event = { request: { url: { query: () => ({ get: (key) => query[key] || "" }) } }, response: { header: () => ({ set: () => {} }) }, blob: (status, mime, bytes) => ({ status, mime, bytes }) };
  const response = route10(event);
  assert.equal(response.status, 200);
  assert.equal(response.mime, "image/jpeg");
  assert.deepEqual(Array.from(response.bytes), [7, 8, 9]);
  delete sandbox.$app;
  delete sandbox.$security;
  delete sandbox.$os;
  delete sandbox.$filepath;
});
