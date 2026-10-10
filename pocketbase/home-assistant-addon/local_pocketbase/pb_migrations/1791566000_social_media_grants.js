migrate((app) => {
  try {
    app.findCollectionByNameOrId("social_media_grants");
  } catch (_) {
    const collection = new Collection({
      type: "base",
      name: "social_media_grants",
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: "supabase_id", type: "text", required: true, presentable: false, min: 0, max: 0, pattern: "", autogeneratePattern: "" },
        { name: "job_id", type: "text", required: true, presentable: false, min: 0, max: 0, pattern: "", autogeneratePattern: "" },
        { name: "media_index", type: "number", required: true, presentable: false, min: 1, max: null, onlyInt: true },
        { name: "path", type: "text", required: true, presentable: false, min: 0, max: 0, pattern: "", autogeneratePattern: "" },
        { name: "prepared_path", type: "text", required: false, presentable: false, min: 0, max: 0, pattern: "", autogeneratePattern: "" },
        { name: "token_hash", type: "text", required: true, presentable: false, min: 64, max: 64, pattern: "^[a-f0-9]{64}$", autogeneratePattern: "" },
        { name: "expires_at", type: "date", required: true, presentable: false, min: "", max: "" },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_social_media_grants_supabase_id ON social_media_grants (supabase_id)",
        "CREATE UNIQUE INDEX idx_social_media_grants_token_hash ON social_media_grants (token_hash)",
        "CREATE INDEX idx_social_media_grants_expiry ON social_media_grants (expires_at)",
        "CREATE INDEX idx_social_media_grants_job_media ON social_media_grants (job_id, media_index)",
      ],
    });
    app.save(collection);
  }

  // Door een eerdere initialisatiefout kon iedere poll een leeg instellingenrecord
  // maken. Behoud het gekoppelde/actieve record en verwijder uitsluitend duplicaten.
  let settings = [];
  try { settings = app.findRecordsByFilter("social_publisher_settings", "id != ''", "", 10000, 0) || []; } catch (_) {}
  if (settings.length > 1) {
    const canonical = settings.find((record) => record.getString("integration_token"))
      || settings.find((record) => record.getBool("enabled"))
      || settings[0];
    settings.forEach((record) => {
      if (record.id !== canonical.id) app.delete(record);
    });
  }
}, (app) => {
  try { app.delete(app.findCollectionByNameOrId("social_media_grants")); } catch (_) {}
});
