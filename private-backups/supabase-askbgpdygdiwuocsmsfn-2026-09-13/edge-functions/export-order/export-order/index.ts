import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Auth via API key (for n8n)
    const apiKey = req.headers.get("x-api-key");
    const expectedKey = Deno.env.get("N8N_API_KEY");
    if (!expectedKey) throw new Error("N8N_API_KEY not configured");
    if (apiKey !== expectedKey) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let body: any = {};
    try { body = await req.json(); } catch { /* empty body = fetch all completed */ }

    const { order_id, status_filter, include_files = true } = body;

    // Build query
    let ordersQuery = supabase.from("orders").select("*");
    if (order_id) {
      ordersQuery = ordersQuery.eq("id", order_id);
    } else {
      const statuses = status_filter || ["completed"];
      ordersQuery = ordersQuery.in("status", statuses);
    }

    const { data: orders, error: ordersError } = await ordersQuery;
    if (ordersError) throw ordersError;

    if (!orders || orders.length === 0) {
      return new Response(JSON.stringify({ success: true, data: [], message: "Geen bestellingen gevonden" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const baseUrl = Deno.env.get("SUPABASE_URL")!;
    const results = [];

    for (const order of orders) {
      const { data: events } = await supabase
        .from("order_events").select("*").eq("order_id", order.id)
        .order("created_at", { ascending: true });

      const { data: files } = await supabase
        .from("order_files").select("*").eq("order_id", order.id);

      const fileData = [];
      if (files) {
        for (const file of files) {
          const entry: any = {
            id: file.id,
            original_filename: file.original_filename,
            storage_path: file.storage_path,
            file_size: file.file_size,
            mime_type: file.mime_type,
            created_at: file.created_at,
          };

          if (include_files) {
            // Generate a direct download URL via our own edge function
            entry.download_url = `${baseUrl}/functions/v1/download-order-file?file_id=${file.id}`;
          }

          fileData.push(entry);
        }
      }

      results.push({
        order: {
          id: order.id, order_number: order.order_number, status: order.status,
          customer_name: order.customer_name, customer_email: order.customer_email,
          phone: order.phone, company_name: order.company_name,
          billing_address: order.billing_address, shipping_address: order.shipping_address,
          postal_code: order.postal_code, city: order.city, country: order.country,
          material: order.material, color: order.color, quantity: order.quantity,
          notes: order.notes, print_preferences: order.print_preferences,
          instant_quote_price: order.instant_quote_price, final_price: order.final_price,
          tikkie_link: order.tikkie_link,
          customer_visible_notes: order.customer_visible_notes,
          internal_notes: order.internal_notes,
          submitted_at: order.submitted_at, approved_at: order.approved_at,
          rejected_at: order.rejected_at, created_at: order.created_at,
          updated_at: order.updated_at,
        },
        events: (events || []).map((e: any) => ({
          event_type: e.event_type, event_description: e.event_description,
          visible_to_customer: e.visible_to_customer, created_at: e.created_at,
        })),
        files: fileData,
        file_count: fileData.length,
        exported_at: new Date().toISOString(),
      });
    }

    return new Response(JSON.stringify({ success: true, total_orders: results.length, data: results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

