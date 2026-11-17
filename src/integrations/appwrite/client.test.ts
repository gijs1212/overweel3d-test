import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { executeBackend, stableMigratedFileId, supabase } from "./client";

beforeEach(() => localStorage.clear());
afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

describe("Appwrite storage compatibility", () => {
  it("berekent hetzelfde stabiele bestands-id als de migratietool", () => {
    expect(stableMigratedFileId(
      "orders",
      "products/b52d447d-6271-443c-a124-59302b7d3c40/3909c333-383f-48b7-a27d-6e634b5c01c7-IMG_7533.jpeg",
    )).toBe("file_f8566f3a808df0e25bb2788ef792127");
  });

  it("gebruikt responseStatusCode en pakt Function-data één niveau uit", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      status: "completed",
      responseStatusCode: 200,
      responseBody: JSON.stringify({ data: { connected: true } }),
    }), { status: 201, headers: { "content-type": "application/json" } }));

    await expect(executeBackend("rpc", "social_publisher_status", {})).resolves.toEqual({ connected: true });
  });

  it("geeft de serverfout door bij een mislukte Function-response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      status: "completed",
      responseStatusCode: 403,
      responseBody: JSON.stringify({ error: "Alleen een admin mag dit uitvoeren." }),
    }), { status: 201, headers: { "content-type": "application/json" } }));

    await expect(executeBackend("rpc", "social_publisher_status", {})).rejects.toThrow("Alleen een admin");
  });
});

describe("Appwrite browser session", () => {
  it("bewaart en verstuurt de fallback-sessie wanneer third-party cookies geblokkeerd zijn", async () => {
    const requests: RequestInit[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init = {}) => {
      requests.push(init);
      if (requests.length === 1) return new Response(JSON.stringify({ $id: "session" }), { status: 201, headers: { "X-Fallback-Cookies": "a_session=test" } });
      return new Response(JSON.stringify({ $id: "user-1", email: "gijsoverweel@gmail.com", name: "Gijs", labels: ["admin"], prefs: {} }), { status: 200 });
    });

    const result = await supabase.auth.signInWithPassword({ email: "gijsoverweel@gmail.com", password: "test" });

    expect(result.error).toBeNull();
    expect(localStorage.getItem("cookieFallback")).toBe("a_session=test");
    expect(new Headers(requests[1].headers).get("X-Fallback-Cookies")).toBe("a_session=test");
    expect(result.data.user?.app_metadata.role).toBe("admin");
  });

  it("laat een oude anonieme accountcontrole een geslaagde login niet wissen", async () => {
    let finishAnonymousCheck: ((value: Response) => void) | undefined;
    const anonymousCheck = new Promise<Response>((resolve) => { finishAnonymousCheck = resolve; });
    let accountCalls = 0;

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init = {}) => {
      const path = String(url);
      if (path.endsWith("/account") && (!init.method || init.method === "GET")) {
        accountCalls += 1;
        if (accountCalls === 1) return anonymousCheck;
        return new Response(JSON.stringify({
          $id: "user-1", email: "gijsoverweel@gmail.com", name: "Gijs", labels: ["admin"], prefs: {},
        }), { status: 200 });
      }
      if (path.endsWith("/account/sessions/email")) {
        return new Response(JSON.stringify({ $id: "session" }), {
          status: 201,
          headers: { "X-Fallback-Cookies": "a_session=persistent" },
        });
      }
      throw new Error(`Onverwacht verzoek: ${path}`);
    });

    const oldCheck = supabase.auth.getSession();
    const login = await supabase.auth.signInWithPassword({
      email: "gijsoverweel@gmail.com",
      password: "test",
    });
    finishAnonymousCheck?.(new Response(JSON.stringify({ message: "Niet ingelogd" }), { status: 401 }));
    await oldCheck;

    expect(login.error).toBeNull();
    expect(login.data.user?.email).toBe("gijsoverweel@gmail.com");
    expect((await supabase.auth.getSession()).data.session?.user.email).toBe("gijsoverweel@gmail.com");
  });
});
