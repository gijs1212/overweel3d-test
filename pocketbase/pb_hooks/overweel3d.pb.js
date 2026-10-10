/// <reference path="../pb_data/types.d.ts" />

// Gegenereerd met scripts/build-pocketbase-hook.mjs.
// PocketBase-handlers zijn geïsoleerd; laad gedeelde logica daarom binnen iedere handler.
routerAdd("POST", "/api/overweel3d/rpc/{name}", function (e) { return require(__hooks + "/overweel3d-core.js").route0(e); });
routerAdd("GET", "/api/overweel3d/health", function (e) { return require(__hooks + "/overweel3d-core.js").route1(e); });
routerAdd("POST", "/api/overweel3d/functions/{name}", function (e) { return require(__hooks + "/overweel3d-core.js").route2(e); });
routerAdd("GET", "/api/overweel3d/functions/download-order-file", function (e) { return require(__hooks + "/overweel3d-core.js").route3(e); }, $apis.bodyLimit(1024 * 1024));
routerAdd("POST", "/api/overweel3d/printer-camera-ingest", function (e) { return require(__hooks + "/overweel3d-core.js").route4(e); }, $apis.bodyLimit(6 * 1024 * 1024));
routerAdd("POST", "/api/overweel3d/bridge/refresh", function (e) { return require(__hooks + "/overweel3d-core.js").route5(e); });
routerAdd("POST", "/api/overweel3d/bridge/status", function (e) { return require(__hooks + "/overweel3d-core.js").route6(e); });
routerAdd("POST", "/api/overweel3d/bridge/control", function (e) { return require(__hooks + "/overweel3d-core.js").route7(e); });
routerAdd("POST", "/api/overweel3d/social/{action}", function (e) { return require(__hooks + "/overweel3d-core.js").route8(e); });
routerAdd("GET", "/api/overweel3d/social/media", function (e) { return require(__hooks + "/overweel3d-core.js").route9(e); }, $apis.bodyLimit(32 * 1024 * 1024));
routerAdd("GET", "/api/overweel3d/social/public-media", function (e) { return require(__hooks + "/overweel3d-core.js").route10(e); }, $apis.bodyLimit(32 * 1024 * 1024));

cronAdd("overweel3d-social-job-retention", "* * * * *", function () {
  try { require(__hooks + "/overweel3d-core.js").socialCleanupJobs(); }
  catch (error) { console.error("Social Publisher-wachtrij opschonen mislukt:", error); }
});
