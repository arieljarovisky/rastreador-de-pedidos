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
  Bike,
  Download,
} from 'lucide-react';
import { DriverLedgerEntry, DriverSettlementSummary, User, isAgencyAdmin } from '../types.js';
import { apiUrl } from '../api.ts';
import OperationalDatePicker from './OperationalDatePicker.tsx';
import {
  getOperationalDateKey,
  formatOperationalDateShort,
} from '../utils/deliverySummary.js';

interface DriverSettlementPageProps {
  token: string;
  user: User;
  repartidores?: Array<{ id: string; name: string }>;
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

const inputClass = 'posta-input px-2.5 py-1.5 text-xs font-mono';

export default function DriverSettlementPage({
  token,
  user,
  repartidores = [],
}: DriverSettlementPageProps) {
  const isAgency = isAgencyAdmin(user.role);
  const monthDefaults = useMemo(() => currentMonthRange(), []);
  const [dateFrom, setDateFrom] = useState(monthDefaults.dateFrom);
  const [dateTo, setDateTo] = useState(monthDefaults.dateTo);
  const [selectedRepartidorId, setSelectedRepartidorId] = useState('');
  const [summary, setSummary] = useState<DriverSettlementSummary | null>(null);
  const [ledger, setLedger] = useState<DriverLedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paymentRepartidorId, setPaymentRepartidorId] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  const [recordingPayment, setRecordingPayment] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const todayKey = getOperationalDateKey();

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
      if (isAgency && selectedRepartidorId) params.set('repartidorId', selectedRepartidorId);
      const headers = { Authorization: `Bearer ${token}` };
      const [summaryRes, ledgerRes] = await Promise.all([
        fetch(apiUrl(`/api/driver-settlement/summary?${params}`), { headers }),
        fetch(apiUrl(`/api/driver-settlement/ledger?${params}&limit=80`), { headers }),
      ]);
      const summaryBody = await summaryRes.json().catch(() => ({}));
      const ledgerBody = await ledgerRes.json().catch(() => ({}));
      if (!summaryRes.ok) throw new Error(summaryBody.error || 'No se pudo cargar la liquidación.');
      if (!ledgerRes.ok) throw new Error(ledgerBody.error || 'No se pudo cargar el historial.');
      setSummary(summaryBody as DriverSettlementSummary);
      setLedger(ledgerBody as DriverLedgerEntry[]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al cargar la liquidación.');
    } finally {
      setLoading(false);
    }
  }, [token, dateFrom, dateTo, isAgency, selectedRepartidorId]);

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

  const recordPayment = async () => {
    if (!paymentRepartidorId || !paymentAmount) return;
    setRecordingPayment(true);
    setMessage(null);
    try {
      const res = await fetch(apiUrl('/api/driver-settlement/payments'), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          repartidorId: paymentRepartidorId,
          amount: Number(paymentAmount),
          description: paymentNote.trim() || undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'No se pudo registrar la liquidación.');
      setPaymentAmount('');
      setPaymentNote('');
      setMessage('Liquidación registrada.');
      await loadData();
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : 'Error al registrar liquidación.');
    } finally {
      setRecordingPayment(false);
    }
  };

  const exportExcel = async () => {
    if (!summary) return;
    setExporting(true);
    setMessage(null);
    try {
      const params = new URLSearchParams({ dateFrom, dateTo, limit: '5000' });
      if (isAgency && selectedRepartidorId) params.set('repartidorId', selectedRepartidorId);
      const res = await fetch(apiUrl(`/api/driver-settlement/ledger?${params}`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json().catch(() => ([]));
      if (!res.ok) {
        throw new Error(
          body && typeof body === 'object' && 'error' in body
            ? String((body as { error?: string }).error || 'No se pudo exportar.')
            : 'No se pudo exportar.'
        );
      }
      const exportLedger = body as DriverLedgerEntry[];

      if (isAgency && !selectedRepartidorId) {
        const { exportAgencyDriverSettlementExcel } = await import('../utils/exportDriverSettlementExcel.js');
        await exportAgencyDriverSettlementExcel(summary, exportLedger);
      } else {
        const { exportDriverSettlementExcel } = await import('../utils/exportDriverSettlementExcel.js');
        const label =
          summary.repartidorName ||
          repartidores.find((r) => r.id === selectedRepartidorId)?.name ||
          user.name;
        await exportDriverSettlementExcel(summary, exportLedger, label);
      }
      setMessage('Excel descargado.');
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : 'Error al exportar.');
    } finally {
      setExporting(false);
    }
  };

  const accountTitle = selectedRepartidorId
    ? `Liquidación · ${summary?.repartidorName ?? 'Repartidor'}`
    : 'Liquidación de repartidores';

  return (
    <div className="h-full flex flex-col min-h-0 overflow-hidden posta-surface" id="driver-settlement-page">
      <div className="shrink-0 p-3 sm:p-4 border-b border-[var(--surface-border)] space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
              Posta · Flota
            </p>
            <h1 className="text-lg sm:text-xl font-display font-bold text-[var(--ink-soft)] mt-0.5 flex items-center gap-2">
              <Bike className="w-5 h-5 text-[var(--color-accent)] shrink-0" />
              {accountTitle}
            </h1>
            <p className="text-[11px] text-[var(--color-text-muted)] mt-1">
              Cada entrega acumula el pago configurado por zona. Registrá acá cuando liquides al repartidor.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void exportExcel()}
            disabled={!summary || loading || exporting}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-[5px] border border-[var(--surface-border)] bg-[var(--surface-panel-2)] hover:border-[var(--color-accent)]/50 text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--ink-soft)] transition disabled:opacity-40 disabled:pointer-events-none"
            title={
              isAgency && !selectedRepartidorId
                ? 'Exportar liquidación de repartidores y movimientos'
                : 'Exportar liquidación y movimientos'
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
                  Repartidor
                </span>
                <select
                  className="w-full min-w-0 h-[2.375rem] bg-[var(--surface-panel-2)] border border-[var(--surface-border)] rounded-[5px] px-3 text-xs text-[var(--color-text)] focus:outline-none focus:border-[var(--color-accent)]"
                  value={selectedRepartidorId}
                  onChange={(e) => setSelectedRepartidorId(e.target.value)}
                >
                  <option value="">Todos los repartidores</option>
                  {repartidores.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </div>

        {message && (
          <p
            className={`text-[10px] font-mono ${
              message.includes('registrad') || message.includes('descargado')
                ? 'text-[var(--color-ok)]'
                : 'text-[var(--color-danger)]'
            }`}
          >
            {message}
          </p>
        )}
        {error && <p className="text-[10px] font-mono text-[var(--color-danger)]">{error}</p>}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-[var(--color-text-muted)]">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-xs font-mono">Cargando liquidación…</span>
          </div>
        ) : summary ? (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              <SummaryCard
                label="Devengado en el período"
                value={formatArs(summary.totalEarned)}
                tone="accent"
                icon={TrendingUp}
              />
              <SummaryCard
                label="Saldo a pagar"
                value={formatArs(summary.balance)}
                tone={summary.balance > 0 ? 'warn' : 'ok'}
                icon={Wallet}
              />
              <SummaryCard
                label="Liquidado"
                value={formatArs(summary.totalPaid)}
                tone="neutral"
                icon={Receipt}
              />
              <SummaryCard
                label="Entregas"
                value={String(summary.deliveredShipments)}
                tone="neutral"
                icon={Bike}
              />
            </div>

            <p className="text-[10px] font-mono text-[var(--color-text-muted)]">
              Período: {formatOperationalDateShort(summary.dateFrom)} —{' '}
              {formatOperationalDateShort(summary.dateTo)}
            </p>

            {summary.byShippingType.length > 0 && (
              <section className="border border-[var(--surface-border)] rounded-[var(--radius-posta)] overflow-hidden">
                <div className="px-3 py-2 bg-[var(--surface-panel-2)] border-b border-[var(--surface-border)]">
                  <h2 className="text-[11px] font-mono font-bold uppercase tracking-wider text-[var(--ink-soft)]">
                    Pago por tipo de envío
                  </h2>
                </div>
                <div className="divide-y divide-[var(--surface-border)]/60">
                  {summary.byShippingType.map((row) => (
                    <div
                      key={row.shippingType}
                      className="flex items-center justify-between px-3 py-2.5 text-sm"
                    >
                      <span className="text-[var(--ink-soft)]">{shippingTypeLabel(row.shippingType)}</span>
                      <div className="text-right font-mono text-[11px]">
                        <p className="text-[var(--color-accent)] font-bold">{formatArs(row.amount)}</p>
                        <p className="text-[var(--color-text-muted)]">
                          {row.count} entrega{row.count === 1 ? '' : 's'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {isAgency && summary.repartidores && summary.repartidores.length > 0 && !selectedRepartidorId && (
              <section className="border border-[var(--surface-border)] rounded-[var(--radius-posta)] overflow-hidden">
                <div className="px-3 py-2 bg-[var(--surface-panel-2)] border-b border-[var(--surface-border)]">
                  <h2 className="text-[11px] font-mono font-bold uppercase tracking-wider text-[var(--ink-soft)]">
                    Por repartidor
                  </h2>
                </div>
                <div className="divide-y divide-[var(--surface-border)]/60">
                  {summary.repartidores.map((row) => (
                    <button
                      key={row.repartidorId}
                      type="button"
                      onClick={() => setSelectedRepartidorId(row.repartidorId)}
                      className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-[var(--surface-panel-2)]/60 transition"
                    >
                      <span className="font-medium text-[var(--ink-soft)]">{row.repartidorName}</span>
                      <div className="text-right font-mono text-[11px]">
                        <p className="text-[var(--color-accent)] font-bold">
                          {formatArs(row.totalEarned)}
                        </p>
                        <p
                          className={
                            row.balance > 0 ? 'text-[var(--color-warn)]' : 'text-[var(--color-text-muted)]'
                          }
                        >
                          A pagar {formatArs(row.balance)}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            )}

            <section className="border border-[var(--surface-border)] rounded-[var(--radius-posta)] overflow-hidden">
              <div className="px-3 py-2 bg-[var(--surface-panel-2)] border-b border-[var(--surface-border)] flex items-center justify-between gap-2">
                <h2 className="text-[11px] font-mono font-bold uppercase tracking-wider text-[var(--ink-soft)]">
                  Movimientos
                </h2>
                <span className="text-[10px] font-mono text-[var(--color-text-muted)]">{ledger.length}</span>
              </div>
              {ledger.length === 0 ? (
                <p className="px-3 py-8 text-center text-[11px] text-[var(--color-text-muted)]">
                  No hay movimientos en este período. Los pagos se acumulan al marcar una entrega.
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
                            {isAgency && entry.repartidorName ? ` · ${entry.repartidorName}` : ''}
                          </p>
                        </div>
                        <p
                          className={`shrink-0 font-mono font-bold text-sm ${
                            entry.entryType === 'payment'
                              ? 'text-[var(--color-ok)]'
                              : entry.entryType === 'earning'
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

            {isAgency && (
              <section className="border border-[var(--surface-border)] rounded-[var(--radius-posta)] p-3 space-y-3">
                <h2 className="text-[11px] font-mono font-bold uppercase tracking-wider text-[var(--ink-soft)]">
                  Registrar liquidación
                </h2>
                <p className="text-[10px] text-[var(--color-text-muted)]">
                  Anotá el pago que le hiciste al repartidor (transferencia, efectivo, etc.).
                </p>
                <label className="flex flex-col gap-0.5">
                  <span className="mono-label">Repartidor</span>
                  <select
                    className={inputClass}
                    value={paymentRepartidorId}
                    onChange={(e) => setPaymentRepartidorId(e.target.value)}
                  >
                    <option value="">Elegir repartidor</option>
                    {repartidores.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-0.5">
                  <span className="mono-label">Monto (ARS)</span>
                  <input
                    className={inputClass}
                    inputMode="decimal"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    placeholder="Ej. 45000"
                  />
                </label>
                <label className="flex flex-col gap-0.5">
                  <span className="mono-label">Nota (opcional)</span>
                  <input
                    className={inputClass}
                    value={paymentNote}
                    onChange={(e) => setPaymentNote(e.target.value)}
                    placeholder="Transferencia, efectivo…"
                  />
                </label>
                <button
                  type="button"
                  className="btn-secondary px-3 py-1.5"
                  disabled={recordingPayment || !paymentRepartidorId || !paymentAmount}
                  onClick={() => void recordPayment()}
                >
                  {recordingPayment ? 'Registrando…' : 'Registrar liquidación'}
                </button>
              </section>
            )}

            {summary.zoneRates.length > 0 && (
              <section className="border border-[var(--surface-border)] rounded-[var(--radius-posta)] overflow-hidden">
                <div className="px-3 py-2 bg-[var(--surface-panel-2)] border-b border-[var(--surface-border)]">
                  <h2 className="text-[11px] font-mono font-bold uppercase tracking-wider text-[var(--ink-soft)]">
                    Pago al repartidor por zona
                  </h2>
                  <p className="text-[9px] text-[var(--color-text-muted)] mt-0.5">
                    Configurá los montos en Precios → Listas de precios.
                  </p>
                </div>
                <div className="divide-y divide-[var(--surface-border)]/60">
                  {summary.zoneRates.map((zone) => (
                    <div key={zone.zoneId} className="px-3 py-2.5">
                      <p className="text-sm font-medium text-[var(--ink-soft)] mb-1">{zone.zoneName}</p>
                      <div className="grid grid-cols-3 gap-2 text-[10px] font-mono">
                        <p>
                          <span className="text-[var(--color-text-muted)]">Flex:</span>{' '}
                          {formatArs(zone.flex)}
                        </p>
                        <p>
                          <span className="text-[var(--color-text-muted)]">Express:</span>{' '}
                          {formatArs(zone.express)}
                        </p>
                        <p>
                          <span className="text-[var(--color-text-muted)]">Estándar:</span>{' '}
                          {formatArs(zone.standard)}
                        </p>
                      </div>
                    </div>
                  ))}
                  <div className="px-3 py-2.5 bg-[var(--surface-panel-2)]/30">
                    <p className="text-sm font-medium text-[var(--ink-soft)] mb-1">Fuera de zona</p>
                    <div className="grid grid-cols-3 gap-2 text-[10px] font-mono">
                      <p>
                        <span className="text-[var(--color-text-muted)]">Flex:</span>{' '}
                        {formatArs(summary.defaultRates.flex)}
                      </p>
                      <p>
                        <span className="text-[var(--color-text-muted)]">Express:</span>{' '}
                        {formatArs(summary.defaultRates.express)}
                      </p>
                      <p>
                        <span className="text-[var(--color-text-muted)]">Estándar:</span>{' '}
                        {formatArs(summary.defaultRates.standard)}
                      </p>
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
        <span className="text-[8px] font-mono font-bold uppercase tracking-tight text-[var(--color-text-muted)]">
          {label}
        </span>
      </div>
      <p className="text-lg font-bold font-mono leading-tight">{value}</p>
    </div>
  );
}
