import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { order_id, include_files } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Build query - fetch single order or all accepted orders
    let ordersQuery = supabase.from("orders").select("*");
    if (order_id) {
      ordersQuery = ordersQuery.eq("id", order_id);
    } else {
      // Default: fetch all accepted orders ready for export
      ordersQuery = ordersQuery.in("status", ["approved_by_customer", "waiting_for_payment", "in_production", "completed"]);
    }

    const { data: orders, error: ordersError } = await ordersQuery;
    if (ordersError) throw ordersError;

    const results = [];

    for (const order of orders || []) {
      // Get events
      const { data: events } = await supabase
        .from("order_events")
        .select("*")
        .eq("order_id", order.id)
        .order("created_at", { ascending: true });

      // Get files metadata
      const { data: files } = await supabase
        .from("order_files")
        .select("*")
        .eq("order_id", order.id);

      // Optionally get file download URLs
      const fileData = [];
      if (files) {
        for (const file of files) {
          const entry: any = { ...file };
          if (include_files) {
            const { data: signedUrl } = await supabase.storage
              .from("orders")
              .createSignedUrl(file.storage_path, 3600); // 1 hour expiry
            entry.download_url = signedUrl?.signedUrl || null;
          }
          fileData.push(entry);
        }
      }

      results.push({
        order,
        events: events || [],
        files: fileData,
        exported_at: new Date().toISOString(),
      });
    }

    return new Response(JSON.stringify({ success: true, data: results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
