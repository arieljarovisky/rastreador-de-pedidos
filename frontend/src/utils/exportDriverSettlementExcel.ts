/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import ExcelJS from 'exceljs';
import type { DriverLedgerEntry, DriverSettlementSummary } from '../types.js';
import { formatOperationalDateShort } from './deliverySummary.js';

/** Paleta light de la landing Posta */
const POSTA = {
  paper: 'EFE7D8',
  paper2: 'F6F0E4',
  paper3: 'E7DDCB',
  edge: 'D8CCB5',
  ink: '1C1814',
  ink2: '544A3C',
  ink3: '897C68',
  stamp: 'D8401E',
  stamp2: 'A82E13',
  route: '2B3A55',
  route2: '5A6B85',
  ok: '2E6B45',
  warn: 'B5670E',
  white: 'FFFFFF',
} as const;

const thinEdge: Partial<ExcelJS.Border> = {
  style: 'thin',
  color: { argb: `FF${POSTA.edge}` },
};

const bordersAll: Partial<ExcelJS.Borders> = {
  top: thinEdge,
  left: thinEdge,
  bottom: thinEdge,
  right: thinEdge,
};

function entryTypeLabel(type: DriverLedgerEntry['entryType']): string {
  if (type === 'earning') return 'Devengo';
  if (type === 'payment') return 'Liquidación';
  return 'Ajuste';
}

function shippingTypeLabel(type: string): string {
  if (type === 'flex') return 'Mercado Libre Flex';
  if (type === 'express') return 'Tienda Nube Express';
  return 'Carga manual';
}

function periodLabel(summary: DriverSettlementSummary): string {
  return `${formatOperationalDateShort(summary.dateFrom)} — ${formatOperationalDateShort(summary.dateTo)}`;
}

function moneyNum(n: number): number {
  return Math.round(n * 100) / 100;
}

function safeFilenamePart(name: string): string {
  return (
    name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase() || 'repartidor'
  );
}

async function downloadWorkbook(workbook: ExcelJS.Workbook, filename: string) {
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function styleSheetCanvas(sheet: ExcelJS.Worksheet) {
  sheet.properties.defaultRowHeight = 18;
  sheet.views = [{ state: 'frozen', ySplit: 3, showGridLines: false }];
}

function paintRow(row: ExcelJS.Row, fillArgb: string) {
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: fillArgb },
    };
  });
}

function addBrandHeader(
  sheet: ExcelJS.Worksheet,
  title: string,
  subtitle: string,
  colCount: number
) {
  const lastCol = colCount;

  sheet.mergeCells(1, 1, 1, lastCol);
  const brand = sheet.getCell(1, 1);
  brand.value = 'POSTA';
  brand.font = {
    name: 'Arial',
    size: 16,
    bold: true,
    color: { argb: `FF${POSTA.white}` },
  };
  brand.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: `FF${POSTA.stamp}` },
  };
  brand.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  sheet.getRow(1).height = 28;

  sheet.mergeCells(2, 1, 2, lastCol);
  const titleCell = sheet.getCell(2, 1);
  titleCell.value = title;
  titleCell.font = {
    name: 'Arial',
    size: 12,
    bold: true,
    color: { argb: `FF${POSTA.ink}` },
  };
  titleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: `FF${POSTA.paper2}` },
  };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  sheet.getRow(2).height = 22;

  sheet.mergeCells(3, 1, 3, lastCol);
  const sub = sheet.getCell(3, 1);
  sub.value = subtitle;
  sub.font = {
    name: 'Consolas',
    size: 9,
    color: { argb: `FF${POSTA.ink3}` },
  };
  sub.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: `FF${POSTA.paper3}` },
  };
  sub.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  sheet.getRow(3).height = 18;
}

function styleHeaderRow(row: ExcelJS.Row) {
  row.height = 20;
  row.eachCell((cell) => {
    cell.font = {
      name: 'Consolas',
      size: 9,
      bold: true,
      color: { argb: `FF${POSTA.white}` },
    };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: `FF${POSTA.route}` },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
    cell.border = bordersAll;
  });
}

function styleDataCell(
  cell: ExcelJS.Cell,
  opts?: { money?: boolean; align?: 'left' | 'right' | 'center'; bold?: boolean; color?: string }
) {
  cell.font = {
    name: 'Arial',
    size: 10,
    bold: opts?.bold ?? false,
    color: { argb: `FF${opts?.color ?? POSTA.ink}` },
  };
  cell.border = bordersAll;
  cell.alignment = {
    vertical: 'middle',
    horizontal: opts?.align ?? (opts?.money ? 'right' : 'left'),
  };
  if (opts?.money) {
    cell.numFmt = '"$"#,##0';
  }
}

function autosize(sheet: ExcelJS.Worksheet, widths: number[]) {
  widths.forEach((w, i) => {
    sheet.getColumn(i + 1).width = w;
  });
}

function addResumenSheet(
  workbook: ExcelJS.Workbook,
  summary: DriverSettlementSummary,
  title: string,
  extraRows: Array<{
    label: string;
    value: string | number;
    money?: boolean;
    tone?: 'stamp' | 'ok' | 'warn' | 'route';
  }> = []
) {
  const sheet = workbook.addWorksheet('Resumen', {
    properties: { tabColor: { argb: `FF${POSTA.stamp}` } },
  });
  styleSheetCanvas(sheet);
  addBrandHeader(sheet, title, `Período ${periodLabel(summary)} · Liquidación de flota`, 2);
  autosize(sheet, [32, 28]);

  const header = sheet.getRow(5);
  header.values = ['Concepto', 'Valor'];
  styleHeaderRow(header);

  const rows: Array<{
    label: string;
    value: string | number;
    money?: boolean;
    tone?: 'stamp' | 'ok' | 'warn' | 'route';
  }> = [
    ...extraRows,
    { label: 'Devengado en el período', value: moneyNum(summary.totalEarned), money: true, tone: 'route' },
    { label: 'Liquidado en el período', value: moneyNum(summary.totalPaid), money: true, tone: 'ok' },
    {
      label: 'Saldo a pagar',
      value: moneyNum(summary.balance),
      money: true,
      tone: summary.balance > 0 ? 'warn' : 'ok',
    },
    { label: 'Entregas', value: summary.deliveredShipments, tone: 'route' },
  ];

  rows.forEach((item, index) => {
    const excelRow = sheet.getRow(6 + index);
    excelRow.values = [item.label, item.value];
    paintRow(excelRow, index % 2 === 0 ? `FF${POSTA.paper2}` : `FF${POSTA.white}`);
    styleDataCell(excelRow.getCell(1), { color: POSTA.ink2 });
    const toneColor =
      item.tone === 'stamp'
        ? POSTA.stamp
        : item.tone === 'ok'
          ? POSTA.ok
          : item.tone === 'warn'
            ? POSTA.warn
            : POSTA.route;
    styleDataCell(excelRow.getCell(2), {
      money: item.money,
      bold: true,
      color: typeof item.value === 'number' ? toneColor : POSTA.ink,
      align: item.money || typeof item.value === 'number' ? 'right' : 'left',
    });
    if (!item.money && typeof item.value === 'string') {
      excelRow.getCell(2).numFmt = undefined;
    }
  });

  return sheet;
}

function addRepartidoresSheet(workbook: ExcelJS.Workbook, summary: DriverSettlementSummary) {
  const sheet = workbook.addWorksheet('Por repartidor', {
    properties: { tabColor: { argb: `FF${POSTA.route}` } },
  });
  styleSheetCanvas(sheet);
  addBrandHeader(
    sheet,
    'Liquidación por repartidor',
    `Período ${periodLabel(summary)} · Flota`,
    4
  );
  autosize(sheet, [28, 18, 16, 14]);

  const header = sheet.getRow(5);
  header.values = ['Repartidor', 'Devengado', 'Saldo a pagar', 'Entregas'];
  styleHeaderRow(header);

  const repartidores = summary.repartidores ?? [];
  if (repartidores.length === 0) {
    const empty = sheet.getRow(6);
    empty.values = ['Sin datos en el período', '', '', ''];
    paintRow(empty, `FF${POSTA.paper2}`);
    styleDataCell(empty.getCell(1), { color: POSTA.ink3 });
    return sheet;
  }

  repartidores.forEach((row, index) => {
    const excelRow = sheet.getRow(6 + index);
    excelRow.values = [
      row.repartidorName,
      moneyNum(row.totalEarned),
      moneyNum(row.balance),
      row.deliveredShipments,
    ];
    paintRow(excelRow, index % 2 === 0 ? `FF${POSTA.paper2}` : `FF${POSTA.white}`);
    styleDataCell(excelRow.getCell(1));
    styleDataCell(excelRow.getCell(2), { money: true, color: POSTA.route, bold: true });
    styleDataCell(excelRow.getCell(3), {
      money: true,
      color: row.balance > 0 ? POSTA.warn : POSTA.ok,
      bold: true,
    });
    styleDataCell(excelRow.getCell(4), { align: 'center', color: POSTA.ink2 });
  });

  return sheet;
}

function addShippingTypesSheet(workbook: ExcelJS.Workbook, summary: DriverSettlementSummary) {
  if (summary.byShippingType.length === 0) return;

  const sheet = workbook.addWorksheet('Por tipo de envío', {
    properties: { tabColor: { argb: `FF${POSTA.ok}` } },
  });
  styleSheetCanvas(sheet);
  addBrandHeader(sheet, 'Pago por tipo de envío', `Período ${periodLabel(summary)}`, 3);
  autosize(sheet, [28, 12, 16]);

  const header = sheet.getRow(5);
  header.values = ['Tipo de envío', 'Cantidad', 'Monto'];
  styleHeaderRow(header);

  summary.byShippingType.forEach((item, index) => {
    const row = sheet.getRow(6 + index);
    row.values = [shippingTypeLabel(item.shippingType), item.count, moneyNum(item.amount)];
    paintRow(row, index % 2 === 0 ? `FF${POSTA.paper2}` : `FF${POSTA.white}`);
    styleDataCell(row.getCell(1));
    styleDataCell(row.getCell(2), { align: 'center', color: POSTA.ink2 });
    styleDataCell(row.getCell(3), { money: true, color: POSTA.stamp, bold: true });
  });
}

function addMovimientosSheet(
  workbook: ExcelJS.Workbook,
  summary: DriverSettlementSummary,
  ledger: DriverLedgerEntry[],
  includeRepartidor: boolean
) {
  const cols = includeRepartidor ? 6 : 5;
  const sheet = workbook.addWorksheet('Movimientos', {
    properties: { tabColor: { argb: `FF${POSTA.warn}` } },
  });
  styleSheetCanvas(sheet);
  addBrandHeader(
    sheet,
    'Movimientos',
    `Período ${periodLabel(summary)} · ${ledger.length} registro${ledger.length === 1 ? '' : 's'}`,
    cols
  );

  if (includeRepartidor) {
    autosize(sheet, [20, 12, 42, 14, 22, 14]);
  } else {
    autosize(sheet, [20, 12, 48, 14, 14]);
  }

  const header = sheet.getRow(5);
  header.values = includeRepartidor
    ? ['Fecha', 'Tipo', 'Descripción', 'Pedido', 'Repartidor', 'Monto']
    : ['Fecha', 'Tipo', 'Descripción', 'Pedido', 'Monto'];
  styleHeaderRow(header);

  if (ledger.length === 0) {
    const empty = sheet.getRow(6);
    empty.values = includeRepartidor
      ? ['Sin movimientos', '', '', '', '', '']
      : ['Sin movimientos', '', '', '', ''];
    paintRow(empty, `FF${POSTA.paper2}`);
    styleDataCell(empty.getCell(1), { color: POSTA.ink3 });
    return;
  }

  ledger.forEach((entry, index) => {
    const amount = entry.entryType === 'payment' ? -moneyNum(entry.amount) : moneyNum(entry.amount);
    const row = sheet.getRow(6 + index);
    const values: Array<string | number> = [
      new Date(entry.createdAt).toLocaleString('es-AR'),
      entryTypeLabel(entry.entryType),
      entry.description,
      entry.orderId ?? '',
    ];
    if (includeRepartidor) values.push(entry.repartidorName ?? entry.repartidorId);
    values.push(amount);
    row.values = values;

    paintRow(row, index % 2 === 0 ? `FF${POSTA.paper2}` : `FF${POSTA.white}`);

    const typeColor =
      entry.entryType === 'payment'
        ? POSTA.ok
        : entry.entryType === 'earning'
          ? POSTA.warn
          : POSTA.route;

    styleDataCell(row.getCell(1), { color: POSTA.ink2 });
    styleDataCell(row.getCell(2), { color: typeColor, bold: true });
    styleDataCell(row.getCell(3));
    styleDataCell(row.getCell(4), { color: POSTA.ink3 });
    if (includeRepartidor) {
      styleDataCell(row.getCell(5), { color: POSTA.route });
      styleDataCell(row.getCell(6), { money: true, color: typeColor, bold: true });
    } else {
      styleDataCell(row.getCell(5), { money: true, color: typeColor, bold: true });
    }
  });
}

/** Agencia: liquidación de todos los repartidores + movimientos del período. */
export async function exportAgencyDriverSettlementExcel(
  summary: DriverSettlementSummary,
  ledger: DriverLedgerEntry[]
) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Posta';
  workbook.created = new Date();
  workbook.company = 'Posta Envios';

  addResumenSheet(workbook, summary, 'Liquidación de repartidores · Agencia');
  addRepartidoresSheet(workbook, summary);
  addShippingTypesSheet(workbook, summary);
  addMovimientosSheet(workbook, summary, ledger, true);

  await downloadWorkbook(
    workbook,
    `posta-liquidacion-repartidores_${summary.dateFrom}_${summary.dateTo}.xlsx`
  );
}

/** Vista filtrada a un repartidor (o el propio repartidor). */
export async function exportDriverSettlementExcel(
  summary: DriverSettlementSummary,
  ledger: DriverLedgerEntry[],
  repartidorLabel?: string | null
) {
  const name = repartidorLabel || summary.repartidorName || 'repartidor';
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Posta';
  workbook.created = new Date();
  workbook.company = 'Posta Envios';

  addResumenSheet(workbook, summary, 'Liquidación de repartidor', [
    { label: 'Repartidor', value: name, tone: 'route' },
  ]);
  addShippingTypesSheet(workbook, summary);
  addMovimientosSheet(workbook, summary, ledger, false);

  await downloadWorkbook(
    workbook,
    `posta-liquidacion-${safeFilenamePart(name)}_${summary.dateFrom}_${summary.dateTo}.xlsx`
  );
}
