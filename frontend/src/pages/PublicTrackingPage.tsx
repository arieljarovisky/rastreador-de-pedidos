/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader2, MapPin, Moon, Package, RefreshCw, Search, Sun } from 'lucide-react';
import PublicTrackingMap from '../components/PublicTrackingMap.tsx';
import StatusBadge from '../components/ui/StatusBadge.tsx';
import { OrderStatus } from '../types.ts';
import { applyPostaTheme, readPostaTheme, usePostaTheme } from '../theme/usePostaTheme.ts';

interface PublicTrackingData {
  status: OrderStatus;
  updatedAt: string;
  deliveryDeadline?: string;
  address: string;
  destination: { lat: number; lng: number };
  driver: { lat: number; lng: number; timestamp: string } | null;
  trail: Array<{ lat: number; lng: number; timestamp: string }>;
  timeline: Array<{ status: OrderStatus; timestamp: string; label: string }>;
  mercadolibre: { shipmentId: string | null; orderId: string | null };
}

const STATUS_HINTS: Partial<Record<OrderStatus, string>> = {
  [OrderStatus.PENDING]: 'Tu paquete está siendo preparado para salir.',
  [OrderStatus.ASSIGNED]: 'Ya hay un repartidor asignado a tu envío.',
  [OrderStatus.DELIVERING]: 'El repartidor está en camino a tu domicilio.',
  [OrderStatus.DELIVERED]: 'Tu envío fue entregado correctamente.',
  [OrderStatus.CANCELLED]: 'Este envío fue cancelado.',
};

function readRefFromUrl(): string {
  try {
    return new URLSearchParams(window.location.search).get('ref')?.trim() ?? '';
  } catch {
    return '';
  }
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('es-AR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function PublicTrackingPage() {
  const theme = usePostaTheme();
  const [refInput, setRefInput] = useState(() => readRefFromUrl());
  const [tracking, setTracking] = useState<PublicTrackingData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastQuery, setLastQuery] = useState<string | null>(null);

  const fetchTracking = useCallback(async (ref: string, silent = false) => {
    const trimmed = ref.trim();
    if (!trimmed) {
      setError('Ingresá el número de tu venta o envío de Mercado Libre.');
      return;
    }

    if (!silent) {
      setLoading(true);
      setError(null);
    }

    try {
      const res = await fetch(`/api/public/track?ref=${encodeURIComponent(trimmed)}`);
      const data = (await res.json()) as PublicTrackingData & { message?: string; error?: string };

      if (!res.ok) {
        setTracking(null);
        setError(data.message ?? 'No pudimos encontrar tu envío.');
        return;
      }

      setTracking(data);
      setLastQuery(trimmed);
      setError(null);

      const url = new URL(window.location.href);
      url.searchParams.set('ref', trimmed);
      window.history.replaceState({}, '', url.toString());
    } catch {
      setTracking(null);
      setError('Error de conexión. Verificá tu internet e intentá de nuevo.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initial = readRefFromUrl();
    if (initial) void fetchTracking(initial);
  }, [fetchTracking]);

  useEffect(() => {
    if (!tracking || tracking.status !== OrderStatus.DELIVERING || !lastQuery) return;
    const interval = window.setInterval(() => {
      void fetchTracking(lastQuery, true);
    }, 20_000);
    return () => window.clearInterval(interval);
  }, [tracking?.status, lastQuery, fetchTracking]);

  const mlLabel = useMemo(() => {
    if (!tracking) return null;
    if (tracking.mercadolibre.orderId) {
      return `Venta ML #${tracking.mercadolibre.orderId}`;
    }
    if (tracking.mercadolibre.shipmentId) {
      return `Envío ML #${tracking.mercadolibre.shipmentId}`;
    }
    return null;
  }, [tracking]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    void fetchTracking(refInput);
  };

  const toggleTheme = () => {
    applyPostaTheme(readPostaTheme() === 'dark' ? 'paper' : 'dark');
  };

  return (
    <div className="min-h-dvh bg-[var(--bg)] text-[var(--text)] flex flex-col">
      <header className="sticky top-0 z-20 border-b border-[var(--line)] bg-[var(--panel)]/95 backdrop-blur-md">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
          <a href="/" className="flex items-center gap-2 font-display font-bold text-[var(--text)] hover:text-[var(--accent)] transition">
            <ArrowLeft className="w-4 h-4 shrink-0" />
            Posta
          </a>
          <p className="mono-label hidden sm:block">Seguimiento de envío</p>
          <button
            type="button"
            onClick={toggleTheme}
            className="p-2 rounded border border-[var(--line)] hover:bg-[var(--panel-2)] transition"
            aria-label="Cambiar tema"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6">
        <div className="space-y-2">
          <span className="mono-label text-[var(--accent)]">Compradores Mercado Libre</span>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[var(--text)]">
            Seguí tu envío en vivo
          </h1>
          <p className="text-sm text-[var(--text-muted)] max-w-xl">
            Ingresá el número de tu venta o envío de Mercado Libre para ver el estado y la ubicación del repartidor.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 sm:p-5 space-y-3 shadow-sm"
        >
          <label htmlFor="ml-ref" className="mono-label block">
            N° de venta o envío ML
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              id="ml-ref"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="Ej: 2000012345678"
              value={refInput}
              onChange={(e) => setRefInput(e.target.value)}
              className="flex-1 rounded-lg border border-[var(--line)] bg-[var(--panel-2)] px-3 py-2.5 text-sm font-mono text-[var(--text)] placeholder:text-[var(--text-faint)] focus:outline-none focus:border-[var(--accent)]"
            />
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--accent)] text-white px-4 py-2.5 text-sm font-semibold hover:brightness-110 disabled:opacity-60 transition"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Buscar
            </button>
          </div>
          <p className="text-[11px] text-[var(--text-faint)] leading-relaxed">
            En Mercado Libre encontrás el número en <strong>Compras → Detalle de la venta</strong> o en la sección de envíos.
          </p>
        </form>

        {error && (
          <div className="rounded-xl border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-4 py-3 text-sm text-[var(--text)]">
            {error}
          </div>
        )}

        {tracking && (
          <div className="space-y-5">
            <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 sm:p-5 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  {mlLabel && (
                    <p className="mono-label flex items-center gap-1.5">
                      <Package className="w-3.5 h-3.5" />
                      {mlLabel}
                    </p>
                  )}
                  <StatusBadge status={tracking.status} paper={theme === 'paper'} />
                  <p className="text-sm text-[var(--text-muted)] mt-2">
                    {STATUS_HINTS[tracking.status]}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => lastQuery && void fetchTracking(lastQuery)}
                  className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--accent)] transition"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Actualizar
                </button>
              </div>

              <p className="text-sm flex items-start gap-2 text-[var(--text-muted)]">
                <MapPin className="w-4 h-4 shrink-0 mt-0.5 text-[var(--accent)]" />
                <span>{tracking.address}</span>
              </p>

              <p className="text-[11px] font-mono text-[var(--text-faint)]">
                Última actualización: {formatDateTime(tracking.updatedAt)}
                {tracking.deliveryDeadline && tracking.status !== OrderStatus.DELIVERED && (
                  <> · Entrega estimada antes de las {formatDateTime(tracking.deliveryDeadline)}</>
                )}
              </p>
            </div>

            <PublicTrackingMap
              destination={tracking.destination}
              driver={tracking.driver}
              trail={tracking.trail}
              className="h-56 sm:h-80"
            />

            {tracking.timeline.length > 0 && (
              <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 sm:p-5">
                <h2 className="font-display font-bold text-base mb-4">Historial del envío</h2>
                <ol className="space-y-3">
                  {[...tracking.timeline].reverse().map((event, index) => (
                    <li key={`${event.timestamp}-${index}`} className="flex gap-3 text-sm">
                      <span className="shrink-0 w-2 h-2 rounded-full bg-[var(--accent)] mt-1.5" />
                      <div>
                        <p className="font-medium text-[var(--text)]">{event.label}</p>
                        <p className="text-[11px] font-mono text-[var(--text-faint)]">
                          {formatDateTime(event.timestamp)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="border-t border-[var(--line)] py-6 text-center text-[11px] font-mono text-[var(--text-faint)]">
        © 2026 Posta · Seguimiento en tiempo real
      </footer>
    </div>
  );
}
