/**
 * Genera docs/demo-posta.pdf con credenciales y guía para la demo.
 * Uso: npm run demo:pdf
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../../docs');
const OUT_FILE = path.join(OUT_DIR, 'demo-posta.pdf');

const BRAND = '#1a3a2a';
const ACCENT = '#2e6b45';
const MUTED = '#5a6b62';
const LIGHT = '#f4f7f5';

type Row = [string, string, string];

const ADMIN_ROWS: Row[] = [
  ['logistica', 'logistica123', 'Admin de agencia — panel completo (recomendado para demo)'],
];

const VENDOR_ROWS: Row[] = [
  ['admin', 'admin123', 'Lupo Ventas (Local)'],
  ['moda-norte', 'vendor123', 'Moda Norte Boutique'],
  ['tech-ba', 'vendor123', 'TechBA Electro'],
  ['hogar-shop', 'vendor123', 'Hogar & Deco Shop'],
  ['fitness-pro', 'vendor123', 'Fitness Pro Store'],
  ['gourmet-ba', 'vendor123', 'Gourmet BA'],
  ['pet-corner', 'vendor123', 'Pet Corner'],
];

const REPARTIDOR_ROWS: Row[] = [
  ['carlos', 'carlos123', 'Zona sur'],
  ['maria', 'maria123', 'Zona norte'],
  ['juan', 'juan123', 'Zona oeste'],
];

const FEATURED_ORDERS = [
  ['DEMO-2001', 'Moda Norte Boutique', 'En reparto', 'Carlos Gómez', 'Recoleta'],
  ['DEMO-2002', 'TechBA Electro', 'Asignado', 'María Rodríguez', 'Belgrano'],
  ['DEMO-2003', 'Hogar & Deco Shop', 'Pendiente', '—', 'Almagro'],
  ['DEMO-2004', 'Fitness Pro Store', 'Entregado', 'Juan Pérez', 'Puerto Madero'],
];

function drawTable(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  headers: string[],
  rows: Row[],
  colWidths: number[]
): number {
  const rowH = 22;
  const pad = 6;
  let cy = y;

  doc.save();
  doc.rect(x, cy, colWidths.reduce((a, b) => a + b, 0), rowH).fill(BRAND);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9);
  let hx = x;
  headers.forEach((h, i) => {
    doc.text(h, hx + pad, cy + 6, { width: colWidths[i] - pad * 2 });
    hx += colWidths[i];
  });
  cy += rowH;

  rows.forEach((row, ri) => {
    const bg = ri % 2 === 0 ? '#ffffff' : LIGHT;
    doc.rect(x, cy, colWidths.reduce((a, b) => a + b, 0), rowH).fill(bg);
    doc.fillColor('#1a1a1a').font('Helvetica').fontSize(9);
    let rx = x;
    row.forEach((cell, ci) => {
      doc.text(cell, rx + pad, cy + 6, { width: colWidths[ci] - pad * 2 });
      rx += colWidths[ci];
    });
    cy += rowH;
  });

  doc.strokeColor('#d0ddd4').lineWidth(0.5);
  doc.rect(x, y, colWidths.reduce((a, b) => a + b, 0), cy - y).stroke();
  doc.restore();

  return cy + 14;
}

function sectionTitle(doc: PDFKit.PDFDocument, title: string, y: number): number {
  doc.fillColor(BRAND).font('Helvetica-Bold').fontSize(13).text(title, 50, y);
  doc.moveTo(50, y + 18).lineTo(545, y + 18).strokeColor(ACCENT).lineWidth(1.5).stroke();
  return y + 28;
}

function bullet(doc: PDFKit.PDFDocument, text: string, y: number, indent = 58): number {
  doc.fillColor('#1a1a1a').font('Helvetica').fontSize(10);
  doc.text('•', 50, y);
  doc.text(text, indent, y, { width: 490 });
  return y + doc.heightOfString(text, { width: 490 - indent + 58 }) + 4;
}

function ensureSpace(doc: PDFKit.PDFDocument, needed: number, y: number): number {
  if (y + needed > 740) {
    doc.addPage();
    return 50;
  }
  return y;
}

async function main(): Promise<void> {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const doc = new PDFDocument({ size: 'A4', margin: 50, info: {
    Title: 'Posta — Guía de demo',
    Author: 'Posta',
    Subject: 'Credenciales y datos para demostración',
  }});

  const stream = fs.createWriteStream(OUT_FILE);
  doc.pipe(stream);

  // Portada
  doc.rect(0, 0, 595, 140).fill(BRAND);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(28).text('Posta', 50, 42);
  doc.font('Helvetica').fontSize(13).text('Guía de demostración — perfil multi-vendedor', 50, 78);
  doc.fontSize(10).fillColor('#c8e6d4').text('Lupo Logística (Envíos) · 60 pedidos · 7 vendedores · 3 repartidores', 50, 102);

  let y = 165;

  doc.fillColor(MUTED).font('Helvetica').fontSize(9).text(
    'Documento generado para uso interno en demos comerciales. No compartir contraseñas fuera del entorno de prueba.',
    50,
    y,
    { width: 495 }
  );
  y += 36;

  // Accesos
  y = sectionTitle(doc, 'Accesos al sistema', y);
  doc.fillColor('#1a1a1a').font('Helvetica').fontSize(10);
  const urls = [
    ['Panel web (admin / vendedor)', 'http://localhost:5173'],
    ['API backend', 'http://localhost:4000'],
    ['Seguimiento público', 'http://localhost:5173/seguimiento.html?id=DEMO-2001'],
    ['Simulador GPS', 'POST http://localhost:4000/api/simulator/tick'],
  ];
  for (const [label, url] of urls) {
    doc.font('Helvetica-Bold').text(`${label}: `, 50, y, { continued: true });
    doc.font('Helvetica').fillColor(ACCENT).text(url);
    doc.fillColor('#1a1a1a');
    y += 18;
  }
  y += 8;

  // Login principal
  y = ensureSpace(doc, 120, y);
  y = sectionTitle(doc, 'Login recomendado para la demo', y);
  doc.roundedRect(50, y, 495, 52, 6).fill(LIGHT);
  doc.fillColor(BRAND).font('Helvetica-Bold').fontSize(11).text('Usuario: logistica', 64, y + 12);
  doc.text('Contraseña: logistica123', 64, y + 28);
  doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(
    'Rol: administrador de agencia. Ve los 60 pedidos de todos los vendedores, mapa en vivo y asignaciones.',
    250,
    y + 20,
    { width: 280 }
  );
  y += 68;

  // Admin
  y = ensureSpace(doc, 80, y);
  y = sectionTitle(doc, 'Administrador de agencia', y);
  y = drawTable(doc, 50, y, ['Usuario', 'Contraseña', 'Descripción'], ADMIN_ROWS, [90, 100, 305]);

  // Vendedores
  y = ensureSpace(doc, 200, y);
  y = sectionTitle(doc, 'Vendedores (7 tiendas)', y);
  y = drawTable(doc, 50, y, ['Usuario', 'Contraseña', 'Tienda'], VENDOR_ROWS, [90, 90, 315]);

  // Repartidores
  y = ensureSpace(doc, 120, y);
  y = sectionTitle(doc, 'Repartidores (app móvil)', y);
  y = drawTable(doc, 50, y, ['Usuario', 'Contraseña', 'Zona'], REPARTIDOR_ROWS, [90, 90, 315]);

  // Pedidos
  doc.addPage();
  y = 50;
  y = sectionTitle(doc, 'Resumen de pedidos demo', y);
  doc.fillColor('#1a1a1a').font('Helvetica').fontSize(10);
  const stats = [
    'Total: 60 pedidos (DEMO-2001 a DEMO-2060)',
    'Distribución: ~35 % pendientes · 25 % asignados · 20 % en reparto · 15 % entregados · 5 % cancelados',
    'Ubicaciones: barrios de CABA con coordenadas reales',
    'Historial: cada pedido incluye historial de estados; los en reparto/entregados tienen tracking GPS',
  ];
  for (const s of stats) {
    y = bullet(doc, s, y);
  }
  y += 10;

  y = sectionTitle(doc, 'Pedidos destacados para mostrar en vivo', y);
  y = drawTable(
    doc,
    50,
    y,
    ['ID', 'Vendedor', 'Estado', 'Repartidor', 'Zona'],
    FEATURED_ORDERS,
    [72, 130, 72, 95, 126]
  );

  y = ensureSpace(doc, 180, y);
  y = sectionTitle(doc, 'Guion sugerido (15–20 min)', y);
  const steps = [
    '1. Iniciar sesión con logistica / logistica123 y mostrar el dashboard con todos los pedidos y vendedores.',
    '2. Abrir el mapa en vivo: pedidos en reparto (DEMO-2001) y repartidores con GPS activo.',
    '3. Mostrar un pedido pendiente (DEMO-2003) y asignarlo a un repartidor.',
    '4. Entrar como vendedor (ej. tech-ba / vendor123) y mostrar que solo ve sus propios pedidos.',
    '5. Abrir seguimiento público con DEMO-2001 para el cliente final.',
    '6. En la app móvil, entrar como carlos / carlos123 y mostrar pedidos asignados + GPS.',
    '7. Opcional: ejecutar el simulador GPS (POST /api/simulator/tick) para mover pedidos en reparto.',
  ];
  for (const step of steps) {
    y = ensureSpace(doc, 40, y);
    y = bullet(doc, step, y);
  }

  y = ensureSpace(doc, 100, y);
  y = sectionTitle(doc, 'Cargar / actualizar datos demo', y);
  doc.fillColor('#1a1a1a').font('Helvetica').fontSize(10);
  doc.font('Helvetica-Bold').text('Instalación limpia (borra y recrea todo):', 50, y);
  y += 16;
  doc.font('Courier').fontSize(9).fillColor(ACCENT).text('cd backend && npm run db:reset', 58, y);
  y += 22;
  doc.font('Helvetica-Bold').fillColor('#1a1a1a').fontSize(10).text('Solo recargar seed (sin borrar tablas):', 50, y);
  y += 16;
  doc.font('Courier').fontSize(9).fillColor(ACCENT).text('cd backend && npm run db:seed', 58, y);
  y += 28;
  doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(
    'Agencia demo: Lupo Logística (Envíos) · Punto de salida: Av. Santa Fe 3200, Palermo, CABA',
    50,
    y,
    { width: 495 }
  );

  doc.end();

  await new Promise<void>((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });

  console.log(`PDF generado: ${OUT_FILE}`);
}

main().catch((err) => {
  console.error('Error generando PDF:', err);
  process.exit(1);
});
