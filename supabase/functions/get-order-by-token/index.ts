import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { token, action, message, appointmentData, fileId, download = false, registerVisit = true } = await req.json();
    if (typeof token !== "string" || token.length < 32 || token.length > 128) {
      return new Response(JSON.stringify({ error: "Invalid order token" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    const authorization = req.headers.get("Authorization") || "";
    const accessToken = authorization.replace(/^Bearer\s+/i, "");
    const { data: authData } = accessToken
      ? await supabase.auth.getUser(accessToken)
      : { data: { user: null } };
    const { data: requesterIsAdmin } = authData.user
      ? await supabase.rpc("has_role", { _user_id: authData.user.id, _role: "admin" })
      : { data: false };

    // Register an actual page fetch, but not follow-up mutations such as chat or
    // delivery proposals. The SQL function performs first/last/count atomically.
    if (!action && registerVisit !== false) {
      // Opening the preview from the admin dashboard must not masquerade as a
      // customer visit. Anonymous and customer-token requests are registered.
      if (requesterIsAdmin !== true) {
        const { error: visitError } = await supabase.rpc("record_order_link_visit", {
          p_token: token,
        });
        if (visitError) {
          console.error("Unable to register order-link visit:", visitError.message);
          // Visit telemetry must never make a valid customer link unavailable.
        }
      }
    }

    // Handle customer actions through the order token. Inputs are deliberately
    // bounded here because this function uses the service role behind the scenes.
    if (action === "send_message") {
      const normalizedMessage = typeof message === "string" ? message.trim() : "";
      if (!normalizedMessage || normalizedMessage.length > 4_000) {
        return new Response(JSON.stringify({ error: "Bericht moet tussen 1 en 4000 tekens zijn" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { error } = await supabase.from("order_messages").insert({
        order_id: order.id,
        sender_type: "customer",
        sender_id: order.user_id || null,
        message: normalizedMessage,
      });
      if (error) throw error;
      
      // Send notification
      try {
        const fnUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-chat-notification`;
        await fetch(fnUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
          body: JSON.stringify({ orderId: order.id, message: normalizedMessage, senderType: "customer" }),
        });
      } catch (notificationError) {
        console.error("Chat notification failed:", notificationError);
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "propose_delivery") {
      const proposedDate = typeof appointmentData?.date === "string" ? appointmentData.date : "";
      const proposedTimeSlot = typeof appointmentData?.timeSlot === "string" ? appointmentData.timeSlot.trim() : "Overdag";
      const customerNotes = typeof appointmentData?.notes === "string" ? appointmentData.notes.trim() : "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(proposedDate) || proposedTimeSlot.length > 100 || customerNotes.length > 2_000) {
        return new Response(JSON.stringify({ error: "Ongeldig bezorgvoorstel" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { error } = await supabase.from("delivery_appointments").insert({
        order_id: order.id,
        proposed_date: proposedDate,
        proposed_time_slot: proposedTimeSlot || "Overdag",
        proposed_by: "customer",
        customer_notes: customerNotes,
      });
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "get_file_url") {
      if (typeof fileId !== "string" || !/^[0-9a-f-]{36}$/i.test(fileId)) {
        return new Response(JSON.stringify({ error: "Ongeldig bestand" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: file, error: fileError } = await supabase
        .from("order_files")
        .select("storage_path, original_filename")
        .eq("id", fileId)
        .eq("order_id", order.id)
        .eq("customer_visible", true)
        .single();
      if (fileError || !file) {
        return new Response(JSON.stringify({ error: "Bestand niet gevonden" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: signedFile, error: signedFileError } = await supabase.storage
        .from("orders")
        .createSignedUrl(file.storage_path, 120, {
          download: download === true ? file.original_filename : false,
        });
      if (signedFileError || !signedFile?.signedUrl) throw signedFileError || new Error("Bestandslink maken mislukt");
      return new Response(JSON.stringify({ success: true, signedUrl: signedFile.signedUrl }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action) {
      return new Response(JSON.stringify({ error: "Onbekende actie" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch related data
    const [filesRes, eventsRes, messagesRes, appointmentsRes, platesRes] = await Promise.all([
      supabase.from("order_files").select("id, storage_path, original_filename, file_size").eq("order_id", order.id).eq("customer_visible", true),
      supabase.from("order_events").select("id, event_type, event_description, visible_to_customer, created_at").eq("order_id", order.id).eq("visible_to_customer", true).order("created_at", { ascending: false }),
      supabase.from("order_messages").select("id, sender_type, message, created_at, read").eq("order_id", order.id).order("created_at", { ascending: true }),
      supabase.from("delivery_appointments").select("*").eq("order_id", order.id).order("created_at", { ascending: false }),
      supabase.from("order_3mf_plate_mappings")
        .select("logical_plate_number,preview_storage_path,colors")
        .eq("order_id", order.id)
        .eq("active", true)
        .order("logical_plate_number"),
    ]);
    const relatedError = filesRes.error || eventsRes.error || messagesRes.error || appointmentsRes.error || platesRes.error;
    if (relatedError) throw relatedError;

    const selectedPlates = await Promise.all((platesRes.data || []).map(async (plate) => {
      let previewUrl: string | null = null;
      if (plate.preview_storage_path) {
        const { data } = await supabase.storage.from("orders").createSignedUrl(plate.preview_storage_path, 600);
        previewUrl = data?.signedUrl || null;
      }
      return {
        logicalPlateNumber: plate.logical_plate_number,
        previewUrl,
        colors: Array.isArray(plate.colors) ? plate.colors : [],
      };
    }));

    return new Response(JSON.stringify({
      order: {
        ...toCustomerOrder(order),
        linked_to_account: Boolean(order.user_id),
        linked_to_current_user: Boolean(authData.user && order.user_id === authData.user.id),
      },
      files: filesRes.data || [],
      selectedPlates,
      events: eventsRes.data || [],
      messages: messagesRes.data || [],
      appointments: appointmentsRes.data || [],
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown order-token error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// Never return admin-only notes, costing helpers or email-delivery state from a
// bearer customer link. Keep this allow-list aligned with OrderDetail's model.
function toCustomerOrder(order: Record<string, unknown>) {
  const allowedFields = [
    "id", "order_number", "customer_email", "customer_name",
    "material", "color", "quantity", "notes", "instant_quote_price",
    "final_price", "tikkie_link", "status", "customer_visible_notes",
    "customer_order_token", "submitted_at", "approved_at", "rejected_at",
    "billing_address", "shipping_address", "postal_code", "city", "country",
    "order_method", "file_links", "total_products", "total_plates",
    "plate_print_statuses", "plate_runs_required_per_plate",
    "shipping_carrier", "tracking_code", "shipping_cost",
    "customer_upload_requested", "customer_upload_request_note",
  ] as const;

  return Object.fromEntries(
    allowedFields.map((field) => [field, order[field]])
  );
}
