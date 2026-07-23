import { env } from '../config/env.js';

/** Escapa texto para HTML de correo. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface TransactionalEmailContent {
  preheader: string;
  greetingName?: string | null;
  title: string;
  bodyHtml: string;
  ctaLabel: string;
  ctaUrl: string;
  expiryNote: string;
  ignoreNote: string;
}

/**
 * Plantilla transaccional con branding Posta (tema papel + CTA stamp).
 * Tablas + estilos inline para clientes de correo.
 */
export function buildTransactionalEmailHtml(content: TransactionalEmailContent): string {
  const base = env.frontendUrl.replace(/\/$/, '');
  const logoUrl = `${base}/icon-posta-email.png`;
  const siteUrl = base || 'https://www.enviosposta.com.ar';
  const name = content.greetingName?.trim()
    ? ` ${escapeHtml(content.greetingName.trim())}`
    : '';
  const safeUrl = escapeHtml(content.ctaUrl);
  const preheader = escapeHtml(content.preheader);

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${escapeHtml(content.title)}</title>
  <!--[if mso]>
  <style type="text/css">
    body, table, td { font-family: Arial, Helvetica, sans-serif !important; }
  </style>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#efe7d8;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#efe7d8;">
    ${preheader}
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#efe7d8;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:#f6f0e4;border:1px solid #d8ccb5;border-radius:5px;">
          <tr>
            <td style="background-color:#141210;padding:20px 28px;border-radius:5px 5px 0 0;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="vertical-align:middle;padding-right:10px;">
                    <a href="${escapeHtml(siteUrl)}" style="text-decoration:none;">
                      <img src="${escapeHtml(logoUrl)}" width="36" height="36" alt="Posta" style="display:block;border:0;border-radius:5px;">
                    </a>
                  </td>
                  <td style="vertical-align:middle;">
                    <a href="${escapeHtml(siteUrl)}" style="font-family:'Bricolage Grotesque','IBM Plex Sans',Helvetica,Arial,sans-serif;font-size:22px;font-weight:700;letter-spacing:-0.03em;color:#ede6d8;text-decoration:none;">
                      Posta
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="height:4px;background-color:#d8401e;font-size:0;line-height:0;">&nbsp;</td>
          </tr>
          <tr>
            <td style="padding:32px 28px 8px;font-family:'IBM Plex Sans',Helvetica,Arial,sans-serif;color:#1c1814;">
              <p style="margin:0 0 8px;font-size:14px;line-height:1.5;color:#897c68;">Hola${name},</p>
              <h1 style="margin:0 0 16px;font-family:'Bricolage Grotesque','IBM Plex Sans',Helvetica,Arial,sans-serif;font-size:24px;line-height:1.25;font-weight:700;letter-spacing:-0.03em;color:#1c1814;">
                ${escapeHtml(content.title)}
              </h1>
              <div style="margin:0 0 28px;font-size:16px;line-height:1.55;color:#544a3c;">
                ${content.bodyHtml}
              </div>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px;">
                <tr>
                  <td align="center" bgcolor="#d8401e" style="border-radius:5px;background-color:#d8401e;">
                    <a href="${safeUrl}" style="display:inline-block;padding:14px 28px;font-family:'IBM Plex Sans',Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;line-height:1;color:#ffffff;text-decoration:none;border-radius:5px;">
                      ${escapeHtml(content.ctaLabel)}
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px;font-size:14px;line-height:1.5;color:#897c68;">
                ${escapeHtml(content.expiryNote)}
              </p>
              <p style="margin:0 0 24px;font-size:14px;line-height:1.5;color:#897c68;">
                ${escapeHtml(content.ignoreNote)}
              </p>
              <p style="margin:0;padding-top:20px;border-top:1px solid #d8ccb5;font-size:12px;line-height:1.5;color:#a99b85;word-break:break-all;">
                Si el botón no funciona, copiá esta URL:<br>
                <a href="${safeUrl}" style="color:#2b3a55;text-decoration:underline;">${safeUrl}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 28px 28px;font-family:'IBM Plex Sans',Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:#a99b85;">
              <a href="${escapeHtml(siteUrl)}" style="color:#897c68;text-decoration:none;">enviosposta.com.ar</a>
              &nbsp;·&nbsp; Correo automático — no respondas a este mensaje.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
