/**
 * Convierte el payload crudo del QR (p. ej. JSON de ML Flex) en una etiqueta legible.
 * Los QR de Flex suelen ser `{"id":"474…","sender_id":…,"hash_code":"…"}`.
 */
export function formatScanCodeLabel(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';

  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      const id = parsed.id ?? parsed.shipment_id ?? parsed.shipping_id ?? parsed.order_id;
      if (id != null && String(id).trim()) {
        return String(id).trim();
      }
    } catch {
      // seguir con heurísticas
    }
  }

  if (trimmed.length <= 40) return trimmed;

  const digits = trimmed.match(/\d{8,}/);
  if (digits?.[0]) return digits[0];

  return `${trimmed.slice(0, 12)}…${trimmed.slice(-8)}`;
}

/** Quita "· Ref: …" / "Referencia: …" de una dirección guardada o leída por OCR. */
export function stripAddressReference(address: string): string {
  return address
    .replace(/\s*[·•]\s*Ref(?:erencia)?\s*:.+$/i, '')
    .replace(/\s+Ref(?:erencia)?\s*:.+$/i, '')
    .replace(/\s+Referencia\s*:.+$/i, '')
    .trim();
}
