import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import type { Order } from '../types/index.js';
import { sellerContactHasContent, type LabelFont, type SellerContact } from './seller-branding.service.js';

export const POSTA_ORDER_QR_PREFIX = 'POSTA-ORDER:';

export interface ShippingLabelBranding {
  logoBuffer?: Buffer | null;
  labelFont?: LabelFont;
  contact?: SellerContact | null;
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

type SocialBrand = 'instagram' | 'facebook' | 'whatsapp';

interface LabelSocialItem {
  brand: SocialBrand | null;
  label: string;
}

interface LabelContactFooter {
  address: string | null;
  socials: LabelSocialItem[];
}

/** Trazos de Simple Icons (MIT), viewBox 24. Un solo color para que se lean al imprimir. */
const SOCIAL_ICON_PATH: Record<SocialBrand, { d: string; color: string }> = {
  instagram: {
    color: '#E1306C',
    d: 'M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077',
  },
  facebook: {
    color: '#1877F2',
    d: 'M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z',
  },
  whatsapp: {
    color: '#25D366',
    d: 'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z',
  },
};

const SOCIAL_ICON = 8;
const SOCIAL_TEXT = 7;
const SOCIAL_ROW = 10;
const SOCIAL_GAP = 6;

function buildContactFooter(contact: SellerContact | null | undefined): LabelContactFooter | null {
  if (!sellerContactHasContent(contact) || !contact) return null;
  const socials: LabelSocialItem[] = [];
  if (contact.instagram) socials.push({ brand: 'instagram', label: `@${contact.instagram}` });
  if (contact.facebook) socials.push({ brand: 'facebook', label: contact.facebook });
  if (contact.tiktok) socials.push({ brand: null, label: `TT @${contact.tiktok}` });
  if (contact.whatsapp) socials.push({ brand: 'whatsapp', label: contact.whatsapp });
  if (!contact.storeAddress && socials.length === 0) return null;
  return { address: contact.storeAddress, socials };
}

function socialItemWidth(doc: InstanceType<typeof PDFDocument>, item: LabelSocialItem): number {
  const text = doc.widthOfString(item.label);
  return (item.brand ? SOCIAL_ICON + 1.6 : 0) + text;
}

function layoutSocialRows(
  doc: InstanceType<typeof PDFDocument>,
  font: string,
  items: LabelSocialItem[]
): LabelSocialItem[][] {
  if (items.length === 0) return [];
  doc.font(font).fontSize(SOCIAL_TEXT);
  const rows: LabelSocialItem[][] = [[]];
  let x = 0;
  for (const item of items) {
    const width = socialItemWidth(doc, item);
    const row = rows[rows.length - 1];
    if (row.length > 0 && x + width > LABEL_CONTENT_WIDTH) {
      rows.push([item]);
      x = width + SOCIAL_GAP;
    } else {
      row.push(item);
      x += width + SOCIAL_GAP;
    }
  }
  return rows;
}

function drawSocialIcon(
  doc: InstanceType<typeof PDFDocument>,
  brand: SocialBrand,
  x: number,
  y: number
): void {
  const icon = SOCIAL_ICON_PATH[brand];
  doc.save();
  doc.translate(x, y);
  doc.scale(SOCIAL_ICON / 24);
  doc.path(icon.d).fill(icon.color);
  doc.restore();
}

function measureFooter(
  doc: InstanceType<typeof PDFDocument>,
  font: string,
  footer: LabelContactFooter | null
): number {
  if (!footer) return 0;
  doc.font(font).fontSize(SOCIAL_TEXT);
  let height = 8;
  if (footer.address) {
    height += doc.heightOfString(footer.address, { width: LABEL_CONTENT_WIDTH }) + 1;
  }
  const rows = layoutSocialRows(doc, font, footer.socials);
  if (rows.length > 0) height += rows.length * SOCIAL_ROW;
  return height;
}

function drawContactFooter(
  doc: InstanceType<typeof PDFDocument>,
  font: string,
  footer: LabelContactFooter | null,
  footerHeight: number
): void {
  if (!footer || footerHeight <= 0) return;
  let y = LABEL_HEIGHT - LABEL_MARGIN - footerHeight;
  doc
    .moveTo(LABEL_MARGIN, y)
    .lineTo(LABEL_WIDTH - LABEL_MARGIN, y)
    .strokeColor('#c5c9c6')
    .lineWidth(0.6)
    .stroke();
  y += 4;
  doc.font(font).fontSize(SOCIAL_TEXT).fillColor('#5a6b62');
  if (footer.address) {
    doc.text(footer.address, LABEL_MARGIN, y, { width: LABEL_CONTENT_WIDTH });
    y += doc.heightOfString(footer.address, { width: LABEL_CONTENT_WIDTH }) + 1;
  }
  for (const row of layoutSocialRows(doc, font, footer.socials)) {
    let x = LABEL_MARGIN;
    for (const item of row) {
      if (item.brand) {
        drawSocialIcon(doc, item.brand, x, y + (SOCIAL_ROW - SOCIAL_ICON) / 2 - 1);
        x += SOCIAL_ICON + 1.6;
      }
      doc.font(font).fontSize(SOCIAL_TEXT).fillColor('#5a6b62');
      doc.text(item.label, x, y + 1, { lineBreak: false });
      x += doc.widthOfString(item.label) + SOCIAL_GAP;
    }
    y += SOCIAL_ROW;
  }
}

function drawLabelContent(
  doc: InstanceType<typeof PDFDocument>,
  order: Order,
  qrPng: Buffer,
  branding: ShippingLabelBranding | undefined,
  fonts: { regular: string; bold: string }
): void {
  const footer = buildContactFooter(branding?.contact);
  const footerHeight = measureFooter(doc, fonts.regular, footer);
  const hasLogo = Boolean(branding?.logoBuffer);
  const headerHeight = hasLogo ? 42 : 24;
  const qrSize = footerHeight > 0 ? 124 : 160;

  if (hasLogo && branding?.logoBuffer) {
    doc.image(branding.logoBuffer, LABEL_MARGIN, LABEL_MARGIN, {
      fit: [LABEL_CONTENT_WIDTH - 70, 34],
    });
  } else {
    doc.font(fonts.bold).fontSize(16).fillColor('#1a3a2a').text('Posta', LABEL_MARGIN, LABEL_MARGIN, {
      width: LABEL_CONTENT_WIDTH,
    });
  }
  const headerRight = order.publicTrackingCode || order.id;
  doc
    .font(fonts.bold)
    .fontSize(11)
    .fillColor('#1a1a1a')
    .text(headerRight, LABEL_MARGIN, LABEL_MARGIN, { width: LABEL_CONTENT_WIDTH, align: 'right' });

  doc
    .moveTo(LABEL_MARGIN, LABEL_MARGIN + headerHeight)
    .lineTo(LABEL_WIDTH - LABEL_MARGIN, LABEL_MARGIN + headerHeight)
    .strokeColor('#2e6b45')
    .lineWidth(1)
    .stroke();

  const qrX = (LABEL_WIDTH - qrSize) / 2;
  const qrY = LABEL_MARGIN + headerHeight + (footerHeight > 0 ? 8 : 12);
  doc.image(qrPng, qrX, qrY, { width: qrSize, height: qrSize });

  let y = qrY + qrSize + (footerHeight > 0 ? 8 : 16);
  const contentBottom = LABEL_HEIGHT - LABEL_MARGIN - footerHeight - 4;

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

  const storeName = branding?.contact?.displayName?.trim();
  if (storeName) {
    doc.font(fonts.bold).fontSize(9).fillColor('#5a6b62').text('VENDEDOR / TIENDA', LABEL_MARGIN, y);
    y += 13;
    doc.font(fonts.regular).fontSize(10).fillColor('#1a1a1a').text(storeName, LABEL_MARGIN, y, {
      width: LABEL_CONTENT_WIDTH,
    });
    y += doc.heightOfString(storeName, { width: LABEL_CONTENT_WIDTH }) + 10;
  }

  const shippingLabel = order.shippingType
    ? SHIPPING_TYPE_LABEL[order.shippingType] ?? order.shippingType
    : null;
  if (shippingLabel) {
    doc.font(fonts.bold).fontSize(9).fillColor('#5a6b62').text(`Envío: ${shippingLabel}`, LABEL_MARGIN, y);
    y += 14;
  }

  if (order.publicTrackingCode && y < contentBottom) {
    doc.font(fonts.bold).fontSize(9).fillColor('#5a6b62').text('SEGUIMIENTO', LABEL_MARGIN, y);
    y += 13;
    doc
      .font(fonts.bold)
      .fontSize(12)
      .fillColor('#1a1a1a')
      .text(order.publicTrackingCode, LABEL_MARGIN, y, { width: LABEL_CONTENT_WIDTH });
    if (order.id !== order.publicTrackingCode && y + 16 < contentBottom) {
      y += 16;
      doc.font(fonts.regular).fontSize(8).fillColor('#5a6b62').text(order.id, LABEL_MARGIN, y);
    }
  }

  drawContactFooter(doc, fonts.regular, footer, footerHeight);
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
