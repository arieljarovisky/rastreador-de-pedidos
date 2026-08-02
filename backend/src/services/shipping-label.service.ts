import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import type { Order } from '../types/index.js';
import type { LabelFont } from './seller-branding.service.js';

export const POSTA_ORDER_QR_PREFIX = 'POSTA-ORDER:';

export interface ShippingLabelBranding {
  logoBuffer?: Buffer | null;
  labelFont?: LabelFont;
}

export type LabelSheetLayout = '2x2' | '2x1';

const FONT_MAP: Record<LabelFont, { regular: string; bold: string }> = {
  helvetica: { regular: 'Helvetica', bold: 'Helvetica-Bold' },
  times: { regular: 'Times-Roman', bold: 'Times-Bold' },
  courier: { regular: 'Courier', bold: 'Courier-Bold' },
};

const SHIPPING_TYPE_LABEL: Record<string, string> = {
  flex: 'Flex',
  express: 'Express',
  standard: 'Estándar',
  home: 'Domicilio',
};

/** Tamaño de una etiqueta suelta (≈ 4″ × 6″). */
const LABEL_WIDTH = 288;
const LABEL_HEIGHT = 432;
const LABEL_MARGIN = 18;
const LABEL_CONTENT_WIDTH = LABEL_WIDTH - LABEL_MARGIN * 2;

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const SHEET_MARGIN = 18;
const SHEET_GAP = 10;

const LAYOUT_GRID: Record<LabelSheetLayout, { cols: number; rows: number }> = {
  '2x2': { cols: 2, rows: 2 },
  '2x1': { cols: 2, rows: 1 },
};

function pdfBufferFromDoc(doc: InstanceType<typeof PDFDocument>): Promise<Buffer> {
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  return new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

function drawLabelContent(
  doc: InstanceType<typeof PDFDocument>,
  order: Order,
  qrPng: Buffer,
  branding: ShippingLabelBranding | undefined,
  fonts: { regular: string; bold: string }
): void {
  const hasLogo = Boolean(branding?.logoBuffer);
  const headerHeight = hasLogo ? 42 : 24;

  if (hasLogo && branding?.logoBuffer) {
    doc.image(branding.logoBuffer, LABEL_MARGIN, LABEL_MARGIN, {
      fit: [LABEL_CONTENT_WIDTH - 70, 34],
    });
  } else {
    doc.font(fonts.bold).fontSize(16).fillColor('#1a3a2a').text('Posta', LABEL_MARGIN, LABEL_MARGIN, {
      width: LABEL_CONTENT_WIDTH,
    });
  }
  doc
    .font(fonts.bold)
    .fontSize(11)
    .fillColor('#1a1a1a')
    .text(order.id, LABEL_MARGIN, LABEL_MARGIN, { width: LABEL_CONTENT_WIDTH, align: 'right' });

  doc
    .moveTo(LABEL_MARGIN, LABEL_MARGIN + headerHeight)
    .lineTo(LABEL_WIDTH - LABEL_MARGIN, LABEL_MARGIN + headerHeight)
    .strokeColor('#2e6b45')
    .lineWidth(1)
    .stroke();

  const qrSize = 160;
  const qrX = (LABEL_WIDTH - qrSize) / 2;
  const qrY = LABEL_MARGIN + headerHeight + 12;
  doc.image(qrPng, qrX, qrY, { width: qrSize, height: qrSize });

  let y = qrY + qrSize + 16;

  doc.font(fonts.bold).fontSize(9).fillColor('#5a6b62').text('DESTINATARIO', LABEL_MARGIN, y);
  y += 13;
  doc.font(fonts.bold).fontSize(12).fillColor('#1a1a1a').text(order.clientName, LABEL_MARGIN, y, {
    width: LABEL_CONTENT_WIDTH,
  });
  y += doc.heightOfString(order.clientName, { width: LABEL_CONTENT_WIDTH }) + 2;
  if (order.clientPhone) {
    doc.font(fonts.regular).fontSize(10).fillColor('#1a1a1a').text(order.clientPhone, LABEL_MARGIN, y);
    y += 16;
  }

  y += 6;
  doc.font(fonts.bold).fontSize(9).fillColor('#5a6b62').text('DIRECCIÓN', LABEL_MARGIN, y);
  y += 13;
  doc.font(fonts.regular).fontSize(10).fillColor('#1a1a1a').text(order.address, LABEL_MARGIN, y, {
    width: LABEL_CONTENT_WIDTH,
  });
  y += doc.heightOfString(order.address, { width: LABEL_CONTENT_WIDTH }) + 10;

  if (order.sellerName) {
    doc.font(fonts.bold).fontSize(9).fillColor('#5a6b62').text('VENDEDOR / TIENDA', LABEL_MARGIN, y);
    y += 13;
    doc.font(fonts.regular).fontSize(10).fillColor('#1a1a1a').text(order.sellerName, LABEL_MARGIN, y, {
      width: LABEL_CONTENT_WIDTH,
    });
    y += doc.heightOfString(order.sellerName, { width: LABEL_CONTENT_WIDTH }) + 10;
  }

  const shippingLabel = order.shippingType
    ? SHIPPING_TYPE_LABEL[order.shippingType] ?? order.shippingType
    : null;
  if (shippingLabel) {
    doc.font(fonts.bold).fontSize(9).fillColor('#5a6b62').text(`Envío: ${shippingLabel}`, LABEL_MARGIN, y);
  }
}

/** Genera el PDF de etiqueta propia de Posta (con QR) para pedidos que no vienen de Mercado Libre. */
export async function generatePostaShippingLabelPdf(
  order: Order,
  branding?: ShippingLabelBranding
): Promise<Buffer> {
  const fonts = FONT_MAP[branding?.labelFont ?? 'helvetica'] ?? FONT_MAP.helvetica;
  const qrPayload = `${POSTA_ORDER_QR_PREFIX}${order.id}`;
  const qrPng = await QRCode.toBuffer(qrPayload, { type: 'png', margin: 1, width: 320 });

  const doc = new PDFDocument({ size: [LABEL_WIDTH, LABEL_HEIGHT], margin: LABEL_MARGIN });
  const done = pdfBufferFromDoc(doc);
  drawLabelContent(doc, order, qrPng, branding, fonts);
  doc.end();
  return done;
}

function drawCutGuides(
  doc: InstanceType<typeof PDFDocument>,
  x: number,
  y: number,
  w: number,
  h: number
): void {
  doc.save();
  doc.dash(3, { space: 3 });
  doc.rect(x, y, w, h).strokeColor('#c5c9c6').lineWidth(0.6).stroke();
  doc.undash();
  doc.restore();
}

/**
 * Genera un PDF A4 con varias etiquetas Posta en grilla (para imprimir en hoja común).
 * Layout `2x2` = 4 por página; `2x1` = 2 por página (más grandes).
 */
export async function generatePostaShippingLabelsSheetPdf(
  orders: Order[],
  branding?: ShippingLabelBranding,
  layout: LabelSheetLayout = '2x2'
): Promise<Buffer> {
  if (orders.length === 0) {
    throw new Error('EMPTY_ORDERS');
  }

  const fonts = FONT_MAP[branding?.labelFont ?? 'helvetica'] ?? FONT_MAP.helvetica;
  const { cols, rows } = LAYOUT_GRID[layout] ?? LAYOUT_GRID['2x2'];
  const perPage = cols * rows;

  const usableW = A4_WIDTH - SHEET_MARGIN * 2 - SHEET_GAP * (cols - 1);
  const usableH = A4_HEIGHT - SHEET_MARGIN * 2 - SHEET_GAP * (rows - 1);
  const cellW = usableW / cols;
  const cellH = usableH / rows;
  const scale = Math.min(cellW / LABEL_WIDTH, cellH / LABEL_HEIGHT);
  const drawnW = LABEL_WIDTH * scale;
  const drawnH = LABEL_HEIGHT * scale;

  const qrBuffers = await Promise.all(
    orders.map((order) =>
      QRCode.toBuffer(`${POSTA_ORDER_QR_PREFIX}${order.id}`, {
        type: 'png',
        margin: 1,
        width: 320,
      })
    )
  );

  const doc = new PDFDocument({ size: 'A4', margin: 0 });
  const done = pdfBufferFromDoc(doc);

  orders.forEach((order, index) => {
    const slot = index % perPage;
    if (index > 0 && slot === 0) {
      doc.addPage({ size: 'A4', margin: 0 });
    }

    const col = slot % cols;
    const row = Math.floor(slot / cols);
    const cellX = SHEET_MARGIN + col * (cellW + SHEET_GAP);
    const cellY = SHEET_MARGIN + row * (cellH + SHEET_GAP);
    const offsetX = cellX + (cellW - drawnW) / 2;
    const offsetY = cellY + (cellH - drawnH) / 2;

    drawCutGuides(doc, cellX, cellY, cellW, cellH);

    doc.save();
    doc.translate(offsetX, offsetY);
    doc.scale(scale);
    drawLabelContent(doc, order, qrBuffers[index], branding, fonts);
    doc.restore();
  });

  doc.end();
  return done;
}

export function parseLabelSheetLayout(raw: unknown): LabelSheetLayout {
  if (raw === '2x1' || raw === '2x2') return raw;
  return '2x2';
}
