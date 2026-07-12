/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as XLSX from 'xlsx';
import type { BillingLedgerEntry, BillingSummary } from '../types.js';
import { formatOperationalDateShort } from './deliverySummary.js';

function entryTypeLabel(type: BillingLedgerEntry['entryType']): string {
  if (type === 'charge') return 'Cargo';
  if (type === 'payment') return 'Pago';
  return 'Ajuste';
}

function shippingTypeLabel(type: string): string {
  if (type === 'flex') return 'Mercado Libre Flex';
  if (type === 'express') return 'Tienda Nube Express';
  return 'Carga manual';
}

function downloadWorkbook(workbook: XLSX.WorkBook, filename: string) {
  const data = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([data], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function periodLabel(summary: BillingSummary): string {
  return `${formatOperationalDateShort(summary.dateFrom)} — ${formatOperationalDateShort(summary.dateTo)}`;
}

function ledgerRows(entries: BillingLedgerEntry[], includeSeller: boolean) {
  return entries.map((entry) => {
    const row: Record<string, string | number> = {
      Fecha: new Date(entry.createdAt).toLocaleString('es-AR'),
      Tipo: entryTypeLabel(entry.entryType),
      Descripción: entry.description,
      Pedido: entry.orderId ?? '',
      Monto: entry.entryType === 'payment' ? -entry.amount : entry.amount,
    };
    if (includeSeller) {
      row.Vendedor = entry.sellerName ?? entry.sellerId;
    }
    return row;
  });
}

/** Agencia: saldos por vendedor + movimientos del período. */
export function exportAgencyBillingExcel(
  summary: BillingSummary,
  ledger: BillingLedgerEntry[]
) {
  const workbook = XLSX.utils.book_new();
  const sellers = summary.sellers ?? [];

  const resumenSheet = XLSX.utils.json_to_sheet([
    { Concepto: 'Período', Valor: periodLabel(summary) },
    { Concepto: 'Gastado en el período', Valor: summary.totalSpent },
    { Concepto: 'Pagos registrados', Valor: summary.totalPaid },
    { Concepto: 'Saldo pendiente', Valor: summary.balance },
    { Concepto: 'Envíos facturados', Valor: summary.chargedShipments },
  ]);
  XLSX.utils.book_append_sheet(workbook, resumenSheet, 'Resumen');

  const sellersSheet = XLSX.utils.json_to_sheet(
    sellers.length > 0
      ? sellers.map((s) => ({
          Vendedor: s.sellerName,
          'Gastado en el período': s.totalSpent,
          'Saldo pendiente': s.balance,
          'Envíos facturados': s.chargedShipments,
        }))
      : [{ Vendedor: '', 'Gastado en el período': 0, 'Saldo pendiente': 0, 'Envíos facturados': 0 }]
  );
  XLSX.utils.book_append_sheet(workbook, sellersSheet, 'Saldos por vendedor');

  if (summary.byShippingType.length > 0) {
    const typesSheet = XLSX.utils.json_to_sheet(
      summary.byShippingType.map((row) => ({
        'Tipo de envío': shippingTypeLabel(row.shippingType),
        Cantidad: row.count,
        Monto: row.amount,
      }))
    );
    XLSX.utils.book_append_sheet(workbook, typesSheet, 'Por tipo de envío');
  }

  const movimientosSheet = XLSX.utils.json_to_sheet(
    ledger.length > 0
      ? ledgerRows(ledger, true)
      : [{ Fecha: '', Tipo: '', Descripción: '', Pedido: '', Vendedor: '', Monto: 0 }]
  );
  XLSX.utils.book_append_sheet(workbook, movimientosSheet, 'Movimientos');

  const from = summary.dateFrom;
  const to = summary.dateTo;
  downloadWorkbook(workbook, `posta-saldos-vendedores_${from}_${to}.xlsx`);
}

/** Vendedor (o cuenta filtrada): saldo propio + movimientos. */
export function exportSellerBillingExcel(
  summary: BillingSummary,
  ledger: BillingLedgerEntry[],
  sellerLabel?: string | null
) {
  const workbook = XLSX.utils.book_new();
  const name = sellerLabel || summary.sellerName || 'vendedor';

  const resumenSheet = XLSX.utils.json_to_sheet([
    { Concepto: 'Vendedor', Valor: name },
    { Concepto: 'Período', Valor: periodLabel(summary) },
    { Concepto: 'Gastado en el período', Valor: summary.totalSpent },
    { Concepto: 'Pagos registrados', Valor: summary.totalPaid },
    { Concepto: 'Saldo pendiente', Valor: summary.balance },
    { Concepto: 'Envíos facturados', Valor: summary.chargedShipments },
  ]);
  XLSX.utils.book_append_sheet(workbook, resumenSheet, 'Resumen');

  if (summary.byShippingType.length > 0) {
    const typesSheet = XLSX.utils.json_to_sheet(
      summary.byShippingType.map((row) => ({
        'Tipo de envío': shippingTypeLabel(row.shippingType),
        Cantidad: row.count,
        Monto: row.amount,
      }))
    );
    XLSX.utils.book_append_sheet(workbook, typesSheet, 'Por tipo de envío');
  }

  const movimientosSheet = XLSX.utils.json_to_sheet(
    ledger.length > 0
      ? ledgerRows(ledger, false)
      : [{ Fecha: '', Tipo: '', Descripción: '', Pedido: '', Monto: 0 }]
  );
  XLSX.utils.book_append_sheet(workbook, movimientosSheet, 'Movimientos');

  const safeName = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'vendedor';

  downloadWorkbook(
    workbook,
    `posta-cuenta-${safeName}_${summary.dateFrom}_${summary.dateTo}.xlsx`
  );
}
