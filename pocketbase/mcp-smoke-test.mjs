import { Client } from "./mcp-server/node_modules/@modelcontextprotocol/sdk/dist/client/index.js";
import { StdioClientTransport } from "./mcp-server/node_modules/@modelcontextprotocol/sdk/dist/client/stdio.js";
import { fileURLToPath } from "node:url";

const client = new Client({ name: "overweel3d-mcp-check", version: "1.0.0" }, { capabilities: {} });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [fileURLToPath(new URL("./launch-mcp.mjs", import.meta.url))],
});

try {
  await client.connect(transport);
  const tools = await client.listTools();
  console.log(`PocketBase MCP verbonden; ${tools.tools.length} tools beschikbaar.`);
  const collections = await client.callTool({ name: "list_collections", arguments: {} });
  if (collections.isError) throw new Error("Collecties konden niet worden gelezen.");
  console.log("PocketBase-superuser kan collecties lezen.");
  if (process.argv.includes("--social-diagnose")) {
    const response = await client.callTool({
      name: "list_records",
      arguments: { collection: "social_post_jobs", perPage: 50, sort: "-scheduled_at" },
    });
    if (response.isError) throw new Error("Socialmediataakstatus kon niet worden gelezen.");
    const list = JSON.parse(response.content.find((item) => item.type === "text")?.text || "{}");
    const checks = (list.items || []).filter((item) => item.source_type === "session_check").slice(0, 5);
    console.log("Recente accountcontroles:", checks.map((item) => ({
      id: item.id, external_id: item.supabase_id, status: item.status, platforms: item.platform_state,
      error: item.last_error, scheduled_at: item.scheduled_at, claimed_at: item.claimed_at,
    })));
    const sessionsResponse = await client.callTool({
      name: "list_records",
      arguments: { collection: "social_publisher_sessions", perPage: 10 },
    });
    const sessions = JSON.parse(sessionsResponse.content.find((item) => item.type === "text")?.text || "{}");
    console.log("Platformsessies:", (sessions.items || []).map((item) => ({
      platform: item.platform, status: item.status, error: item.last_error,
      last_checked_at: item.last_checked_at,
    })));
  }
} finally {
  await client.close();
}
