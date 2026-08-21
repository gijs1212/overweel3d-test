import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("authorization");
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify the caller is an admin
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader! } } }
    );

    const { data: { user } } = await supabaseUser.auth.getUser();
    if (!user) throw new Error("Niet ingelogd");

    const { data: roleCheck } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .single();

    if (!roleCheck) throw new Error("Geen admin rechten");

    const { order_id } = await req.json();
    if (!order_id) throw new Error("order_id is verplicht");

    const completedAt = new Date().toISOString();

    // Update status to completed with timestamp
    const { error: updateError } = await supabaseAdmin
      .from("orders")
      .update({ status: "completed", completed_at: completedAt })
      .eq("id", order_id);

    if (updateError) throw updateError;

    // Get order details
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("order_number")
      .eq("id", order_id)
      .single();

    // Delete storage files (keep order_files records for metadata)
    const { data: files } = await supabaseAdmin
      .from("order_files")
      .select("storage_path")
      .eq("order_id", order_id);

    if (files && files.length > 0) {
      const paths = files.map((f: any) => f.storage_path);
      await supabaseAdmin.storage.from("orders").remove(paths);
    }

    // Build download URL for n8n
    const baseUrl = Deno.env.get("SUPABASE_URL")!;
    const downloadUrl = `${baseUrl}/functions/v1/export-order`;

    // Upsert into exported_orders for n8n to pick up
    await supabaseAdmin.from("exported_orders").upsert({
      order_id,
      order_number: order?.order_number || "",
      download_url: downloadUrl,
      completed_at: completedAt,
    }, { onConflict: "order_id" });

    // Log event
    await supabaseAdmin.from("order_events").insert({
      order_id,
      event_type: "order_completed",
      event_description: "Bestelling is voltooid en afgerond door admin.",
      visible_to_customer: true,
      performed_by: user.id,
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
