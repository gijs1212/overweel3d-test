import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

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

    const url = new URL(req.url);
    const fileId = url.searchParams.get("file_id");
    if (!fileId) throw new Error("file_id is verplicht");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get file metadata
    const { data: file, error: fileError } = await supabase
      .from("order_files")
      .select("*")
      .eq("id", fileId)
      .single();

    if (fileError || !file) throw new Error("Bestand niet gevonden");

    // Download from storage
    const { data: blob, error: downloadError } = await supabase.storage
      .from("orders")
      .download(file.storage_path);

    if (downloadError || !blob) throw new Error("Bestand kon niet worden gedownload");

    // Stream the file back
    const arrayBuffer = await blob.arrayBuffer();

    return new Response(arrayBuffer, {
      headers: {
        ...corsHeaders,
        "Content-Type": file.mime_type || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${file.original_filename}"`,
        "Content-Length": arrayBuffer.byteLength.toString(),
      },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

