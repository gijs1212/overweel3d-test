import { createClient } from "@supabase/supabase-js";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const hex = (buffer: ArrayBuffer) => [...new Uint8Array(buffer)].map((value) => value.toString(16).padStart(2, "0")).join("");
const normalize = (value: string) => value.trim().toLowerCase().replace(/^.*[\\/]/, "").replace(/\.(gcode\.3mf|3mf|gcode)$/i, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const matches = (expected: string, observed: string) => {
  const left = normalize(expected); const right = normalize(observed);
  return Boolean(left && right && (left === right || left.includes(right) || right.includes(left)));
};

type FilamentColor = { id: string; name: string; material: string; hex: string };

const normalizeMaterial = (value: unknown) => String(value || "").trim().toUpperCase().replace(/\s+/g, " ");
const parseRgb = (value: unknown) => {
  const match = String(value || "").trim().match(/^#?([0-9a-f]{6})$/i);
  if (!match) return null;
  const number = Number.parseInt(match[1], 16);
  return [(number >> 16) & 255, (number >> 8) & 255, number & 255] as const;
};
const findFilamentColor = (colors: FilamentColor[], material: unknown, colorHex: unknown) => {
  const wantedMaterial = normalizeMaterial(material);
  const wantedRgb = parseRgb(colorHex);
  if (!wantedMaterial || !wantedRgb) return null;
  const candidates = colors.filter((color) => normalizeMaterial(color.material) === wantedMaterial);
  let best: { color: FilamentColor; distance: number } | null = null;
  for (const color of candidates) {
    const rgb = parseRgb(color.hex);
    if (!rgb) continue;
    const distance = Math.sqrt(rgb.reduce((sum, channel, index) => sum + (channel - wantedRgb[index]) ** 2, 0));
    if (!best || distance < best.distance) best = { color, distance };
  }
  // Bambu's reported hex value can differ slightly from the catalogue swatch.
  return best && best.distance <= 100 ? best.color : null;
};

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const printerId = req.headers.get("x-printer-id") || "";
  const token = req.headers.get("x-bridge-token") || "";
  if (!printerId || !token) return json({ error: "Bridge credentials ontbreken" }, 401);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: printer } = await supabase.from("printers").select("id,bridge_token_hash,status,offline_since,offline_alert_sent_at").eq("id", printerId).maybeSingle();
  const tokenHash = hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
  if (!printer?.bridge_token_hash || printer.bridge_token_hash !== tokenHash) return json({ error: "Ongeldige bridge-token" }, 403);

  const body = await req.json();
  const currentFile = String(body.current_file || "");
  const status = ["offline","idle","printing","paused","error","maintenance"].includes(body.status) ? body.status : "offline";
  const heartbeatAt = new Date().toISOString();
  const nextOfflineSince = status === "offline"
    ? (printer.status === "offline" ? printer.offline_since || heartbeatAt : heartbeatAt)
    : null;
  const { error: printerError } = await supabase.from("printers").update({
    status: printer.status === "maintenance" ? "maintenance" : status, current_file: currentFile || null, current_plate: body.current_plate || null,
    progress: Math.max(0, Math.min(100, Number(body.progress || 0))), remaining_minutes: body.remaining_minutes ?? null,
    current_layer: body.current_layer ?? null, total_layers: body.total_layers ?? null,
    nozzle_temperature: body.nozzle_temperature ?? null, bed_temperature: body.bed_temperature ?? null,
    chamber_temperature: body.chamber_temperature ?? null, last_seen_at: heartbeatAt, raw_status: body.raw_status || {},
    offline_since: nextOfflineSince,
    offline_alert_sent_at: status === "offline" ? printer.offline_alert_sent_at : null,
  }).eq("id", printerId);
  if (printerError) return json({ error: printerError.message }, 500);

  if (Array.isArray(body.ams_slots)) {
    const { data: palette, error: paletteError } = await supabase.from("filament_colors").select("id,name,material,hex");
    if (paletteError) return json({ error: paletteError.message }, 500);
    for (const slot of body.ams_slots) {
      const capacity = Math.max(1, Number(slot.spool_capacity_grams || 1000));
      const percent = slot.remaining_percent == null ? null : Math.max(0, Math.min(100, Number(slot.remaining_percent)));
      const reportedGrams = slot.remaining_grams == null ? null : Math.max(0, Number(slot.remaining_grams));
      const remainingGrams = reportedGrams ?? (percent == null ? null : capacity * percent / 100);
      const { error: slotError } = await supabase.from("printer_ams_slots").upsert({
        printer_id: printerId, ams_unit: Number(slot.ams_unit || 0), slot_number: Number(slot.slot_number || 1),
        material: slot.material || null, color_name: slot.color_name || null, color_hex: slot.color_hex || null,
        tray_uuid: slot.tray_uuid || null, remaining_percent: percent,
        remaining_grams: remainingGrams,
        spool_capacity_grams: capacity, raw_status: slot.raw_status || slot,
      }, { onConflict: "printer_id,ams_unit,slot_number" });
      if (slotError) return json({ error: slotError.message }, 500);

      const color = findFilamentColor((palette || []) as FilamentColor[], slot.material, slot.color_hex);
      const slotMaterial = normalizeMaterial(slot.material);
      const slotHex = String(slot.color_hex || "").trim().toUpperCase();
      if (slotMaterial && parseRgb(slotHex)) {
        const { error: inventoryError } = await supabase.from("filament_inventory").upsert({
          inventory_key: color ? `palette:${color.id}` : `ams:${slotMaterial}:${slotHex}`,
          filament_color_id: color?.id || null,
          material: color?.material || slotMaterial,
          color_name: color?.name || slot.color_name || `${slotMaterial} ${slotHex}`,
          color_hex: color?.hex || slotHex,
          // Replacing a roll of the same color deliberately resets the total to
          // the observed weight of that roll; weights are never added together.
          total_weight_grams: remainingGrams,
          spool_capacity_grams: capacity,
          remaining_percent: percent,
          source_printer_id: printerId,
          source_ams_unit: Number(slot.ams_unit || 0),
          source_slot_number: Number(slot.slot_number || 1),
          tray_uuid: slot.tray_uuid || null,
          last_seen_at: new Date().toISOString(),
        }, { onConflict: "inventory_key" });
        if (inventoryError) return json({ error: inventoryError.message }, 500);
      }
    }
  }

  const currentPlate = Number(body.current_plate) > 0 ? Number(body.current_plate) : null;
  const { data: candidates } = await supabase.from("print_jobs").select("*,orders!inner(status)")
    .eq("active", true)
    .or(`printer_id.eq.${printerId},printer_id.is.null`)
    .in("status", ["queued","suggested","approved","printing","paused","awaiting_next_run","mismatch"])
    .order("created_at");
  const awaitingJobs = (candidates || []).filter((candidate) => candidate.printer_id === printerId && candidate.status === "awaiting_next_run");
  const activeAwaitingJob = awaitingJobs.find((candidate) => matches(candidate.expected_file_name, currentFile));
  if (activeAwaitingJob) {
    if (["printing", "paused"].includes(status)) {
      return json({ success: true, matched: true, suggestion: false, countedAlready: true, jobId: activeAwaitingJob.id });
    }
    await supabase.from("print_jobs").update({ status: "queued", printer_id: null, suggested_at: null, approved_at: null, approved_by: null }).eq("id", activeAwaitingJob.id);
    return json({ success: true, matched: false, reason: "ready_for_next_run" });
  }
  const releasedAwaitingIds = awaitingJobs.map((candidate) => candidate.id);
  if (releasedAwaitingIds.length > 0) {
    await supabase.from("print_jobs").update({ status: "queued", printer_id: null, suggested_at: null, approved_at: null, approved_by: null }).in("id", releasedAwaitingIds);
  }
  const matchingCandidates = (candidates || []).filter((candidate) =>
    candidate.status !== "awaiting_next_run"
    &&
    !["completed", "cancelled"].includes(String(candidate.orders?.status || ""))
    && matches(candidate.expected_file_name, currentFile)
  );
  if (currentFile && ["printing", "paused"].includes(status) && matchingCandidates.length === 0) {
    const staleSuggestionIds = (candidates || [])
      .filter((candidate) => candidate.printer_id === printerId && candidate.status === "suggested")
      .map((candidate) => candidate.id);
    if (staleSuggestionIds.length > 0) {
      await supabase.from("print_jobs").update({
        status: "queued",
        printer_id: null,
        suggested_at: null,
        observed_file_name: null,
        comparison: { match: false, reason: "no_current_file_match", observed: currentFile, comparedAt: new Date().toISOString() },
      }).in("id", staleSuggestionIds);
    }
    return json({ success: true, matched: false, reason: "no_file_match" });
  }
  const activeApprovedJob = matchingCandidates.find((candidate) =>
    candidate.printer_id === printerId && ["approved", "printing", "paused"].includes(candidate.status)
  );
  const job = currentPlate == null
    ? activeApprovedJob || matchingCandidates.find((candidate) => candidate.status === "suggested") || matchingCandidates[0]
    : matchingCandidates.find((candidate) => Number(candidate.source_plate_number) === currentPlate);
  if (!job || !currentFile) return json({ success: true, matched: false });

  const comparison = {
    match: true,
    expected: job.expected_file_name,
    observed: currentFile,
    logicalPlate: job.plate_number,
    expectedSourcePlate: job.source_plate_number,
    observedSourcePlate: currentPlate,
    comparedAt: new Date().toISOString(),
  };
  if (job.status === "queued" || job.status === "mismatch") {
    if (!["printing", "paused"].includes(status)) return json({ success: true, matched: false, reason: "printer_not_printing" });
    await supabase.from("print_jobs").update({
      printer_id: printerId,
      status: "suggested",
      suggested_at: new Date().toISOString(),
      observed_file_name: currentFile,
      comparison,
    }).eq("id", job.id);
    return json({ success: true, matched: true, suggestion: true, jobId: job.id, orderId: job.order_id, plateNumber: job.plate_number, sourcePlateNumber: job.source_plate_number });
  }

  if (job.status === "suggested") {
    await supabase.from("print_jobs").update({ observed_file_name: currentFile, comparison }).eq("id", job.id);
    return json({ success: true, matched: true, suggestion: true, jobId: job.id, orderId: job.order_id, plateNumber: job.plate_number, sourcePlateNumber: job.source_plate_number });
  }

  const approvedByAdmin = Boolean(job.approved_by && job.approved_at);
  if (["approved", "printing", "paused"].includes(job.status) && !approvedByAdmin) {
    await supabase.from("print_jobs").update({
      status: "suggested",
      suggested_at: new Date().toISOString(),
      observed_file_name: currentFile,
      comparison: { ...comparison, approvalRequired: true },
    }).eq("id", job.id);
    return json({ success: true, matched: true, suggestion: true, approvalRequired: true, jobId: job.id, orderId: job.order_id, plateNumber: job.plate_number, sourcePlateNumber: job.source_plate_number });
  }

  if (status === "printing") {
    if (job.status === "approved" || job.status === "paused" || job.status === "printing") {
      const runNumber = Number(job.runs_completed) + 1;
      await supabase.from("print_jobs").update({ status: "printing", observed_file_name: currentFile, comparison, started_at: job.started_at || new Date().toISOString() }).eq("id", job.id);
      await supabase.from("print_runs").upsert({ print_job_id: job.id, printer_id: printerId, run_number: runNumber, observed_file_name: currentFile, status: "printing", raw_status: body.raw_status || {} }, { onConflict: "print_job_id,run_number" });
    } else {
      await supabase.from("print_jobs").update({ comparison, observed_file_name: currentFile }).eq("id", job.id);
    }
  } else if (status === "paused" && job.status === "printing") {
    await supabase.from("print_jobs").update({ status: "paused", comparison }).eq("id", job.id);
  } else if (body.print_state === "FINISH" && ["printing","paused"].includes(job.status)) {
    const { error: completionError } = await supabase.rpc("complete_print_job_run", {
      p_job_id: job.id, p_printer_id: printerId, p_observed_file_name: currentFile, p_raw_status: body.raw_status || {},
    });
    if (completionError) return json({ error: completionError.message }, 500);
  }

  return json({ success: true, matched: true, suggestion: false, jobId: job.id });
});
