/**
 * Extrae destinatario y dirección del texto OCR de una etiqueta
 * (Mercado Envíos Flex y formatos similares).
 */
export interface LabelOcrFields {
  address: string | null;
  clientName: string | null;
  reference: string | null;
}

function cleanLine(line: string): string {
  return line.replace(/\s+/g, ' ').trim();
}

function stripLabelPrefix(value: string, labels: RegExp): string {
  return cleanLine(value.replace(labels, ''));
}

/**
 * Une líneas OCR en un bloque usable y busca campos tipados de la etiqueta.
 */
export function parseShippingLabelOcr(rawText: string): LabelOcrFields {
  const text = rawText.replace(/\r/g, '\n');
  const lines = text
    .split('\n')
    .map(cleanLine)
    .filter(Boolean);

  let address: string | null = null;
  let clientName: string | null = null;
  let reference: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const next = lines[i + 1] ?? '';

    // "Direccion Calle Manuel Jose Baez 583" o "Dirección" + línea siguiente
    const dirInline = line.match(/^direcci[oó]n\s*[:.]?\s*(.+)$/i);
    if (dirInline?.[1] && !/^barrio$/i.test(dirInline[1].trim())) {
      address = cleanLine(dirInline[1]);
      continue;
    }
    if (/^direcci[oó]n\s*[:.]?\s*$/i.test(line) && next && !/^barrio$/i.test(next)) {
      address = next;
      continue;
    }

    const destInline = line.match(/^destinatario\s*[:.]?\s*(.+)$/i);
    if (destInline?.[1]) {
      clientName = stripLabelPrefix(destInline[1], /\([^)]*\)\s*$/);
      // quitar nickname entre paréntesis tipo (NAMA885613)
      clientName = cleanLine(clientName.replace(/\([^)]*\)\s*$/, ''));
      continue;
    }
    if (/^destinatario\s*[:.]?\s*$/i.test(line) && next) {
      clientName = cleanLine(next.replace(/\([^)]*\)\s*$/, ''));
      continue;
    }

    const refInline = line.match(/^referencia\s*[:.]?\s*(.+)$/i);
    if (refInline?.[1]) {
      reference = cleanLine(refInline[1].replace(/^referencia\s*[:.]?\s*/i, ''));
      continue;
    }
  }

  // Fallback: calle/avenida con número (evitar dirección del remitente arriba
  // si ya encontramos "Direccion"; si no, tomar la última coincidencia = destinatario).
  if (!address) {
    const streetRe =
      /\b((?:calle|av\.?|avenida|pasaje|pje\.?|ruta|diag\.?|diagonal)\s+[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9 .'-]{3,60}?\s+\d{1,5}[A-Za-z]?)\b/gi;
    const matches = [...text.matchAll(streetRe)].map((m) => cleanLine(m[1]));
    if (matches.length > 0) {
      address = matches[matches.length - 1];
    }
  }

  if (address && reference && !address.toLowerCase().includes(reference.toLowerCase())) {
    address = `${address} · Ref: ${reference}`;
  }

  return {
    address: address || null,
    clientName: clientName || null,
    reference,
  };
}
