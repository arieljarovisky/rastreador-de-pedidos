import { env } from '../config/env.js';

export interface LabelVisionFields {
  address: string | null;
  clientName: string | null;
  clientPhone: string | null;
  reference: string | null;
}

const EMPTY: LabelVisionFields = {
  address: null,
  clientName: null,
  clientPhone: null,
  reference: null,
};

const PROMPT = `Sos un lector de etiquetas de envío de Argentina (Mercado Envíos, Flex, Correo Argentino, Andreani, OCA y similares).
Extraé SOLO los datos del DESTINATARIO. Ignorá remitente, vendedor, depósito y códigos de barras.
Respondé JSON con estas claves:
- address: calle, número, piso o depto si está junto a la calle, barrio y localidad. Sin la palabra "Dirección". null si no se lee una calle.
- clientName: nombre y apellido del destinatario. null si no se lee.
- clientPhone: teléfono del destinatario. null si no está.
- reference: texto de "Referencia" o indicaciones (timbre, portón). null si no está.
No inventes. Si un campo no se ve claro, usá null.`;

export function isLabelVisionConfigured(): boolean {
  return Boolean(env.gemini.apiKey);
}

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value.replace(/\s+/g, ' ').trim();
  if (!text || /^null$/i.test(text) || text === '-' || text === '—') return null;
  return text.slice(0, max);
}

function cleanPhone(value: unknown): string | null {
  const text = cleanText(value, 40);
  if (!text) return null;
  const digits = text.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return null;
  return text;
}

/** Una dirección usable tiene calle y algún número. */
export function addressLooksUsable(address: string | null | undefined): boolean {
  const text = address?.trim() ?? '';
  return text.length >= 6 && /\d/.test(text);
}

export function parseLabelVisionPayload(raw: string): LabelVisionFields {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return EMPTY;
  let data: unknown;
  try {
    data = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return EMPTY;
  }
  if (!data || typeof data !== 'object') return EMPTY;
  const row = data as Record<string, unknown>;
  const address = cleanText(row.address, 180);
  return {
    address: addressLooksUsable(address) ? address : null,
    clientName: cleanText(row.clientName, 80),
    clientPhone: cleanPhone(row.clientPhone),
    reference: cleanText(row.reference, 120),
  };
}

export async function readShippingLabel(
  image: Buffer,
  mimeType: string
): Promise<LabelVisionFields> {
  if (!env.gemini.apiKey) {
    throw new Error('LABEL_AI_UNAVAILABLE');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.gemini.model)}:generateContent`,
      {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': env.gemini.apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: PROMPT },
                {
                  inlineData: {
                    mimeType: mimeType === 'image/png' ? 'image/png' : 'image/jpeg',
                    data: image.toString('base64'),
                  },
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 512,
            responseMimeType: 'application/json',
          },
        }),
      }
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.warn('[label-vision] Gemini respondió', response.status, detail.slice(0, 300));
      throw new Error('LABEL_AI_FAILED');
    }

    const body = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = body.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';
    return parseLabelVisionPayload(text);
  } finally {
    clearTimeout(timer);
  }
}
