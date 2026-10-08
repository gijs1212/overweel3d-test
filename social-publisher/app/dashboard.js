async function refreshDashboard() {
  try {
    const responses = await Promise.all([fetch("/api/status"), fetch("/api/logs")]);
    if (responses.some((response) => !response.ok)) {
      throw new Error("Dashboardgegevens konden niet worden geladen.");
    }
    const [status, logs] = await Promise.all(responses.map((response) => response.json()));
    document.getElementById("version").textContent = status.version;
    document.getElementById("facebook-page").textContent = status.facebook_page;
    document.getElementById("meta-state").textContent = status.meta_api_configured ? "API-waarden ingevuld" : "API-waarden ontbreken";
    document.getElementById("meta-dot").classList.toggle("ok", status.meta_api_configured);
    document.getElementById("pair-code").textContent = status.pairing_code;
    document.getElementById("pair-state").textContent = status.paired ? "Gekoppeld" : "Niet gekoppeld";
    document.getElementById("pair-dot").classList.toggle("ok", status.paired);
    document.getElementById("connection-state").textContent = status.connected ? "Verbonden" : "Geen verbinding";
    document.getElementById("connection-dot").classList.toggle("ok", status.connected);
    document.getElementById("heartbeat").textContent = status.last_heartbeat_at
      ? "Laatste bevestigde heartbeat: " + new Date(status.last_heartbeat_at).toLocaleString("nl-NL")
      : "Nog geen heartbeat bevestigd.";
    document.getElementById("connection-error").textContent = status.last_connection_error || "";
    const panel = document.getElementById("logs");
    const follow = panel.scrollHeight - panel.scrollTop - panel.clientHeight < 35;
    panel.textContent = (logs.lines || []).join("\n") || "Nog geen logregels.";
    if (follow) panel.scrollTop = panel.scrollHeight;
  } catch (error) {
    document.getElementById("connection-state").textContent = "Status niet beschikbaar";
    document.getElementById("connection-dot").classList.remove("ok");
    document.getElementById("connection-error").textContent = String(error);
  }
}

void refreshDashboard();
setInterval(() => void refreshDashboard(), 3000);

document.getElementById("meta-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const result = document.getElementById("meta-save-result");
  const tokenInput = document.getElementById("meta-token");
  result.textContent = "Opslaan…";
  try {
    const response = await fetch("/api/meta-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        page_access_token: tokenInput.value,
        page_id: document.getElementById("meta-page-id").value,
        instagram_user_id: document.getElementById("meta-instagram-id").value,
      }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.detail || "Opslaan mislukt.");
    }
    tokenInput.value = "";
    result.textContent = "Opgeslagen. Herstart de container om de API-gegevens te activeren.";
  } catch (error) {
    result.textContent = String(error);
  }
});
