import { access, mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const labelDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../uploads/labels'
);

function safeOrderId(orderId: string): string {
  return orderId.replace(/[^a-zA-Z0-9_-]/g, '');
}

export async function saveOrderLabel(
  orderId: string,
  body: Buffer,
  ext: 'pdf' | 'jpg'
): Promise<void> {
  const id = safeOrderId(orderId);
  if (!id || body.length < 80) return;
  await mkdir(labelDir, { recursive: true });
  await writeFile(path.join(labelDir, `${id}.${ext}`), body);
}

/** Etiqueta ya guardada en disco: la foto o el PDF de Mercado Libre. */
/** ML ya no entrega el PDF (envío entregado y nunca se había bajado). */
export async function markOrderLabelUnavailable(orderId: string, reason: string): Promise<void> {
  const id = safeOrderId(orderId);
  if (!id) return;
  await mkdir(labelDir, { recursive: true });
  await writeFile(path.join(labelDir, `${id}.unavailable`), reason.slice(0, 240));
}

export async function isOrderLabelUnavailable(orderId: string): Promise<boolean> {
  const id = safeOrderId(orderId);
  if (!id) return false;
  try {
    await access(path.join(labelDir, `${id}.unavailable`));
    return true;
  } catch {
    return false;
  }
}

export async function findSavedOrderLabel(
  orderId: string
): Promise<{ filePath: string; contentType: string; ext: 'pdf' | 'jpg' } | null> {
  const id = safeOrderId(orderId);
  if (!id) return null;
  const candidates = [
    { ext: 'pdf' as const, contentType: 'application/pdf' },
    { ext: 'jpg' as const, contentType: 'image/jpeg' },
  ];
  for (const candidate of candidates) {
    const filePath = path.join(labelDir, `${id}.${candidate.ext}`);
    try {
      await access(filePath);
      return { filePath, contentType: candidate.contentType, ext: candidate.ext };
    } catch {
      // probar el otro formato
    }
  }
  return null;
}
