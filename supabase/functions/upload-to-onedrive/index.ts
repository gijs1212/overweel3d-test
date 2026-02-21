import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface CustomerInfo {
  name: string;
  email: string;
  phone?: string;
  address: string;
  postalCode: string;
  city: string;
  notes?: string;
}

interface OrderItem {
  name: string;
  type: "custom" | "prebuilt";
  material?: string;
  color?: string;
  quantity: number;
  price: string;
  stemText?: string;
  dimensions?: { x: number; y: number; z: number };
  volume?: number;
}

interface UploadRequest {
  customer: CustomerInfo;
  items: OrderItem[];
  fileBase64?: string;
  fileName?: string;
}

async function getAccessToken(): Promise<string> {
  const clientId = Deno.env.get("ONEDRIVE_CLIENT_ID");
  const clientSecret = Deno.env.get("ONEDRIVE_CLIENT_SECRET");
  const refreshToken = Deno.env.get("ONEDRIVE_REFRESH_TOKEN");
  const tenantId = Deno.env.get("ONEDRIVE_TENANT_ID") || "common";

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("OneDrive credentials not configured. Please set ONEDRIVE_CLIENT_ID, ONEDRIVE_CLIENT_SECRET, and ONEDRIVE_REFRESH_TOKEN.");
  }

  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
      scope: "https://graph.microsoft.com/.default",
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get access token: ${error}`);
  }

  const data = await response.json();
  return data.access_token;
}

async function createFolder(accessToken: string, parentPath: string, folderName: string): Promise<void> {
  const url = `https://graph.microsoft.com/v1.0/me/drive/root:/${parentPath}:/children`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: folderName,
      folder: {},
      "@microsoft.graph.conflictBehavior": "rename",
    }),
  });

  if (!response.ok && response.status !== 409) {
    const error = await response.text();
    throw new Error(`Failed to create folder "${folderName}": ${error}`);
  }
}

async function uploadFile(accessToken: string, filePath: string, content: Uint8Array | string): Promise<void> {
  const url = `https://graph.microsoft.com/v1.0/me/drive/root:/${filePath}:/content`;

  const body = typeof content === "string" ? new TextEncoder().encode(content) : content;

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/octet-stream",
    },
    body,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to upload file "${filePath}": ${error}`);
  }
}

function generateInfoTxt(customer: CustomerInfo, items: OrderItem[]): string {
  let info = `Volledige naam: ${customer.name}\n`;
  info += `Email: ${customer.email}\n`;
  info += `Telefoon: ${customer.phone || "Niet opgegeven"}\n`;
  info += `Adres: ${customer.address}\n`;
  info += `Postcode: ${customer.postalCode}\n`;
  info += `Woonplaats: ${customer.city}\n`;
  info += `\nOpmerkingen: ${customer.notes || "Geen"}\n`;
  info += `\n--- Bestelling ---\n`;
  
  items.forEach((item, index) => {
    info += `\nProduct ${index + 1}: ${item.name}\n`;
    info += `  Type: ${item.type === "custom" ? "Custom upload" : "Kant-en-klaar"}\n`;
    if (item.material) info += `  Materiaal: ${item.material}\n`;
    if (item.color) info += `  Kleur: ${item.color}\n`;
    if (item.stemText) info += `  Tekst op stam: "${item.stemText}"\n`;
    info += `  Aantal: ${item.quantity}\n`;
    info += `  Prijs: €${item.price}\n`;
    if (item.dimensions) info += `  Afmetingen: ${item.dimensions.x} × ${item.dimensions.y} × ${item.dimensions.z} mm\n`;
    if (item.volume) info += `  Volume: ~${item.volume} cm³\n`;
  });

  return info;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { customer, items, fileBase64, fileName }: UploadRequest = await req.json();

    console.log("Upload to OneDrive request received for:", customer.name, customer.email);

    const accessToken = await getAccessToken();

    // Create folder structure: overweel3d/{email} - {name}
    const sanitizedName = customer.name.replace(/[^a-zA-Z0-9\s-]/g, "").trim();
    const sanitizedEmail = customer.email.replace(/[^a-zA-Z0-9@._-]/g, "");
    const folderName = `${sanitizedEmail} - ${sanitizedName}`;
    const basePath = "overweel3d";

    // Create base folder
    await createFolder(accessToken, "", basePath);

    // Create customer folder
    await createFolder(accessToken, basePath, folderName);

    const customerPath = `${basePath}/${folderName}`;

    // Create and upload info.txt
    const infoContent = generateInfoTxt(customer, items);
    await uploadFile(accessToken, `${customerPath}/info.txt`, infoContent);
    console.log("info.txt uploaded");

    // Upload 3D file if provided
    if (fileBase64 && fileName) {
      const binaryData = Uint8Array.from(atob(fileBase64), c => c.charCodeAt(0));
      await uploadFile(accessToken, `${customerPath}/${fileName}`, binaryData);
      console.log(`${fileName} uploaded`);
    }

    return new Response(JSON.stringify({ success: true, folder: customerPath }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in upload-to-onedrive:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
