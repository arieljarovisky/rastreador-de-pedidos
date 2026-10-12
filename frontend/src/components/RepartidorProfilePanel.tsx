/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { apiUrl } from '../api.ts';
import MarketplaceSourceIcon from './ui/MarketplaceSourceIcon.tsx';

interface ProfileOrder {
  id: string;
  clientName: string;
  address: string;
  status: string;
  externalSource: string | null;
  externalOrderId: string | null;
  sellerName: string | null;
  createdAt: string;
  updatedAt: string;
  labelSaved: boolean;
}

interface ProfileResponse {
  repartidor: { id: string; name: string; username: string; deliveryZone: string | null };
  stats: { total: number; delivered: number; delivering: number; cancelled: number };
  orders: ProfileOrder[];
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pendiente',
  assigned: 'Asignado',
  delivering: 'En viaje',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
};

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export default function RepartidorProfilePanel({
  token,
  repartidorId,
  onClose,
}: {
  token: string;
  repartidorId: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<ProfileResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [labelError, setLabelError] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    void fetch(apiUrl(`/api/accounts/repartidores/${repartidorId}/profile`), {
      headers: { Authorization: `Bearer ${token}` },
      signal: ac.signal,
    })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((body as { error?: string }).error || 'No se pudo cargar el perfil.');
        setData(body as ProfileResponse);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'No se pudo cargar el perfil.');
      })
      .finally(() => setLoading(false));
    return () => ac.abort();
  }, [token, repartidorId]);

  async function openLabel(orderId: string) {
    setOpeningId(orderId);
    setLabelError(null);
    try {
      const res = await fetch(apiUrl(`/api/orders/${orderId}/shipping-label`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error || 'No se pudo abrir la etiqueta.');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setData((current) =>
        current
          ? {
              ...current,
              orders: current.orders.map((order) =>
                order.id === orderId ? { ...order, labelSaved: true } : order
              ),
            }
          : current
      );
    } catch (err) {
      setLabelError(err instanceof Error ? err.message : 'No se pudo abrir la etiqueta.');
    } finally {
      setOpeningId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/45">
      <button type="button" aria-label="Cerrar perfil" className="absolute inset-0" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-xl flex-col border-l border-[var(--surface-border)] bg-[var(--surface-bg)] text-[var(--color-text)]">
        <div className="flex items-center gap-3 border-b border-[var(--surface-border)] px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="grid size-9 place-items-center rounded-[var(--radius-posta)] border border-[var(--surface-border)]"
            aria-label="Volver"
          >
            <ArrowLeft className="size-4" />
          </button>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{data?.repartidor.name ?? 'Repartidor'}</p>
            <p className="truncate text-[11px] text-[var(--color-text-muted)]">
              {data ? `@${data.repartidor.username}` : 'Cargando pedidos…'}
            </p>
          </div>
        </div>

        {loading && (
          <div className="flex flex-1 items-center justify-center text-[var(--color-text-muted)]">
            <Loader2 className="size-5 animate-spin" />
          </div>
        )}

        {!loading && error && (
          <p className="px-4 py-6 text-sm text-[var(--color-danger)]">{error}</p>
        )}

        {!loading && data && (
          <>
            <div className="grid grid-cols-4 gap-2 border-b border-[var(--surface-border)] px-4 py-3">
              {[
                ['Total', data.stats.total],
                ['En ruta', data.stats.delivering],
                ['Listos', data.stats.delivered],
                ['Canc.', data.stats.cancelled],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-[var(--radius-posta)] border border-[var(--surface-border)] px-2 py-2">
                  <p className="text-[10px] text-[var(--color-text-muted)]">{label}</p>
                  <p className="text-lg font-medium tabular-nums">{value}</p>
                </div>
              ))}
            </div>
            {labelError && (
              <p className="px-4 pt-3 text-xs text-[var(--color-danger)]">{labelError}</p>
            )}
            <div className="flex-1 overflow-y-auto px-4 py-3">
              {data.orders.length === 0 ? (
                <p className="text-sm text-[var(--color-text-muted)]">Este repartidor todavía no tiene pedidos.</p>
              ) : (
                <ul className="space-y-2">
                  {data.orders.map((order) => (
                    <li
                      key={order.id}
                      className="rounded-[var(--radius-posta)] border border-[var(--surface-border)] px-3 py-2.5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                            {order.externalSource && <MarketplaceSourceIcon source={order.externalSource} size="md" />}
                            {order.clientName}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-[var(--color-text-muted)]">{order.address}</p>
                          <p className="mt-1 text-[11px] text-[var(--color-text-faint)]">
                            {STATUS_LABEL[order.status] ?? order.status}
                            {' · '}
                            {formatWhen(order.updatedAt)}
                            {order.sellerName ? ` · ${order.sellerName}` : ''}
                            {order.labelSaved ? ' · etiqueta guardada' : ''}
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={openingId === order.id}
                          onClick={() => void openLabel(order.id)}
                          className="shrink-0 rounded-[var(--radius-posta)] border border-[var(--surface-border)] px-2.5 py-1.5 text-[11px] hover:border-[var(--color-accent)]"
                        >
                          {openingId === order.id ? 'Abriendo…' : 'Ver etiqueta'}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
