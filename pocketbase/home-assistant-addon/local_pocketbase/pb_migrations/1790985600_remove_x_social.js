migrate((app) => {
  const allowedPlatforms = ["facebook", "instagram"];

  const asObject = (value) => {
    if (!value) return {};
    if (typeof value === "string") {
      try { value = JSON.parse(value); } catch (_) { return {}; }
    }
    if (typeof value !== "object" || Array.isArray(value)) return {};
    return value;
  };

  const asArray = (value) => {
    if (!value) return [];
    if (typeof value === "string") {
      try { value = JSON.parse(value); } catch (_) { return []; }
    }
    return Array.isArray(value) ? value : [];
  };

  const records = (collection) => {
    try { return app.findRecordsByFilter(collection, "id != ''", "", 10000, 0) || []; }
    catch (_) { return []; }
  };

  records("social_publisher_settings").forEach((record) => {
    const templates = asObject(record.get("templates"));
    Object.keys(templates).forEach((templateName) => {
      const template = asObject(templates[templateName]);
      delete template.x;
      templates[templateName] = template;
    });
    record.set("templates", templates);
    record.set("paused_platforms", asArray(record.get("paused_platforms")).filter((name) => allowedPlatforms.indexOf(name) >= 0));
    app.save(record);
  });

  records("social_post_jobs").forEach((record) => {
    const payload = asObject(record.get("payload"));
    const platformState = asObject(record.get("platform_state"));
    const originalTargets = asArray(payload.target_platforms);
    const hadExplicitTargets = originalTargets.length > 0;
    const targets = originalTargets.filter((name) => allowedPlatforms.indexOf(name) >= 0);

    if (hadExplicitTargets) payload.target_platforms = targets;
    if (payload.texts) {
      const texts = asObject(payload.texts);
      delete texts.x;
      payload.texts = texts;
    }
    delete platformState.x;

    record.set("payload", payload);
    record.set("platform_state", platformState);

    if (hadExplicitTargets && targets.length === 0) {
      record.set("status", "cancelled");
      record.set("last_error", "Geannuleerd tijdens migratie: X is uit het systeem verwijderd.");
    } else {
      const effectiveTargets = targets.length > 0 ? targets : allowedPlatforms;
      const finished = effectiveTargets.every((name) => ["published", "dry_run"].indexOf(String(platformState[name] || "")) >= 0);
      if (finished && ["queued", "processing", "failed", "manual_attention"].indexOf(String(record.get("status") || "")) >= 0) {
        record.set("status", effectiveTargets.every((name) => platformState[name] === "dry_run") ? "dry_run_complete" : "completed");
      }
    }
    app.save(record);
  });

  ["social_publisher_sessions", "social_post_history"].forEach((collection) => {
    records(collection).forEach((record) => {
      if (String(record.get("platform") || "").toLowerCase() === "x") app.delete(record);
    });
  });
}, (_) => {
  // X-gegevens worden bewust niet hersteld bij een rollback.
});
