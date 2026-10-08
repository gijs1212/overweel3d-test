const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const zlib = require("node:zlib");
const sandbox = { module: { exports: {} }, console };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../pb_hooks/overweel3d-core.js"), "utf8"), sandbox);
const { socialColorPng, socialColorMedia, socialImagesForProduct, socialClaim, socialScheduleSpotlight, socialNextPublication, route10 } = sandbox.module.exports;

function record(data) {
  return {
    id: data.id || "pocketbase-id",
    getString: (name) => String(data[name] || ""),
    getBool: (name) => Boolean(data[name]),
    getInt: (name) => Number(data[name] || 0),
    get: (name) => data[name],
    set: (name, value) => { data[name] = value; },
  };
}

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

test("product media uses its own primary photo and excludes video", () => {
  const images = [
    { getString: (name) => ({ media_type: "image", storage_path: "products/second.jpg" })[name] || "", getBool: () => false, getInt: () => 1 },
    { getString: (name) => ({ media_type: "image", storage_path: "products/first.jpg" })[name] || "", getBool: () => true, getInt: () => 2 },
    { getString: (name) => ({ media_type: "video", storage_path: "products/movie.mp4" })[name] || "", getBool: () => false, getInt: () => 3 },
  ];
  sandbox.$app = {
    findRecordsByFilter: (collection) => collection === "product_images" ? images : [],
    findFirstRecordByFilter: (_collection, _filter, params) => params.value !== "products/movie.mp4" ? { id: "file" } : null,
  };
  const product = { id: "pb-product", getString: (name) => name === "supabase_id" ? "catalog-product" : "", get: () => [] };
  assert.deepEqual(Array.from(socialImagesForProduct(product)), ["products/first.jpg", "products/second.jpg"]);
  delete sandbox.$app;
});

test("backfill preview matches the next claimed item and waits two hours", () => {
  const settingsData = { enabled: true, dry_run: false, paused_platforms: [], templates: {}, backfill_started_at: "2026-01-01T00:00:00.000Z" };
  const settings = record(settingsData);
  const first = record({ id: "first", supabase_id: "first", event_key: "backfill:first", source_type: "product", source_name: "Eerste", status: "queued", priority: 10, is_backfill: true, media_paths: ["products/first.jpg"], payload: { name: "Eerste", direct_url: "https://example.test/first" } });
  const second = record({ id: "second", supabase_id: "second", event_key: "backfill:second", source_type: "product", source_name: "Tweede", status: "queued", priority: 10, is_backfill: true, media_paths: ["products/second.jpg"], payload: { name: "Tweede", direct_url: "https://example.test/second" } });
  sandbox.$app = { findRecordsByFilter: (_collection, filter) => filter.includes("status = 'processing'") ? [] : [first, second].filter((job) => job.getString("status") === "queued"), save: () => {} };
  sandbox.$security = { randomString: () => "testgrant" };
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

test("spotlight stays deferred while backfill is unfinished", () => {
  const data = { spotlight_enabled: true, spotlight_next_at: "2020-01-01T00:00:00.000Z" };
  sandbox.$app = { findRecordsByFilter: () => [record({ status: "queued" })], save: () => {} };
  socialScheduleSpotlight(record(data));
  assert.ok(new Date(data.spotlight_next_at).getTime() > Date.now());
  delete sandbox.$app;
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
