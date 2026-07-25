import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import type { Order } from '../types/index.js';

export const POSTA_ORDER_QR_PREFIX = 'POSTA-ORDER:';

const SHIPPING_TYPE_LABEL: Record<string, string> = {
  flex: 'Flex',
  express: 'Express',
  standard: 'Estándar',
  home: 'Domicilio',
};

const PAGE_WIDTH = 288;
const PAGE_HEIGHT = 432;
const MARGIN = 18;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

/** Genera el PDF de etiqueta propia de Posta (con QR) para pedidos que no vienen de Mercado Libre. */
export async function generatePostaShippingLabelPdf(order: Order): Promise<Buffer> {
  const qrPayload = `${POSTA_ORDER_QR_PREFIX}${order.id}`;
  const qrPng = await QRCode.toBuffer(qrPayload, { type: 'png', margin: 1, width: 320 });

  const doc = new PDFDocument({ size: [PAGE_WIDTH, PAGE_HEIGHT], margin: MARGIN });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  doc.font('Helvetica-Bold').fontSize(16).fillColor('#1a3a2a').text('Posta', MARGIN, MARGIN, {
    continued: true,
    width: CONTENT_WIDTH,
  });
  doc
    .font('Helvetica-Bold')
    .fontSize(11)
    .fillColor('#1a1a1a')
    .text(order.id, { align: 'right' });

  doc.moveTo(MARGIN, MARGIN + 24).lineTo(PAGE_WIDTH - MARGIN, MARGIN + 24).strokeColor('#2e6b45').lineWidth(1).stroke();

  const qrSize = 160;
  const qrX = (PAGE_WIDTH - qrSize) / 2;
  const qrY = MARGIN + 36;
  doc.image(qrPng, qrX, qrY, { width: qrSize, height: qrSize });

  let y = qrY + qrSize + 16;

  doc.font('Helvetica-Bold').fontSize(9).fillColor('#5a6b62').text('DESTINATARIO', MARGIN, y);
  y += 13;
  doc.font('Helvetica-Bold').fontSize(12).fillColor('#1a1a1a').text(order.clientName, MARGIN, y, { width: CONTENT_WIDTH });
  y += doc.heightOfString(order.clientName, { width: CONTENT_WIDTH }) + 2;
  if (order.clientPhone) {
    doc.font('Helvetica').fontSize(10).fillColor('#1a1a1a').text(order.clientPhone, MARGIN, y);
    y += 16;
  }

  y += 6;
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#5a6b62').text('DIRECCIÓN', MARGIN, y);
  y += 13;
  doc.font('Helvetica').fontSize(10).fillColor('#1a1a1a').text(order.address, MARGIN, y, { width: CONTENT_WIDTH });
  y += doc.heightOfString(order.address, { width: CONTENT_WIDTH }) + 10;

  if (order.sellerName) {
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#5a6b62').text('VENDEDOR / TIENDA', MARGIN, y);
    y += 13;
    doc.font('Helvetica').fontSize(10).fillColor('#1a1a1a').text(order.sellerName, MARGIN, y, { width: CONTENT_WIDTH });
    y += doc.heightOfString(order.sellerName, { width: CONTENT_WIDTH }) + 10;
  }

  const shippingLabel = order.shippingType ? SHIPPING_TYPE_LABEL[order.shippingType] ?? order.shippingType : null;
  if (shippingLabel) {
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#5a6b62').text(`Envío: ${shippingLabel}`, MARGIN, y);
    y += 14;
  }

  doc.end();
  return done;
}
