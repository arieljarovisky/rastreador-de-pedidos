/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useState } from 'react';
import { CreditCard, Loader2, LogOut } from 'lucide-react';
import { AgencySubscriptionStatus } from '../types.js';
import { apiUrl } from '../api.ts';
import PostaLogo from './ui/PostaLogo.tsx';
import type { PostaTheme } from '../theme/usePostaTheme.ts';

function formatArs(amount: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(amount);
}

interface SubscriptionExpiredOverlayProps {
  token: string;
  theme: PostaTheme;
  onLogout: () => void;
  /** Se incrementa al volver de Mercado Pago para reconsultar el estado. */
  refreshKey?: number;
}

export default function SubscriptionExpiredOverlay({
  token,
  theme,
  onLogout,
  refreshKey = 0,
}: SubscriptionExpiredOverlayProps) {
  const [subscription, setSubscription] = useState<AgencySubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(apiUrl('/api/subscriptions/status'), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error || 'No se pudo verificar la suscripción.');
      }
      setSubscription(body as AgencySubscriptionStatus);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al verificar la suscripción.');
      setSubscription(null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  useEffect(() => {
    if (!subscription || subscription.isActive) return;
    const id = window.setInterval(() => {
      void load();
    }, 30_000);
    return () => window.clearInterval(id);
  }, [subscription, load]);

  const startCheckout = async () => {
    setCheckoutLoading(true);
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
      setError(err instanceof Error ? err.message : 'Error al iniciar el pago.');
      setCheckoutLoading(false);
    }
  };

  if (loading && !subscription) {
    return null;
  }

  if (!subscription || subscription.isActive) {
    return null;
  }

  const recommended = subscription.recommendedPlan;
  const isTrialExpired = subscription.status === 'trial';
  const title = isTrialExpired ? 'Período de prueba vencido' : 'Suscripción vencida';
  const message = isTrialExpired
    ? 'Tu prueba gratis terminó. Pagá la suscripción para seguir usando Posta.'
    : 'Tu suscripción a Posta venció. Pagá para seguir operando.';

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-[var(--surface-bg)]/95 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="subscription-expired-title"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Escape') e.preventDefault();
      }}
    >
      <div className="w-full max-w-md border border-[var(--surface-border)] rounded-[var(--radius-posta)] bg-[var(--surface-panel)] shadow-2xl p-6 space-y-5">
        <div className="flex flex-col items-center gap-3 text-center">
          <PostaLogo
            size={36}
            showWordmark
            variant={theme === 'paper' ? 'paper' : 'dark'}
          />
          <div className="w-12 h-12 rounded-[8px] bg-[var(--color-danger)]/15 flex items-center justify-center">
            <CreditCard className="w-6 h-6 text-[var(--color-danger)]" />
          </div>
          <div>
            <h1
              id="subscription-expired-title"
              className="text-lg font-display font-bold text-[var(--color-text)]"
            >
              {title}
            </h1>
            <p className="mt-2 text-sm text-[var(--color-text-muted)] leading-relaxed">
              {message}
            </p>
          </div>
        </div>

        {recommended && (
          <div className="rounded-[var(--radius-posta)] border border-[var(--surface-border)] bg-[var(--surface-panel-2)] px-4 py-3 text-center">
            <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-text-muted)]">
              Plan según tus repartidores
            </p>
            <p className="mt-1 text-sm font-display font-semibold text-[var(--ink-soft)]">
              {recommended.name}
            </p>
            <p className="text-xl font-bold text-[var(--color-accent)]">
              {formatArs(recommended.priceArs)}
              <span className="text-xs font-mono font-normal text-[var(--color-text-muted)]">
                /mes
              </span>
            </p>
          </div>
        )}

        {error && (
          <p className="text-xs font-mono text-[var(--color-danger)] text-center">{error}</p>
        )}

        {subscription.postaMercadoPagoConfigured === false ? (
          <p className="text-xs font-mono text-[var(--color-warn)] text-center">
            Los pagos aún no están configurados. Contactá al soporte de Posta.
          </p>
        ) : (
          <button
            type="button"
            className="btn-primary w-full py-3 text-sm font-semibold flex items-center justify-center gap-2"
            disabled={checkoutLoading}
            onClick={() => void startCheckout()}
          >
            {checkoutLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Redirigiendo…
              </>
            ) : (
              <>
                <CreditCard className="w-4 h-4" />
                Pagar suscripción
              </>
            )}
          </button>
        )}

        <button
          type="button"
          className="w-full py-2.5 text-sm font-mono text-[var(--color-text-muted)] hover:text-[var(--color-danger)] transition flex items-center justify-center gap-2"
          onClick={onLogout}
        >
          <LogOut className="w-4 h-4" />
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
