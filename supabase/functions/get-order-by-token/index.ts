import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { token, action, message, appointmentData } = await req.json();
    if (!token) throw new Error("Token is required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("*")
      .eq("customer_order_token", token)
      .single();

    if (orderError || !order) {
      return new Response(JSON.stringify({ error: "Order not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Handle actions for unauthenticated users
    if (action === "send_message" && message) {
      const { error } = await supabase.from("order_messages").insert({
        order_id: order.id,
        sender_type: "customer",
        sender_id: order.user_id || null,
        message: message,
      });
      if (error) throw error;
      
      // Send notification
      try {
        const fnUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-chat-notification`;
        await fetch(fnUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
          body: JSON.stringify({ orderId: order.id, message, senderType: "customer" }),
        });
      } catch {}

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "propose_delivery" && appointmentData) {
      const { error } = await supabase.from("delivery_appointments").insert({
        order_id: order.id,
        proposed_date: appointmentData.date,
        proposed_time_slot: appointmentData.timeSlot || "Overdag",
        proposed_by: "customer",
        customer_notes: appointmentData.notes || "",
      });
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch related data
    const [filesRes, eventsRes, messagesRes, appointmentsRes] = await Promise.all([
      supabase.from("order_files").select("id, storage_path, original_filename, file_size").eq("order_id", order.id),
      supabase.from("order_events").select("id, event_type, event_description, visible_to_customer, created_at").eq("order_id", order.id).eq("visible_to_customer", true).order("created_at", { ascending: false }),
      supabase.from("order_messages").select("id, sender_type, message, created_at, read").eq("order_id", order.id).order("created_at", { ascending: true }),
      supabase.from("delivery_appointments").select("*").eq("order_id", order.id).order("created_at", { ascending: false }),
    ]);

    return new Response(JSON.stringify({
      order,
      files: filesRes.data || [],
      events: eventsRes.data || [],
      messages: messagesRes.data || [],
      appointments: appointmentsRes.data || [],
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
