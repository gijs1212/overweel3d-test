import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Auth via API key
    const apiKey = req.headers.get("x-api-key");
    const expectedKey = Deno.env.get("N8N_API_KEY");
    if (!expectedKey || apiKey !== expectedKey) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { order_id } = await req.json();
    if (!order_id) throw new Error("order_id is verplicht");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify order exists and is completed
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, order_number, status")
      .eq("id", order_id)
      .single();

    if (orderError || !order) throw new Error("Bestelling niet gevonden");
    if (order.status !== "completed") throw new Error("Bestelling is nog niet voltooid");

    // Delete storage files
    const { data: files } = await supabase
      .from("order_files")
      .select("storage_path")
      .eq("order_id", order_id);

    if (files && files.length > 0) {
      const paths = files.map((f: any) => f.storage_path);
      await supabase.storage.from("orders").remove(paths);
    }

    // Delete all related records then the order
    await supabase.from("order_files").delete().eq("order_id", order_id);
    await supabase.from("order_events").delete().eq("order_id", order_id);
    await supabase.from("orders").delete().eq("id", order_id);

    return new Response(JSON.stringify({
      success: true,
      deleted_order: order.order_number,
      deleted_files: files?.length || 0,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
