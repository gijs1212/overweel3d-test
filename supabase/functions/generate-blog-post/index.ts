import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Niet geautoriseerd");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify admin
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) throw new Error("Niet geautoriseerd");

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .single();
    if (!roleData) throw new Error("Geen admin rechten");

    const { topic, keywords } = await req.json();
    if (!topic) throw new Error("Topic is verplicht");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY niet geconfigureerd");

    const systemPrompt = `Je bent een content writer voor Overweel3D, een Nederlandse 3D-printservice. 
Je schrijft informatieve, waardevolle blogartikelen in het Nederlands over 3D-printen.

Regels:
- Schrijf menselijk, behulpzaam en niet "salesy"
- Vermeld Overweel3D alleen subtiel en waar relevant (max 1-2 keer per artikel)
- Focus op het oplossen van echte problemen
- Gebruik een vriendelijke, professionele tone
- Geen keyword stuffing
- Artikelen moeten echt waardevol zijn voor lezers
- Schrijf in markdown formaat

Geef je antwoord als JSON met deze velden:
- title: pakkende titel (max 60 tekens)
- slug: url-friendly slug (lowercase, hyphens)
- meta_description: SEO meta description (max 155 tekens)
- excerpt: korte samenvatting (max 200 tekens)
- content: het volledige artikel in markdown (minimaal 800 woorden)
- tags: array van relevante tags (max 5)`;

    const userPrompt = `Schrijf een blogartikel over: ${topic}${keywords ? `\n\nBelangrijke zoekwoorden om natuurlijk te verwerken: ${keywords}` : ""}`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "create_blog_post",
              description: "Create a blog post with SEO-optimized content",
              parameters: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  slug: { type: "string" },
                  meta_description: { type: "string" },
                  excerpt: { type: "string" },
                  content: { type: "string" },
                  tags: { type: "array", items: { type: "string" } },
                },
                required: ["title", "slug", "meta_description", "excerpt", "content", "tags"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "create_blog_post" } },
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errText);
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Te veel verzoeken, probeer het later opnieuw." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits op, voeg credits toe." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("AI generatie mislukt");
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("AI heeft geen gestructureerd antwoord gegeven");

    const blogPost = JSON.parse(toolCall.function.arguments);

    // Save as draft
    const { data: savedPost, error: saveError } = await adminClient
      .from("blog_posts")
      .insert({
        title: blogPost.title,
        slug: blogPost.slug,
        content: blogPost.content,
        excerpt: blogPost.excerpt,
        meta_description: blogPost.meta_description,
        tags: blogPost.tags,
        status: "draft",
      })
      .select()
      .single();

    if (saveError) throw saveError;

    return new Response(JSON.stringify({ post: savedPost }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
