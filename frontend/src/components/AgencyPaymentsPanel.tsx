/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useState } from 'react';
import { CreditCard, Loader2, Wallet } from 'lucide-react';
import { AgencyMercadoPagoStatus, AgencySubscriptionStatus, SubscriptionPlan } from '../types.js';
import { apiUrl } from '../api.ts';

function formatArs(amount: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(amount);
}

function statusLabel(status: AgencySubscriptionStatus['status']): string {
  if (status === 'trial') return 'Período de prueba';
  if (status === 'active') return 'Activa';
  if (status === 'past_due') return 'Vencida';
  return 'Cancelada';
}

interface AgencyPaymentsPanelProps {
  token: string;
  onConnectMercadoPago?: () => Promise<void>;
  onDisconnectMercadoPago?: () => Promise<void>;
}

export default function AgencyPaymentsPanel({
  token,
  onConnectMercadoPago,
  onDisconnectMercadoPago,
}: AgencyPaymentsPanelProps) {
  const [subscription, setSubscription] = useState<AgencySubscriptionStatus | null>(null);
  const [mpStatus, setMpStatus] = useState<AgencyMercadoPagoStatus | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [mpBusy, setMpBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [subRes, mpRes, plansRes] = await Promise.all([
        fetch(apiUrl('/api/subscriptions/status'), { headers }),
        fetch(apiUrl('/api/mercadopago/status'), { headers }),
        fetch(apiUrl('/api/subscriptions/plans'), { headers }),
      ]);
      const subBody = await subRes.json().catch(() => ({}));
      const mpBody = await mpRes.json().catch(() => ({}));
      const plansBody = await plansRes.json().catch(() => []);
      if (!subRes.ok) throw new Error(subBody.error || 'No se pudo cargar la suscripción.');
      if (!mpRes.ok) throw new Error(mpBody.error || 'No se pudo cargar Mercado Pago.');
      setSubscription(subBody as AgencySubscriptionStatus);
      setMpStatus(mpBody as AgencyMercadoPagoStatus);
      setPlans(Array.isArray(plansBody) ? plansBody : []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al cargar pagos.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const startSubscriptionCheckout = async () => {
    setCheckoutLoading(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(apiUrl('/api/subscriptions/checkout'), {
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
      setError(err instanceof Error ? err.message : 'Error al iniciar pago.');
      setCheckoutLoading(false);
    }
  };

  const connectMp = async () => {
    if (!onConnectMercadoPago) return;
    setMpBusy(true);
    setError(null);
    try {
      await onConnectMercadoPago();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo conectar Mercado Pago.');
      setMpBusy(false);
    }
  };

  const disconnectMp = async () => {
    if (!onDisconnectMercadoPago) return;
    setMpBusy(true);
    setError(null);
    try {
      await onDisconnectMercadoPago();
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo desconectar.');
    } finally {
      setMpBusy(false);
    }
  };

  if (loading) {
    return (
      <section className="border border-[var(--surface-border)] rounded-[var(--radius-posta)] p-4 flex items-center gap-2 text-[var(--color-text-muted)]">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-xs font-mono">Cargando pagos…</span>
      </section>
    );
  }

  const recommended = subscription?.recommendedPlan;
  const needsPayment = subscription && !subscription.isActive;

  return (
    <div className="flex flex-col gap-3 w-full">
      <section className="border border-[var(--surface-border)] rounded-[var(--radius-posta)] p-3 space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-[5px] bg-[var(--color-accent)]/10 flex items-center justify-center">
            <CreditCard className="w-4 h-4 text-[var(--color-accent)]" />
          </div>
          <div>
            <p className="text-xs font-display font-semibold text-[var(--color-text)]">Suscripción Posta</p>
            <p className="text-[10px] text-[var(--color-text-muted)]">
              Mismas funciones para todos; el precio depende de cuántos repartidores tenés.
            </p>
          </div>
        </div>

        {subscription && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] font-mono">
            <div className="rounded-[5px] border border-[var(--surface-border)] p-2">
              <p className="text-[var(--color-text-muted)]">Estado</p>
              <p className="font-bold text-[var(--ink-soft)]">{statusLabel(subscription.status)}</p>
            </div>
            <div className="rounded-[5px] border border-[var(--surface-border)] p-2">
              <p className="text-[var(--color-text-muted)]">Repartidores</p>
              <p className="font-bold text-[var(--ink-soft)]">{subscription.repartidorCount}</p>
            </div>
            <div className="rounded-[5px] border border-[var(--surface-border)] p-2">
              <p className="text-[var(--color-text-muted)]">Plan sugerido</p>
              <p className="font-bold text-[var(--ink-soft)]">{recommended?.name ?? '—'}</p>
            </div>
            <div className="rounded-[5px] border border-[var(--surface-border)] p-2">
              <p className="text-[var(--color-text-muted)]">Precio mensual</p>
              <p className="font-bold text-[var(--color-accent)]">
                {recommended ? formatArs(recommended.priceArs) : '—'}
              </p>
            </div>
          </div>
        )}

        {subscription?.status === 'trial' && subscription.daysRemaining != null && (
          <p className="text-[10px] font-mono text-[var(--color-text-muted)]">
            Te quedan {subscription.daysRemaining} día{subscription.daysRemaining === 1 ? '' : 's'} de prueba gratis.
          </p>
        )}

        {subscription?.status === 'active' && subscription.daysRemaining != null && (
          <p className="text-[10px] font-mono text-[var(--color-text-muted)]">
            Próximo vencimiento en {subscription.daysRemaining} día{subscription.daysRemaining === 1 ? '' : 's'}.
          </p>
        )}

        {plans.length > 0 && (
          <div className="border border-[var(--surface-border)] rounded-[5px] overflow-hidden">
            <div className="px-2 py-1.5 bg-[var(--surface-panel-2)] border-b border-[var(--surface-border)]">
              <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--ink-soft)]">
                Escalas por repartidores (mismas funciones)
              </p>
            </div>
            <ul className="divide-y divide-[var(--surface-border)]/60">
              {plans.map((plan) => (
                <li key={plan.id} className="flex items-center justify-between px-2 py-1.5 text-[10px] font-mono">
                  <span className="text-[var(--ink-soft)]">{plan.name}</span>
                  <span className="text-[var(--color-accent)] font-bold">{formatArs(plan.priceArs)}/mes</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {(needsPayment || subscription?.status === 'active') && subscription?.postaMercadoPagoConfigured !== false && (
          <button
            type="button"
            className="btn-primary px-3 py-1.5 w-full sm:w-auto"
            disabled={checkoutLoading || !subscription?.postaMercadoPagoConfigured}
            onClick={() => void startSubscriptionCheckout()}
          >
            {checkoutLoading ? 'Redirigiendo…' : needsPayment ? 'Pagar suscripción' : 'Renovar suscripción'}
          </button>
        )}

        {subscription?.postaMercadoPagoConfigured === false && (
          <p className="text-[10px] font-mono text-[var(--color-warn)]">
            Los pagos de suscripción aún no están configurados en el servidor.
          </p>
        )}
      </section>

      <section className="border border-[var(--surface-border)] rounded-[var(--radius-posta)] p-3 space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-[5px] bg-[var(--color-ok)]/10 flex items-center justify-center">
            <Wallet className="w-4 h-4 text-[var(--color-ok)]" />
          </div>
          <div className="flex-1">
            <p className="text-xs font-display font-semibold text-[var(--color-text)]">
              Mercado Pago de tu agencia
            </p>
            <p className="text-[10px] text-[var(--color-text-muted)]">
              Los vendedores pagan sus envíos directo a tu cuenta.
            </p>
          </div>
          <span
            className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-[4px] ${
              mpStatus?.connected
                ? 'bg-[var(--color-ok)]/15 text-[var(--color-ok)]'
                : 'bg-[var(--surface-panel-2)] text-[var(--color-text-muted)]'
            }`}
          >
            {mpStatus?.connected ? 'Conectado' : 'Sin conectar'}
          </span>
        </div>

        {!mpStatus?.configured && (
          <p className="text-[10px] font-mono text-[var(--color-warn)]">
            Mercado Pago OAuth no está configurado en el servidor (MP_CLIENT_ID, MP_CLIENT_SECRET).
          </p>
        )}

        {mpStatus?.connected && mpStatus.account?.nickname && (
          <p className="text-[10px] font-mono text-[var(--color-text-muted)]">
            Cuenta: {mpStatus.account.nickname}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {mpStatus?.connected ? (
            <button
              type="button"
              className="btn-secondary px-3 py-1.5"
              disabled={mpBusy}
              onClick={() => void disconnectMp()}
            >
              {mpBusy ? '…' : 'Desconectar'}
            </button>
          ) : (
            <button
              type="button"
              className="btn-primary px-3 py-1.5"
              disabled={mpBusy || !mpStatus?.configured || !onConnectMercadoPago}
              onClick={() => void connectMp()}
            >
              {mpBusy ? 'Abriendo…' : 'Conectar Mercado Pago'}
            </button>
          )}
        </div>
      </section>

      {message && <p className="text-[10px] font-mono text-[var(--color-ok)]">{message}</p>}
      {error && <p className="text-[10px] font-mono text-[var(--color-danger)]">{error}</p>}
    </div>
  );
}
