import { env } from '../config/env.js';

export interface SendMailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Envía correo transaccional vía Resend.
 * Sin RESEND_API_KEY: solo registra en consola (útil en desarrollo local).
 */
export async function sendMail(input: SendMailInput): Promise<{ sent: boolean }> {
  const apiKey = env.mail.resendApiKey;
  if (!apiKey) {
    console.warn(
      `[mail] RESEND_API_KEY no configurada. Correo a ${input.to} no enviado.\n` +
        `Asunto: ${input.subject}\n` +
        (input.text ? `${input.text}\n` : '')
    );
    return { sent: false };
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.mail.from,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`[mail] Resend error ${res.status}: ${body}`);
    throw new Error('MAIL_SEND_FAILED');
  }

  return { sent: true };
}
