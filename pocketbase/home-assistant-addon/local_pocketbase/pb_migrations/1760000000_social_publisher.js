migrate((app) => {
  const adminRule = '@request.auth.role = "admin"';
  const createCollection = (name, fields, indexes = []) => {
    try { app.findCollectionByNameOrId(name); return; } catch (_) {}
    const collection = new Collection({
      type: "base",
      name,
      listRule: adminRule,
      viewRule: adminRule,
      createRule: adminRule,
      updateRule: adminRule,
      deleteRule: adminRule,
      fields,
      indexes,
    });
    app.save(collection);
  };

  const text = (name, options = {}) => ({ name, type: "text", required: false, presentable: false, min: 0, max: 0, pattern: "", autogeneratePattern: "", ...options });
  const bool = (name) => ({ name, type: "bool", required: false, presentable: false });
  const number = (name) => ({ name, type: "number", required: false, presentable: false, min: null, max: null, onlyInt: true });
  const date = (name) => ({ name, type: "date", required: false, presentable: false, min: "", max: "" });
  const json = (name, maxSize = 2000000) => ({ name, type: "json", required: false, presentable: false, maxSize });

  createCollection("social_publisher_settings", [
    text("supabase_id", { required: true }), bool("enabled"), bool("dry_run"), bool("spotlight_enabled"),
    text("integration_token"), text("control_url"), text("discount_image_path"), json("paused_platforms"),
    json("templates"), date("spotlight_next_at"), date("backfill_started_at"), date("backfill_last_published_at"), date("last_sync_at"),
    date("publisher_last_seen_at"), text("publisher_version"),
  ], ["CREATE UNIQUE INDEX idx_social_settings_supabase_id ON social_publisher_settings (supabase_id)"]);

  createCollection("social_post_jobs", [
    text("supabase_id", { required: true }), text("event_key", { required: true }), text("source_type", { required: true }),
    text("source_id"), text("source_name"), text("status"), number("priority"), date("scheduled_at"), date("next_retry_at"),
    json("media_paths"), json("payload"), json("platform_state"), number("attempts"), text("last_error", { max: 10000 }),
    bool("is_backfill"), date("claimed_at"), date("completed_at"),
  ], [
    "CREATE UNIQUE INDEX idx_social_jobs_supabase_id ON social_post_jobs (supabase_id)",
    "CREATE UNIQUE INDEX idx_social_jobs_event_key ON social_post_jobs (event_key)",
    "CREATE INDEX idx_social_jobs_status_schedule ON social_post_jobs (status, scheduled_at)",
  ]);

  createCollection("social_post_history", [
    text("supabase_id", { required: true }), text("job_id", { required: true }), text("platform", { required: true }),
    text("status"), text("post_url"), json("details"), date("published_at"),
  ], ["CREATE UNIQUE INDEX idx_social_history_supabase_id ON social_post_history (supabase_id)", "CREATE INDEX idx_social_history_job ON social_post_history (job_id)"]);

  createCollection("social_publisher_sessions", [
    text("supabase_id", { required: true }), text("platform", { required: true }), text("status"), date("last_checked_at"),
    text("last_error", { max: 10000 }), text("screenshot_path"), text("account_name"), text("account_url"), json("check_steps"),
  ], ["CREATE UNIQUE INDEX idx_social_sessions_platform ON social_publisher_sessions (platform)"]);
}, (app) => {
  ["social_post_history", "social_post_jobs", "social_publisher_sessions", "social_publisher_settings"].forEach((name) => {
    try { app.delete(app.findCollectionByNameOrId(name)); } catch (_) {}
  });
});
