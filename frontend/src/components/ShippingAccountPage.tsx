/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useState, type ComponentType } from 'react';
import {
  Wallet,
  TrendingUp,
  Receipt,
  Loader2,
  Download,
} from 'lucide-react';
import { BillingLedgerEntry, BillingSummary, User, UserRole, isAgencyAdmin } from '../types.js';
import { apiUrl } from '../api.ts';
import OperationalDatePicker from './OperationalDatePicker.tsx';
import {
  getActiveOperationalDateKey,
  formatOperationalDateShort,
} from '../utils/deliverySummary.js';

interface ShippingAccountPageProps {
  token: string;
  user: User;
  sellers?: Array<{ id: string; name: string }>;
}

function formatArs(amount: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(amount);
}

function currentMonthRange(): { dateFrom: string; dateTo: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
  return {
    dateFrom: `${y}-${m}-01`,
    dateTo: `${y}-${m}-${String(lastDay).padStart(2, '0')}`,
  };
}

function monthRangeForOffset(monthOffset = 0): { dateFrom: string; dateTo: string } {
  const now = new Date();
  const anchor = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const y = anchor.getFullYear();
  const m = String(anchor.getMonth() + 1).padStart(2, '0');
  const lastDay = new Date(y, anchor.getMonth() + 1, 0).getDate();
  return {
    dateFrom: `${y}-${m}-01`,
    dateTo: `${y}-${m}-${String(lastDay).padStart(2, '0')}`,
  };
}

function shippingTypeLabel(type: string): string {
  if (type === 'flex') return 'Mercado Libre Flex';
  if (type === 'express') return 'Tienda Nube Express';
  return 'Carga manual';
}

const inputClass =
  'posta-input px-2.5 py-1.5 text-xs font-mono';

export default function ShippingAccountPage({ token, user, sellers = [] }: ShippingAccountPageProps) {
  const isAgency = isAgencyAdmin(user.role);
  const monthDefaults = useMemo(() => currentMonthRange(), []);
  const [dateFrom, setDateFrom] = useState(monthDefaults.dateFrom);
  const [dateTo, setDateTo] = useState(monthDefaults.dateTo);
  const [selectedSellerId, setSelectedSellerId] = useState('');
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [ledger, setLedger] = useState<BillingLedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paymentSellerId, setPaymentSellerId] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  const [recordingPayment, setRecordingPayment] = useState(false);
  const [mpPayLoading, setMpPayLoading] = useState(false);
  const [mpAvailable, setMpAvailable] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportingSellerId, setExportingSellerId] = useState<string | null>(null);
  const todayKey = getActiveOperationalDateKey();

  const applyMonthPreset = (offset: number) => {
    const range = monthRangeForOffset(offset);
    setDateFrom(range.dateFrom);
    setDateTo(range.dateTo);
  };

  const activePreset =
    dateFrom === monthRangeForOffset(0).dateFrom && dateTo === monthRangeForOffset(0).dateTo
      ? 'current'
      : dateFrom === monthRangeForOffset(-1).dateFrom && dateTo === monthRangeForOffset(-1).dateTo
        ? 'previous'
        : null;

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ dateFrom, dateTo });
      if (isAgency && selectedSellerId) params.set('sellerId', selectedSellerId);
      const headers = { Authorization: `Bearer ${token}` };
      const [summaryRes, ledgerRes, paymentOptsRes] = await Promise.all([
        fetch(apiUrl(`/api/billing/summary?${params}`), { headers }),
        fetch(apiUrl(`/api/billing/ledger?${params}&limit=80`), { headers }),
        !isAgency
          ? fetch(apiUrl('/api/billing/payment-options'), { headers })
          : Promise.resolve(null),
      ]);
      const summaryBody = await summaryRes.json().catch(() => ({}));
      const ledgerBody = await ledgerRes.json().catch(() => ({}));
      if (!summaryRes.ok) throw new Error(summaryBody.error || 'No se pudo cargar la cuenta.');
      if (!ledgerRes.ok) throw new Error(ledgerBody.error || 'No se pudo cargar el historial.');
      setSummary(summaryBody as BillingSummary);
      setLedger(ledgerBody as BillingLedgerEntry[]);
      if (paymentOptsRes) {
        const optsBody = await paymentOptsRes.json().catch(() => ({}));
        if (paymentOptsRes.ok) {
          setMpAvailable(Boolean(optsBody.mercadoPagoAvailable));
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al cargar la cuenta.');
    } finally {
      setLoading(false);
    }
  }, [token, dateFrom, dateTo, isAgency, selectedSellerId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleDateFromChange = (key: string) => {
    setDateFrom(key);
    if (key > dateTo) setDateTo(key);
  };

  const handleDateToChange = (key: string) => {
    setDateTo(key);
    if (key < dateFrom) setDateFrom(key);
  };

  const exportExcel = async (opts?: { sellerId: string; sellerName: string }) => {
    if (!summary && !opts?.sellerId) return;
    const targetSellerId = opts?.sellerId ?? (isAgency ? selectedSellerId || null : null);
    setExporting(true);
    setExportingSellerId(opts?.sellerId ?? null);
    setMessage(null);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const params = new URLSearchParams({ dateFrom, dateTo, limit: '5000' });
      if (targetSellerId) params.set('sellerId', targetSellerId);

      let exportSummary = summary;
      if (opts?.sellerId || (targetSellerId && (!summary?.sellerId || summary.sellerId !== targetSellerId))) {
        const sumRes = await fetch(
          apiUrl(`/api/billing/summary?${new URLSearchParams({ dateFrom, dateTo, sellerId: targetSellerId! })}`),
          { headers }
        );
        const sumBody = await sumRes.json().catch(() => ({}));
        if (!sumRes.ok) {
          throw new Error(
            typeof sumBody === 'object' && sumBody && 'error' in sumBody
              ? String((sumBody as { error?: string }).error || 'No se pudo exportar.')
              : 'No se pudo exportar.'
          );
        }
        exportSummary = sumBody as BillingSummary;
      }
      if (!exportSummary) throw new Error('No hay datos para exportar.');

      const res = await fetch(apiUrl(`/api/billing/ledger?${params}`), { headers });
      const body = await res.json().catch(() => ([]));
      if (!res.ok) {
        throw new Error(
          body && typeof body === 'object' && 'error' in body
            ? String((body as { error?: string }).error || 'No se pudo exportar.')
            : 'No se pudo exportar.'
        );
      }
      const exportLedger = body as BillingLedgerEntry[];

      if (isAgency && !targetSellerId) {
        const { exportAgencyBillingExcel } = await import('../utils/exportBillingExcel.js');
        await exportAgencyBillingExcel(exportSummary, exportLedger);
      } else {
        const { exportSellerBillingExcel } = await import('../utils/exportBillingExcel.js');
        const label =
          opts?.sellerName ||
          exportSummary.sellerName ||
          sellers.find((s) => s.id === targetSellerId)?.name ||
          user.name;
        await exportSellerBillingExcel(exportSummary, exportLedger, label);
      }
      setMessage(opts?.sellerName ? `Excel de ${opts.sellerName} descargado.` : 'Excel descargado.');
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : 'Error al exportar.');
    } finally {
      setExporting(false);
      setExportingSellerId(null);
    }
  };

  const recordPayment = async () => {
    if (!paymentSellerId || !paymentAmount) return;
    setRecordingPayment(true);
    setMessage(null);
    try {
      const res = await fetch(apiUrl('/api/billing/payments'), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sellerId: paymentSellerId,
          amount: Number(paymentAmount),
          description: paymentNote.trim() || undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'No se pudo registrar el pago.');
      setPaymentAmount('');
      setPaymentNote('');
      setMessage('Pago registrado.');
      await loadData();
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : 'Error al registrar pago.');
    } finally {
      setRecordingPayment(false);
    }
  };

  const payWithMercadoPago = async () => {
    setMpPayLoading(true);
    setMessage(null);
    try {
      const res = await fetch(apiUrl('/api/billing/payments/checkout'), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'No se pudo iniciar el pago.');
      window.location.href = body.initPoint;
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : 'Error al iniciar pago.');
      setMpPayLoading(false);
    }
  };

  const accountTitle =
    user.role === UserRole.STORE_ADMIN
      ? 'Mi cuenta de envíos'
      : selectedSellerId
        ? `Cuenta · ${summary?.sellerName ?? 'Vendedor'}`
        : 'Cuentas de envíos';

  return (
    <div className="h-full flex flex-col min-h-0 overflow-hidden posta-surface" id="shipping-account-page">
      <div className="shrink-0 p-3 sm:p-4 border-b border-[var(--surface-border)] space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
              Posta · Facturación
            </p>
            <h1 className="text-lg sm:text-xl font-display font-bold text-[var(--ink-soft)] mt-0.5 flex items-center gap-2">
              <Wallet className="w-5 h-5 text-[var(--color-accent)] shrink-0" />
              {accountTitle}
            </h1>
            <p className="text-[11px] text-[var(--color-text-muted)] mt-1">
              Cada envío entregado genera un cargo según el tipo de envío.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void exportExcel()}
            disabled={!summary || loading || exporting}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-[5px] border border-[var(--surface-border)] bg-[var(--surface-panel-2)] hover:border-[var(--color-accent)]/50 text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--ink-soft)] transition disabled:opacity-40 disabled:pointer-events-none"
            title={
              isAgency && !selectedSellerId
                ? 'Exportar saldos de vendedores y movimientos'
                : 'Exportar saldo y movimientos'
            }
          >
            {exporting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5 text-[var(--color-accent)]" />
            )}
            {exporting ? 'Exportando…' : 'Excel'}
          </button>
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => applyMonthPreset(0)}
              className={`px-2.5 py-1 rounded-lg border text-[10px] font-mono font-bold uppercase tracking-wider transition ${
                activePreset === 'current'
                  ? 'border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10 text-[var(--color-accent)]'
                  : 'border-[var(--surface-border)] bg-[var(--surface-panel-2)] text-[var(--color-text-muted)] hover:text-[var(--ink-soft)]'
              }`}
            >
              Este mes
            </button>
            <button
              type="button"
              onClick={() => applyMonthPreset(-1)}
              className={`px-2.5 py-1 rounded-lg border text-[10px] font-mono font-bold uppercase tracking-wider transition ${
                activePreset === 'previous'
                  ? 'border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10 text-[var(--color-accent)]'
                  : 'border-[var(--surface-border)] bg-[var(--surface-panel-2)] text-[var(--color-text-muted)] hover:text-[var(--ink-soft)]'
              }`}
            >
              Mes anterior
            </button>
          </div>

          <div
            className={`grid gap-3 p-3 rounded-[var(--radius-posta)] border border-[var(--surface-border)] bg-[var(--surface-panel-2)]/50 ${
              isAgency
                ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
                : 'grid-cols-1 sm:grid-cols-2'
            }`}
          >
            <OperationalDatePicker
              layout="field"
              label="Desde"
              value={dateFrom}
              maxDateKey={dateTo}
              onChange={handleDateFromChange}
            />
            <OperationalDatePicker
              layout="field"
              label="Hasta"
              value={dateTo}
              minDateKey={dateFrom}
              maxDateKey={todayKey}
              onChange={handleDateToChange}
            />
            {isAgency && (
              <label className="flex flex-col gap-1.5 min-w-0 w-full sm:col-span-2 lg:col-span-1">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--color-text-muted)] shrink-0 flex items-center gap-1.5 h-[1.125rem]">
                  Vendedor
                </span>
                <select
                  className="w-full min-w-0 h-[2.375rem] bg-[var(--surface-panel-2)] border border-[var(--surface-border)] rounded-[5px] px-3 text-xs text-[var(--color-text)] focus:outline-none focus:border-[var(--color-accent)]"
                  value={selectedSellerId}
                  onChange={(e) => setSelectedSellerId(e.target.value)}
                >
                  <option value="">Todos los vendedores</option>
                  {sellers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </div>

        {message && (
          <p className="text-[10px] font-mono text-[var(--color-ok)]">{message}</p>
        )}
        {error && (
          <p className="text-[10px] font-mono text-[var(--color-danger)]">{error}</p>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-[var(--color-text-muted)]">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-xs font-mono">Cargando cuenta…</span>
          </div>
        ) : summary ? (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              <SummaryCard label="Gastado en el período" value={formatArs(summary.totalSpent)} tone="accent" icon={TrendingUp} />
              <SummaryCard label="Saldo pendiente" value={formatArs(summary.balance)} tone={summary.balance > 0 ? 'warn' : 'ok'} icon={Wallet} />
              <SummaryCard label="Pagos registrados" value={formatArs(summary.totalPaid)} tone="neutral" icon={Receipt} />
              <SummaryCard label="Envíos facturados" value={String(summary.chargedShipments)} tone="neutral" icon={Receipt} />
            </div>

            <p className="text-[10px] font-mono text-[var(--color-text-muted)]">
              Período: {formatOperationalDateShort(summary.dateFrom)} — {formatOperationalDateShort(summary.dateTo)}
            </p>

            {summary.byShippingType.length > 0 && (
              <section className="border border-[var(--surface-border)] rounded-[var(--radius-posta)] overflow-hidden">
                <div className="px-3 py-2 bg-[var(--surface-panel-2)] border-b border-[var(--surface-border)]">
                  <h2 className="text-[11px] font-mono font-bold uppercase tracking-wider text-[var(--ink-soft)]">
                    Gasto por tipo de envío
                  </h2>
                </div>
                <div className="divide-y divide-[var(--surface-border)]/60">
                  {summary.byShippingType.map((row) => (
                    <div key={row.shippingType} className="flex items-center justify-between px-3 py-2.5 text-sm">
                      <span className="text-[var(--ink-soft)]">{shippingTypeLabel(row.shippingType)}</span>
                      <div className="text-right font-mono text-[11px]">
                        <p className="text-[var(--color-accent)] font-bold">{formatArs(row.amount)}</p>
                        <p className="text-[var(--color-text-muted)]">{row.count} envío{row.count === 1 ? '' : 's'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {isAgency && summary.sellers && summary.sellers.length > 0 && !selectedSellerId && (
              <section className="border border-[var(--surface-border)] rounded-[var(--radius-posta)] overflow-hidden">
                <div className="px-3 py-2 bg-[var(--surface-panel-2)] border-b border-[var(--surface-border)] flex items-center justify-between gap-2">
                  <h2 className="text-[11px] font-mono font-bold uppercase tracking-wider text-[var(--ink-soft)]">
                    Por vendedor
                  </h2>
                  <button
                    type="button"
                    onClick={() => void exportExcel()}
                    disabled={exporting}
                    className="inline-flex items-center gap-1 text-[9px] font-mono font-bold uppercase tracking-wider text-[var(--color-accent)] hover:underline disabled:opacity-40"
                  >
                    <Download className="w-3 h-3" />
                    Exportar todos
                  </button>
                </div>
                <div className="divide-y divide-[var(--surface-border)]/60">
                  {summary.sellers.map((row) => {
                    const rowExporting = exporting && exportingSellerId === row.sellerId;
                    return (
                      <div
                        key={row.sellerId}
                        className="flex items-center gap-2 px-3 py-2.5 hover:bg-[var(--surface-panel-2)]/60 transition"
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedSellerId(row.sellerId)}
                          className="flex-1 min-w-0 flex items-center justify-between gap-3 text-left"
                        >
                          <span className="font-medium text-[var(--ink-soft)] truncate">{row.sellerName}</span>
                          <div className="text-right font-mono text-[11px] shrink-0">
                            <p className="text-[var(--color-accent)] font-bold">{formatArs(row.totalSpent)}</p>
                            <p className={row.balance > 0 ? 'text-[var(--color-warn)]' : 'text-[var(--color-text-muted)]'}>
                              Saldo {formatArs(row.balance)}
                            </p>
                          </div>
                        </button>
                        <button
                          type="button"
                          title={`Exportar Excel de ${row.sellerName}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            void exportExcel({ sellerId: row.sellerId, sellerName: row.sellerName });
                          }}
                          disabled={exporting}
                          className="shrink-0 inline-flex items-center gap-1 px-2 py-1.5 rounded-[var(--radius-posta)] border border-[var(--surface-border)] text-[9px] font-mono font-bold uppercase tracking-wider text-[var(--color-accent)] hover:bg-[var(--surface-panel)] disabled:opacity-40"
                        >
                          {rowExporting ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Download className="w-3 h-3" />
                          )}
                          Excel
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            <section className="border border-[var(--surface-border)] rounded-[var(--radius-posta)] overflow-hidden">
              <div className="px-3 py-2 bg-[var(--surface-panel-2)] border-b border-[var(--surface-border)] flex items-center justify-between gap-2">
                <h2 className="text-[11px] font-mono font-bold uppercase tracking-wider text-[var(--ink-soft)]">
                  Movimientos
                </h2>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-[var(--color-text-muted)]">{ledger.length}</span>
                  <button
                    type="button"
                    onClick={() => void exportExcel()}
                    disabled={exporting}
                    className="inline-flex items-center gap-1 text-[9px] font-mono font-bold uppercase tracking-wider text-[var(--color-accent)] hover:underline disabled:opacity-40"
                  >
                    <Download className="w-3 h-3" />
                    Excel
                  </button>
                </div>
              </div>
              {ledger.length === 0 ? (
                <p className="px-3 py-8 text-center text-[11px] text-[var(--color-text-muted)]">
                  No hay movimientos en este período. Los cargos aparecen cuando un envío pasa a entregado.
                </p>
              ) : (
                <ul className="divide-y divide-[var(--surface-border)]/50 max-h-[28rem] overflow-y-auto scrollbar-thin">
                  {ledger.map((entry) => (
                    <li key={entry.id} className="px-3 py-2.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-[var(--ink-soft)]">{entry.description}</p>
                          <p className="text-[10px] font-mono text-[var(--color-text-muted)] mt-0.5">
                            {new Date(entry.createdAt).toLocaleString('es-AR')}
                            {entry.orderId ? ` · ${entry.orderId}` : ''}
                            {isAgency && entry.sellerName ? ` · ${entry.sellerName}` : ''}
                          </p>
                        </div>
                        <p
                          className={`shrink-0 font-mono font-bold text-sm ${
                            entry.entryType === 'payment'
                              ? 'text-[var(--color-ok)]'
                              : entry.entryType === 'charge'
                                ? 'text-[var(--color-warn)]'
                                : 'text-[var(--ink-soft)]'
                          }`}
                        >
                          {entry.entryType === 'payment' ? '−' : '+'}
                          {formatArs(entry.amount)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {!isAgency && summary.balance > 0 && mpAvailable && (
              <section className="border border-[var(--surface-border)] rounded-[var(--radius-posta)] p-3 space-y-2">
                <h2 className="text-[11px] font-mono font-bold uppercase tracking-wider text-[var(--ink-soft)]">
                  Pagar saldo con Mercado Pago
                </h2>
                <p className="text-[10px] text-[var(--color-text-muted)]">
                  El pago va directo a la cuenta de Mercado Pago de tu agencia.
                </p>
                <button
                  type="button"
                  className="btn-primary px-3 py-1.5"
                  disabled={mpPayLoading}
                  onClick={() => void payWithMercadoPago()}
                >
                  {mpPayLoading ? 'Redirigiendo…' : `Pagar ${formatArs(summary.balance)}`}
                </button>
              </section>
            )}

            {isAgency && (
              <section className="border border-[var(--surface-border)] rounded-[var(--radius-posta)] p-3 space-y-3">
                <h2 className="text-[11px] font-mono font-bold uppercase tracking-wider text-[var(--ink-soft)]">
                  Registrar pago de vendedor
                </h2>
                <label className="flex flex-col gap-0.5">
                  <span className="mono-label">Vendedor</span>
                  <select className={inputClass} value={paymentSellerId} onChange={(e) => setPaymentSellerId(e.target.value)}>
                    <option value="">Elegir vendedor</option>
                    {sellers.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-0.5">
                  <span className="mono-label">Monto (ARS)</span>
                  <input className={inputClass} inputMode="decimal" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} placeholder="Ej. 50000" />
                </label>
                <label className="flex flex-col gap-0.5">
                  <span className="mono-label">Nota (opcional)</span>
                  <input className={inputClass} value={paymentNote} onChange={(e) => setPaymentNote(e.target.value)} placeholder="Transferencia, efectivo…" />
                </label>
                <button type="button" className="btn-secondary px-3 py-1.5" disabled={recordingPayment || !paymentSellerId || !paymentAmount} onClick={() => void recordPayment()}>
                  {recordingPayment ? 'Registrando…' : 'Registrar pago'}
                </button>
              </section>
            )}

            {summary.zoneRates.length > 0 && (
              <section className="border border-[var(--surface-border)] rounded-[var(--radius-posta)] overflow-hidden">
                <div className="px-3 py-2 bg-[var(--surface-panel-2)] border-b border-[var(--surface-border)]">
                  <h2 className="text-[11px] font-mono font-bold uppercase tracking-wider text-[var(--ink-soft)]">
                    Tarifas vigentes por zona
                  </h2>
                  <p className="text-[9px] text-[var(--color-text-muted)] mt-0.5">
                    Configurá los precios en Precios → Listas de precios.
                  </p>
                </div>
                <div className="divide-y divide-[var(--surface-border)]/60">
                  {summary.zoneRates.map((zone) => (
                    <div key={zone.zoneId} className="px-3 py-2.5">
                      <p className="text-sm font-medium text-[var(--ink-soft)] mb-1">{zone.zoneName}</p>
                      <div className="grid grid-cols-3 gap-2 text-[10px] font-mono">
                        <p><span className="text-[var(--color-text-muted)]">Flex:</span> {formatArs(zone.flex)}</p>
                        <p><span className="text-[var(--color-text-muted)]">Express:</span> {formatArs(zone.express)}</p>
                        <p><span className="text-[var(--color-text-muted)]">Estándar:</span> {formatArs(zone.standard)}</p>
                      </div>
                    </div>
                  ))}
                  <div className="px-3 py-2.5 bg-[var(--surface-panel-2)]/30">
                    <p className="text-sm font-medium text-[var(--ink-soft)] mb-1">Fuera de zona</p>
                    <div className="grid grid-cols-3 gap-2 text-[10px] font-mono">
                      <p><span className="text-[var(--color-text-muted)]">Flex:</span> {formatArs(summary.defaultRates.flex)}</p>
                      <p><span className="text-[var(--color-text-muted)]">Express:</span> {formatArs(summary.defaultRates.express)}</p>
                      <p><span className="text-[var(--color-text-muted)]">Estándar:</span> {formatArs(summary.defaultRates.standard)}</p>
                    </div>
                  </div>
                </div>
              </section>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string;
  value: string;
  tone: 'ok' | 'warn' | 'accent' | 'neutral';
  icon: ComponentType<{ className?: string }>;
}) {
  const tones = {
    ok: 'border-[var(--color-ok)]/25 bg-[var(--color-ok)]/5 text-[var(--color-ok)]',
    warn: 'border-[var(--color-warn)]/25 bg-[var(--color-warn)]/5 text-[var(--color-warn)]',
    accent: 'border-[var(--color-accent)]/25 bg-[var(--color-accent)]/5 text-[var(--color-accent)]',
    neutral: 'border-[var(--surface-border)] bg-[var(--surface-panel-2)] text-[var(--ink-soft)]',
  };
  return (
    <div className={`rounded border px-2.5 py-2 ${tones[tone]}`}>
      <div className="flex items-center gap-1 mb-1 opacity-80">
        <Icon className="w-3 h-3" />
        <span className="text-[8px] font-mono font-bold uppercase tracking-tight text-[var(--color-text-muted)]">{label}</span>
      </div>
      <p className="text-lg font-bold font-mono leading-tight">{value}</p>
    </div>
  );
}
