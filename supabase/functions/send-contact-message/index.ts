import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "resend";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ContactRequest {
  name: string;
  email: string;
  subject: string;
  message: string;
}

const handler = async (req: Request): Promise<Response> => {
  console.log("Received contact message request");

  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { name, email, subject, message }: ContactRequest = await req.json();
    console.log("Contact from:", name, email);
    console.log("Subject:", subject);

    // Validate required fields
    if (!name || !email || !subject || !message) {
      console.error("Missing required fields");
      throw new Error("Missing required fields");
    }

    const contactDate = new Date().toLocaleString("nl-NL", {
      dateStyle: "full",
      timeStyle: "short",
    });

    // Send notification email to Overweel3D
    const emailResponse = await resend.emails.send({
      from: "Overweel3D <onboarding@resend.dev>",
      to: ["gijsoverweel@gmail.com"],
      reply_to: email,
      subject: `💬 Nieuw bericht: ${subject}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #1B365D; max-width: 600px; margin: 0 auto; }
            .header { background: linear-gradient(135deg, #1B365D 0%, #2d4a7c 100%); padding: 30px; text-align: center; }
            .header h1 { color: white; margin: 0; font-size: 24px; }
            .content { padding: 30px; background: #f8fafc; }
            .section { background: white; border-radius: 12px; padding: 20px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); }
            .section h2 { color: #1B365D; margin-top: 0; font-size: 18px; border-bottom: 2px solid #00b4d8; padding-bottom: 10px; }
            .info { margin-bottom: 15px; }
            .label { color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
            .value { font-weight: 600; color: #1B365D; margin-top: 4px; }
            .message-box { background: #f1f5f9; padding: 20px; border-radius: 8px; border-left: 4px solid #00b4d8; }
            .footer { text-align: center; padding: 20px; color: #64748b; font-size: 12px; }
            .reply-btn { display: inline-block; background: #00b4d8; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 15px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>💬 Nieuw Contactbericht</h1>
          </div>
          <div class="content">
            <div class="section">
              <h2>Van wie?</h2>
              <div class="info">
                <div class="label">Naam</div>
                <div class="value">${name}</div>
              </div>
              <div class="info">
                <div class="label">E-mail</div>
                <div class="value">${email}</div>
              </div>
              <div class="info">
                <div class="label">Onderwerp</div>
                <div class="value">${subject}</div>
              </div>
            </div>

            <div class="section">
              <h2>Bericht</h2>
              <div class="message-box">
                ${message.replace(/\n/g, "<br>")}
              </div>
              <a href="mailto:${email}" class="reply-btn">↩️ Beantwoorden</a>
            </div>

            <div class="section" style="text-align: center;">
              <p style="margin: 0; color: #64748b;">⏰ Ontvangen op</p>
              <p style="margin: 5px 0; font-weight: bold;">${contactDate}</p>
            </div>
          </div>
          <div class="footer">
            <p>Dit bericht is verzonden via het contactformulier op overweel3d.nl</p>
          </div>
        </body>
        </html>
      `,
    });

    console.log("Email sent successfully:", emailResponse);

    return new Response(JSON.stringify({ success: true, emailResponse }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in send-contact-message function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
