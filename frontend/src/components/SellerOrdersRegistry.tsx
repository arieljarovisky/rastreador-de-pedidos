/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ClipboardList, Search } from 'lucide-react';
import { Order, OrderStatus, User, isAgencyAdmin, UserRole } from '../types.js';
import StatusBadge, { ORDER_STATUS_LABELS } from './ui/StatusBadge.tsx';
import MarketplaceSourceIcon from './ui/MarketplaceSourceIcon.tsx';
import MarketplaceSourceFilter from './MarketplaceSourceFilter.tsx';
import SellerFilterControl from './SellerFilterControl.tsx';
import { getOrderExceptionBadge } from '../utils/orderBadge.js';
import {
  getOrderImportedDateKey,
  matchesOrderFilters,
} from '../utils/orderFilters.js';
import { formatOperationalDateShort } from '../utils/deliverySummary.js';
import { useModal } from '../context/ModalContext.tsx';

interface SellerOrdersRegistryProps {
  orders: Order[];
  sellers: User[];
  userRole: UserRole;
  initialSellerId?: string | null;
  onUpdateOrderStatus: (
    orderId: string,
    status: OrderStatus,
    repartidorId?: string,
    comment?: string
  ) => Promise<void>;
  onSelectOrder?: (orderId: string) => void;
}

export default function SellerOrdersRegistry({
  orders,
  sellers,
  userRole,
  initialSellerId = null,
  onUpdateOrderStatus,
  onSelectOrder,
}: SellerOrdersRegistryProps) {
  const { confirm, alert: showAlert } = useModal();
  const agency = isAgencyAdmin(userRole);
  const [sellerId, setSellerId] = useState(initialSellerId ?? '');
  const [marketplaceSource, setMarketplaceSource] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (initialSellerId) setSellerId(initialSellerId);
  }, [initialSellerId]);

  const scoped = useMemo(() => {
    return orders.filter((order) => {
      if (
        !matchesOrderFilters(order, {
          sellerId: sellerId || undefined,
          externalSource: marketplaceSource || undefined,
        })
      ) {
        return false;
      }
      if (statusFilter === 'archived') {
        if (!order.archived) return false;
      } else if (statusFilter !== 'all' && order.status !== statusFilter) {
        return false;
      }
      const q = searchQuery.trim().toLowerCase();
      if (!q) return true;
      return (
        order.id.toLowerCase().includes(q) ||
        order.clientName.toLowerCase().includes(q) ||
        order.address.toLowerCase().includes(q) ||
        (order.sellerName?.toLowerCase().includes(q) ?? false) ||
        (order.repartidorName?.toLowerCase().includes(q) ?? false) ||
        (order.externalOrderId?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [orders, sellerId, marketplaceSource, statusFilter, searchQuery]);

  const stats = useMemo(() => {
    const base = sellerId
      ? orders.filter((o) => o.sellerId === sellerId)
      : orders;
    return {
      total: base.length,
      pending: base.filter((o) => o.status === OrderStatus.PENDING).length,
      assigned: base.filter((o) => o.status === OrderStatus.ASSIGNED).length,
      delivering: base.filter((o) => o.status === OrderStatus.DELIVERING).length,
      delivered: base.filter((o) => o.status === OrderStatus.DELIVERED).length,
      cancelled: base.filter((o) => o.status === OrderStatus.CANCELLED).length,
      archived: base.filter((o) => o.archived).length,
    };
  }, [orders, sellerId]);

  const markDelivered = async (order: Order) => {
    if (order.externalSource === 'mercadolibre' && !agency) {
      await showAlert({
        title: 'Mercado Libre',
        message: 'Los envíos de Mercado Libre se confirman solos. No se pueden marcar a mano desde el vendedor.',
        variant: 'warning',
      });
      return;
    }
    const ok = await confirm({
      title: 'Marcar como entregado',
      message: `¿Confirmar que el envío ${order.id} ya fue entregado?`,
      variant: 'warning',
      confirmText: 'Sí, entregado',
      cancelText: 'Cancelar',
    });
    if (!ok) return;
    setBusyId(order.id);
    try {
      await onUpdateOrderStatus(
        order.id,
        OrderStatus.DELIVERED,
        undefined,
        'Marcado como entregado desde Registro'
      );
    } catch (err: unknown) {
      await showAlert({
        title: 'No se pudo marcar entregado',
        message: err instanceof Error ? err.message : 'Error al actualizar el pedido.',
        variant: 'error',
      });
    } finally {
      setBusyId(null);
    }
  };

  const selectedSeller = sellers.find((s) => s.id === sellerId);

  return (
    <div className="h-full flex flex-col min-h-0 overflow-hidden">
      <div className="shrink-0 border-b border-[var(--surface-border)] px-4 py-3 space-y-3">
        <div>
          <div className="flex items-center gap-2 text-[var(--color-accent)]">
            <ClipboardList size={16} />
            <h2 className="text-sm font-display font-bold tracking-[-0.02em] text-[var(--color-text)]">
              Envíos por vendedor
            </h2>
          </div>
          <p className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">
            Todos los pedidos de Posta (cualquier estado, fecha y tienda), no solo los paquetes personales.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {agency && sellers.length > 0 && (
            <SellerFilterControl sellers={sellers} value={sellerId} onChange={setSellerId} />
          )}
          <MarketplaceSourceFilter value={marketplaceSource} onChange={setMarketplaceSource} />
          <div className="relative min-w-0">
            <label className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--color-text-muted)] flex items-center gap-1.5 mb-1.5">
              <Search className="w-3.5 h-3.5 text-[var(--color-accent)]" />
              Buscar
            </label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Pedido, cliente, dirección…"
              className="w-full min-h-11 sm:min-h-0 sm:h-[2.375rem] bg-[var(--surface-panel-2)] border border-[var(--surface-border)] rounded-[5px] px-3 text-sm sm:text-xs text-[var(--color-text)] focus:outline-none focus:border-[var(--color-accent)]"
            />
          </div>
        </div>

        {selectedSeller && (
          <p className="text-[11px] font-mono text-[var(--color-text-muted)]">
            Historial de <span className="text-[var(--ink-soft)] font-bold">{selectedSeller.name}</span>
            {' · '}
            {stats.total} envío{stats.total === 1 ? '' : 's'}
          </p>
        )}
      </div>

      <div className="shrink-0 grid grid-cols-3 sm:grid-cols-6 gap-2 px-4 py-3 border-b border-[var(--surface-border)] bg-[var(--surface-panel-2)]/30">
        {[
          { key: 'all', label: 'Total', value: stats.total },
          { key: OrderStatus.PENDING, label: 'Pend.', value: stats.pending + stats.assigned },
          { key: OrderStatus.DELIVERING, label: 'Ruta', value: stats.delivering },
          { key: OrderStatus.DELIVERED, label: 'Listos', value: stats.delivered },
          { key: OrderStatus.CANCELLED, label: 'Canc.', value: stats.cancelled },
          { key: 'archived', label: 'Arch.', value: stats.archived },
        ].map((card) => (
          <button
            key={card.key}
            type="button"
            onClick={() => setStatusFilter(card.key)}
            className={`rounded-[5px] border px-2 py-2 text-left transition ${
              statusFilter === card.key
                ? 'border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10'
                : 'border-[var(--surface-border)] hover:bg-[var(--surface-panel)]/60'
            }`}
          >
            <div className="text-[9px] font-mono uppercase tracking-wider text-[var(--color-text-muted)]">
              {card.label}
            </div>
            <div className="text-lg font-display font-bold text-[var(--color-text)]">{card.value}</div>
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-auto px-4 py-3">
        {scoped.length === 0 ? (
          <div className="h-40 flex flex-col items-center justify-center gap-1 text-center px-4">
            <ClipboardList size={28} className="text-[var(--color-text-muted)] opacity-50" />
            <p className="text-sm text-[var(--color-text)] font-medium">Sin envíos</p>
            <p className="text-[11px] text-[var(--color-text-muted)] max-w-sm">
              {sellerId
                ? 'Este vendedor no tiene pedidos con los filtros actuales.'
                : 'Elegí un vendedor o ajustá los filtros para ver el historial.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-[5px] border border-[var(--surface-border)]">
            <table className="w-full text-left text-xs">
              <thead className="bg-[var(--surface-panel-2)] text-[9px] font-mono uppercase tracking-wider text-[var(--color-text-muted)]">
                <tr>
                  <th className="px-3 py-2 font-bold">Fecha</th>
                  <th className="px-3 py-2 font-bold">ID</th>
                  <th className="px-3 py-2 font-bold">Cliente</th>
                  <th className="px-3 py-2 font-bold">Dirección</th>
                  <th className="px-3 py-2 font-bold">Estado</th>
                  {agency && <th className="px-3 py-2 font-bold">Vendedor</th>}
                  <th className="px-3 py-2 font-bold">Repartidor</th>
                  <th className="px-3 py-2 font-bold">Acción</th>
                </tr>
              </thead>
              <tbody>
                {scoped.map((order) => {
                  const exception = getOrderExceptionBadge(order);
                  const importedKey = getOrderImportedDateKey(order);
                  const dateLabel = formatOperationalDateShort(importedKey);
                  const timeLabel = new Date(order.createdAt).toLocaleTimeString('es-AR', {
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZone: 'America/Argentina/Buenos_Aires',
                  });
                  const canDeliver =
                    order.status !== OrderStatus.DELIVERED &&
                    order.status !== OrderStatus.CANCELLED &&
                    (agency || order.externalSource !== 'mercadolibre');

                  return (
                    <tr
                      key={order.id}
                      className="border-t border-[var(--surface-border)] hover:bg-[var(--surface-panel-2)]/40"
                    >
                      <td className="px-3 py-2 font-mono text-[10px] text-[var(--color-text-muted)] whitespace-nowrap">
                        <span className="block text-[var(--ink-soft)]">{dateLabel}</span>
                        <span className="block">{timeLabel}</span>
                      </td>
                      <td className="px-3 py-2 font-mono text-[10px] whitespace-nowrap">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 text-[var(--color-accent)] hover:underline"
                          onClick={() => onSelectOrder?.(order.id)}
                          title="Ver en Envíos"
                        >
                          {order.id}
                          <MarketplaceSourceIcon source={order.externalSource} />
                        </button>
                      </td>
                      <td className="px-3 py-2 font-semibold text-[var(--ink-soft)] max-w-[9rem] truncate">
                        {order.clientName}
                      </td>
                      <td className="px-3 py-2 text-[var(--color-text-muted)] max-w-[14rem] truncate">
                        {order.address}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <StatusBadge
                          status={order.status}
                          label={exception?.label ?? ORDER_STATUS_LABELS[order.status]}
                          tone={exception?.tone}
                        />
                        {order.archived && (
                          <span className="ml-1 text-[9px] font-mono text-[var(--color-text-faint)]">
                            arch.
                          </span>
                        )}
                      </td>
                      {agency && (
                        <td className="px-3 py-2 text-[var(--color-text-muted)] max-w-[8rem] truncate">
                          {order.sellerName ?? '—'}
                        </td>
                      )}
                      <td className="px-3 py-2 text-[var(--color-text-muted)] whitespace-nowrap">
                        {order.repartidorName?.split(' ')[0] ?? '—'}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {canDeliver ? (
                          <button
                            type="button"
                            disabled={busyId === order.id}
                            onClick={() => void markDelivered(order)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded border border-[var(--color-ok)]/30 bg-[var(--color-ok)]/10 text-[var(--color-ok)] font-mono font-bold text-[9px] uppercase tracking-wider hover:bg-[var(--color-ok)]/15 disabled:opacity-50"
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            Entregado
                          </button>
                        ) : (
                          <span className="text-[var(--color-text-faint)]">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
