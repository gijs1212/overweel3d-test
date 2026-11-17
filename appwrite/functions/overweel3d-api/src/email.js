const SITE_URL = "https://overweel3d.gijsoverweel.nl";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function renderEmail({
  subject,
  contentHtml,
  preheader = subject,
  ctaUrl = SITE_URL,
  ctaLabel = "Naar Overweel3D",
}) {
  const safeSubject = escapeHtml(subject);
  const safePreheader = escapeHtml(preheader);
  const safeUrl = escapeHtml(ctaUrl || SITE_URL);
  const safeLabel = escapeHtml(ctaLabel || "Naar Overweel3D");
  return `<!doctype html>
<html lang="nl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light only">
  <title>${safeSubject}</title>
  <style>
    @media only screen and (max-width:620px){.ow-card{width:100%!important;border-radius:0!important}.ow-pad{padding:28px 22px!important}.ow-title{font-size:28px!important}.ow-button{display:block!important;width:100%!important;box-sizing:border-box!important;text-align:center!important}}
  </style>
</head>
<body style="margin:0;padding:0;background:#f2f2f0;color:#111111;font-family:Arial,'Helvetica Neue',sans-serif;-webkit-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${safePreheader}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f2f2f0;">
    <tr><td align="center" style="padding:32px 12px;">
      <table class="ow-card" role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:600px;max-width:600px;background:#ffffff;border:1px solid #dededb;border-radius:20px;overflow:hidden;box-shadow:0 18px 45px rgba(0,0,0,.08);">
        <tr><td class="ow-pad" style="padding:30px 42px;background:#0a0a0a;color:#ffffff;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
            <td style="font-size:22px;font-weight:800;letter-spacing:3px;white-space:nowrap;"><span style="display:inline-block;margin-right:12px;border:2px solid #fff;padding:5px 7px;font-size:14px;line-height:14px;letter-spacing:0;vertical-align:2px;">O3D</span>OVERWEEL3D</td>
          </tr></table>
        </td></tr>
        <tr><td class="ow-pad" style="padding:44px 42px 38px;">
          <h1 class="ow-title" style="margin:0 0 24px;font-size:34px;line-height:1.18;letter-spacing:-1px;color:#111111;">${safeSubject}</h1>
          <div style="font-size:16px;line-height:1.7;color:#3f3f3b;">${contentHtml}</div>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:32px;"><tr><td style="border-radius:999px;background:#111111;">
            <a class="ow-button" href="${safeUrl}" target="_blank" style="display:inline-block;padding:15px 26px;border-radius:999px;background:#111111;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;letter-spacing:.1px;">${safeLabel} &nbsp;→</a>
          </td></tr></table>
          <p style="margin:28px 0 0;font-size:12px;line-height:1.6;color:#777772;">Werkt de knop niet? Open dan deze link:<br><a href="${safeUrl}" style="color:#111111;word-break:break-all;">${safeUrl}</a></p>
        </td></tr>
        <tr><td class="ow-pad" style="padding:24px 42px;background:#f7f7f5;border-top:1px solid #e7e7e3;color:#686864;font-size:12px;line-height:1.7;">
          <strong style="color:#111111;">Overweel3D</strong><br>Persoonlijk 3D-printwerk, zorgvuldig gemaakt in Nederland.<br>
          <a href="${SITE_URL}" style="color:#111111;text-decoration:none;">overweel3d.gijsoverweel.nl</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export { SITE_URL };
