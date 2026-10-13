/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { apiUrl } from '../api.ts';
import MarketplaceSourceIcon from './ui/MarketplaceSourceIcon.tsx';
import {
  formatOperationalDateLabel,
  formatOperationalDateShort,
  formatOperationalWeekday,
  operationalDateKeyFromIso,
} from '../utils/deliverySummary.js';

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
  deliveryDeadline?: string | null;
  receivedFirstName: string | null;
  receivedLastName: string | null;
  receivedDni: string | null;
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

function orderDayKey(order: ProfileOrder): string {
  const stamp = order.deliveryDeadline || order.createdAt || order.updatedAt;
  return operationalDateKeyFromIso(stamp);
}

export default function RepartidorProfilePanel({
  token,
  repartidorId,
  onClose,
  embedded = false,
}: {
  token: string;
  repartidorId: string;
  onClose?: () => void;
  /** Dentro de la pestaña Repartidores, sin capa encima del panel. */
  embedded?: boolean;
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

  const ordersByDay = useMemo(() => {
    if (!data?.orders.length) return [] as Array<{ dateKey: string; orders: ProfileOrder[] }>;
    const map = new Map<string, ProfileOrder[]>();
    for (const order of data.orders) {
      const key = orderDayKey(order);
      const list = map.get(key);
      if (list) list.push(order);
      else map.set(key, [order]);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
      .map(([dateKey, orders]) => ({ dateKey, orders }));
  }, [data]);

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

  const body = (
      <aside className={`relative flex h-full min-h-0 w-full flex-col text-[var(--color-text)] ${embedded ? '' : 'max-w-xl border-l border-[var(--surface-border)] bg-[var(--surface-bg)]'}`}>
        <div className="flex items-center gap-3 border-b border-[var(--surface-border)] px-4 py-3">
          {!embedded && onClose && (
          <button
            type="button"
            onClick={onClose}
            className="grid size-9 place-items-center rounded-[var(--radius-posta)] border border-[var(--surface-border)]"
            aria-label="Volver"
          >
            <ArrowLeft className="size-4" />
          </button>
          )}
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
                <div className="space-y-5">
                  {ordersByDay.map(({ dateKey, orders }) => (
                    <section key={dateKey}>
                      <div className="mb-2 flex items-baseline justify-between gap-2 border-b border-[var(--surface-border)] pb-1.5">
                        <div>
                          <p className="text-sm font-medium text-[var(--color-text)]">
                            {formatOperationalDateLabel(dateKey)}
                          </p>
                          <p className="text-[11px] text-[var(--color-text-muted)]">
                            {formatOperationalWeekday(dateKey)} · {formatOperationalDateShort(dateKey)}
                          </p>
                        </div>
                        <p className="shrink-0 text-[11px] tabular-nums text-[var(--color-text-faint)]">
                          {orders.length} etiqueta{orders.length === 1 ? '' : 's'}
                        </p>
                      </div>
                      <ul className="space-y-2">
                        {orders.map((order) => (
                          <li
                            key={order.id}
                            className="rounded-[var(--radius-posta)] border border-[var(--surface-border)] px-3 py-2.5"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                                  {order.externalSource && (
                                    <MarketplaceSourceIcon source={order.externalSource} size="md" />
                                  )}
                                  {order.clientName}
                                </p>
                                <p className="mt-0.5 truncate text-xs text-[var(--color-text-muted)]">
                                  {order.address}
                                </p>
                                <p className="mt-1 text-[11px] text-[var(--color-text-faint)]">
                                  {STATUS_LABEL[order.status] ?? order.status}
                                  {' · '}
                                  {formatWhen(order.updatedAt)}
                                  {order.sellerName ? ` · ${order.sellerName}` : ''}
                                  {order.labelSaved ? ' · etiqueta guardada' : ''}
                                  {order.receivedFirstName && order.receivedLastName
                                    ? ` · Recibió ${order.receivedFirstName} ${order.receivedLastName}${order.receivedDni ? ` · DNI ${order.receivedDni}` : ''}`
                                    : ''}
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
                    </section>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </aside>
  );

  if (embedded) return body;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/45">
      <button type="button" aria-label="Cerrar perfil" className="absolute inset-0" onClick={onClose} />
      {body}
    </div>
  );
}
