import { describe, expect, it } from "vitest";
// The Appwrite runtime is intentionally plain ESM JavaScript.
// @ts-expect-error no declaration file is shipped into the Function bundle
import { renderEmail } from "../../appwrite/functions/overweel3d-api/src/email.js";

describe("Overweel3D e-mailopmaak", () => {
  it("maakt een complete mobielvriendelijke mail met CTA en fallbacklink", () => {
    const html = renderEmail({
      subject: "Bestelling OW3D-00042 is voltooid",
      contentHtml: "<p>Uw bestelling is klaar.</p>",
      ctaUrl: "https://overweel3d.gijsoverweel.nl/order/veilig-token",
      ctaLabel: "Bestelling bekijken",
    });

    expect(html).toContain('<meta name="viewport"');
    expect(html).toContain("OVERWEEL3D");
    expect(html).toContain("Bestelling bekijken");
    expect(html).toContain("/order/veilig-token");
    expect(html).toContain("Werkt de knop niet?");
  });

  it("escapet onderwerp en knopgegevens", () => {
    const html = renderEmail({
      subject: '<script>alert("x")</script>',
      contentHtml: "<p>Veilige, vooraf opgebouwde inhoud.</p>",
      ctaUrl: 'https://example.test/?q="test"',
      ctaLabel: "Open <nu>",
    });

    expect(html).not.toContain('<script>alert("x")</script>');
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Open &lt;nu&gt;");
    expect(html).toContain("&quot;test&quot;");
  });
});
