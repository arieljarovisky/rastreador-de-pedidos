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
  Save,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { BillingLedgerEntry, BillingSummary, User, UserRole, isAgencyAdmin } from '../types.js';
import { apiUrl } from '../api.ts';
import OperationalDatePicker from './OperationalDatePicker.tsx';
import {
  getOperationalDateKey,
  shiftOperationalDateKey,
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
  const [rateFlex, setRateFlex] = useState('2800');
  const [rateExpress, setRateExpress] = useState('3200');
  const [rateStandard, setRateStandard] = useState('2500');
  const [savingRates, setSavingRates] = useState(false);
  const [paymentSellerId, setPaymentSellerId] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  const [recordingPayment, setRecordingPayment] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ dateFrom, dateTo });
      if (isAgency && selectedSellerId) params.set('sellerId', selectedSellerId);
      const headers = { Authorization: `Bearer ${token}` };
      const [summaryRes, ledgerRes] = await Promise.all([
        fetch(apiUrl(`/api/billing/summary?${params}`), { headers }),
        fetch(apiUrl(`/api/billing/ledger?${params}&limit=80`), { headers }),
      ]);
      const summaryBody = await summaryRes.json().catch(() => ({}));
      const ledgerBody = await ledgerRes.json().catch(() => ({}));
      if (!summaryRes.ok) throw new Error(summaryBody.error || 'No se pudo cargar la cuenta.');
      if (!ledgerRes.ok) throw new Error(ledgerBody.error || 'No se pudo cargar el historial.');
      setSummary(summaryBody as BillingSummary);
      setLedger(ledgerBody as BillingLedgerEntry[]);
      setRateFlex(String(summaryBody.rates?.flex ?? 2800));
      setRateExpress(String(summaryBody.rates?.express ?? 3200));
      setRateStandard(String(summaryBody.rates?.standard ?? 2500));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al cargar la cuenta.');
    } finally {
      setLoading(false);
    }
  }, [token, dateFrom, dateTo, isAgency, selectedSellerId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const shiftRange = (days: number) => {
    setDateFrom((d) => shiftOperationalDateKey(d, days));
    setDateTo((d) => shiftOperationalDateKey(d, days));
  };

  const saveRates = async () => {
    setSavingRates(true);
    setMessage(null);
    try {
      const res = await fetch(apiUrl('/api/billing/rates'), {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          flex: Number(rateFlex),
          express: Number(rateExpress),
          standard: Number(rateStandard),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'No se pudieron guardar las tarifas.');
      setMessage('Tarifas actualizadas.');
      await loadData();
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : 'Error al guardar tarifas.');
    } finally {
      setSavingRates(false);
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
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <button
            type="button"
            onClick={() => shiftRange(-7)}
            className="p-1.5 rounded border border-[var(--surface-border)] bg-[var(--surface-panel-2)] text-[var(--color-text-muted)] hover:text-[var(--ink-soft)]"
            aria-label="Semana anterior"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <label className="flex flex-col gap-0.5 min-w-[8.5rem]">
            <span className="mono-label">Desde</span>
            <input type="date" className={inputClass} value={dateFrom} max={dateTo} onChange={(e) => setDateFrom(e.target.value)} />
          </label>
          <label className="flex flex-col gap-0.5 min-w-[8.5rem]">
            <span className="mono-label">Hasta</span>
            <input type="date" className={inputClass} value={dateTo} min={dateFrom} max={getOperationalDateKey()} onChange={(e) => setDateTo(e.target.value)} />
          </label>
          <OperationalDatePicker value={dateFrom} maxDateKey={getOperationalDateKey()} onChange={(key) => { setDateFrom(key); setDateTo(key); }} />
          <button
            type="button"
            onClick={() => shiftRange(7)}
            disabled={dateTo >= getOperationalDateKey()}
            className="p-1.5 rounded border border-[var(--surface-border)] bg-[var(--surface-panel-2)] text-[var(--color-text-muted)] hover:text-[var(--ink-soft)] disabled:opacity-30"
            aria-label="Semana siguiente"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          {isAgency && (
            <label className="flex flex-col gap-0.5 min-w-[10rem] flex-1">
              <span className="mono-label">Vendedor</span>
              <select
                className={inputClass}
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
                <div className="px-3 py-2 bg-[var(--surface-panel-2)] border-b border-[var(--surface-border)]">
                  <h2 className="text-[11px] font-mono font-bold uppercase tracking-wider text-[var(--ink-soft)]">
                    Por vendedor
                  </h2>
                </div>
                <div className="divide-y divide-[var(--surface-border)]/60">
                  {summary.sellers.map((row) => (
                    <button
                      key={row.sellerId}
                      type="button"
                      onClick={() => setSelectedSellerId(row.sellerId)}
                      className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-[var(--surface-panel-2)]/60 transition"
                    >
                      <span className="font-medium text-[var(--ink-soft)]">{row.sellerName}</span>
                      <div className="text-right font-mono text-[11px]">
                        <p className="text-[var(--color-accent)] font-bold">{formatArs(row.totalSpent)}</p>
                        <p className={row.balance > 0 ? 'text-[var(--color-warn)]' : 'text-[var(--color-text-muted)]'}>
                          Saldo {formatArs(row.balance)}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            )}

            <section className="border border-[var(--surface-border)] rounded-[var(--radius-posta)] overflow-hidden">
              <div className="px-3 py-2 bg-[var(--surface-panel-2)] border-b border-[var(--surface-border)] flex items-center justify-between">
                <h2 className="text-[11px] font-mono font-bold uppercase tracking-wider text-[var(--ink-soft)]">
                  Movimientos
                </h2>
                <span className="text-[10px] font-mono text-[var(--color-text-muted)]">{ledger.length}</span>
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

            {isAgency && (
              <div className="grid lg:grid-cols-2 gap-4">
                <section className="border border-[var(--surface-border)] rounded-[var(--radius-posta)] p-3 space-y-3">
                  <h2 className="text-[11px] font-mono font-bold uppercase tracking-wider text-[var(--ink-soft)]">
                    Tarifas por envío entregado
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <label className="flex flex-col gap-0.5">
                      <span className="mono-label">Flex (ML)</span>
                      <input className={inputClass} inputMode="decimal" value={rateFlex} onChange={(e) => setRateFlex(e.target.value)} />
                    </label>
                    <label className="flex flex-col gap-0.5">
                      <span className="mono-label">Express (TN)</span>
                      <input className={inputClass} inputMode="decimal" value={rateExpress} onChange={(e) => setRateExpress(e.target.value)} />
                    </label>
                    <label className="flex flex-col gap-0.5">
                      <span className="mono-label">Estándar</span>
                      <input className={inputClass} inputMode="decimal" value={rateStandard} onChange={(e) => setRateStandard(e.target.value)} />
                    </label>
                  </div>
                  <button type="button" className="btn-primary px-3 py-1.5 inline-flex items-center gap-1" disabled={savingRates} onClick={() => void saveRates()}>
                    {savingRates ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                    Guardar tarifas
                  </button>
                </section>

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
              </div>
            )}

            {!isAgency && (
              <section className="border border-[var(--surface-border)] rounded-[var(--radius-posta)] p-3">
                <h2 className="text-[11px] font-mono font-bold uppercase tracking-wider text-[var(--ink-soft)] mb-2">
                  Tarifas vigentes
                </h2>
                <div className="grid grid-cols-3 gap-2 text-[11px] font-mono">
                  <p><span className="text-[var(--color-text-muted)]">Flex:</span> {formatArs(summary.rates.flex)}</p>
                  <p><span className="text-[var(--color-text-muted)]">Express:</span> {formatArs(summary.rates.express)}</p>
                  <p><span className="text-[var(--color-text-muted)]">Estándar:</span> {formatArs(summary.rates.standard)}</p>
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
