/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ClipboardList, Loader2, Package, Search, Trash2 } from 'lucide-react';
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
import { formatOperationalDateShort, getOperationalDateKey } from '../utils/deliverySummary.js';
import { useModal } from '../context/ModalContext.tsx';
import { apiUrl } from '../api.ts';
import type {
  AgencyDriverScanEntry,
  AgencyDriverScanStatus,
} from './AgencyDriverScanPage.tsx';

interface SellerOrdersRegistryProps {
  token: string;
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

type RegistryRow =
  | {
      kind: 'posta';
      id: string;
      sortAt: number;
      order: Order;
    }
  | {
      kind: 'personal';
      id: string;
      sortAt: number;
      entry: AgencyDriverScanEntry;
    };

function formatScanCodeLabel(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      const id = parsed.id ?? parsed.shipment_id ?? parsed.shipping_id ?? parsed.order_id;
      if (id != null && String(id).trim()) return String(id).trim();
    } catch {
      // fall through
    }
  }
  if (trimmed.length <= 40) return trimmed;
  const digits = trimmed.match(/\d{8,}/);
  if (digits?.[0]) return digits[0];
  return `${trimmed.slice(0, 12)}…${trimmed.slice(-8)}`;
}

function stripAddressReference(address: string): string {
  return address
    .replace(/\s*[·•]\s*Ref(?:erencia)?\s*:.+$/i, '')
    .replace(/\s+Ref(?:erencia)?\s*:.+$/i, '')
    .replace(/\s+Referencia\s*:.+$/i, '')
    .trim();
}

function personalStatusLabel(status: AgencyDriverScanStatus): string {
  if (status === 'delivered') return 'Entregado';
  if (status === 'cancelled') return 'Cancelado';
  return 'Pendiente';
}

function personalMatchesStatus(status: AgencyDriverScanStatus, filter: string): boolean {
  if (filter === 'all') return true;
  if (filter === 'archived') return false;
  if (filter === OrderStatus.DELIVERING || filter === OrderStatus.ASSIGNED) return false;
  if (filter === OrderStatus.PENDING) return status === 'pending';
  if (filter === OrderStatus.DELIVERED) return status === 'delivered';
  if (filter === OrderStatus.CANCELLED) return status === 'cancelled';
  return false;
}

export default function SellerOrdersRegistry({
  token,
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
  const [personalEntries, setPersonalEntries] = useState<AgencyDriverScanEntry[]>([]);
  const [personalLoading, setPersonalLoading] = useState(false);

  useEffect(() => {
    if (initialSellerId) setSellerId(initialSellerId);
  }, [initialSellerId]);

  const loadPersonal = useCallback(async () => {
    if (!agency || !token) {
      setPersonalEntries([]);
      return;
    }
    setPersonalLoading(true);
    try {
      const res = await fetch(apiUrl('/api/driver-scan/agency?all=1'), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'No se pudieron cargar paquetes personales.');
      setPersonalEntries(Array.isArray(body.entries) ? body.entries : []);
    } catch {
      setPersonalEntries([]);
    } finally {
      setPersonalLoading(false);
    }
  }, [agency, token]);

  useEffect(() => {
    void loadPersonal();
  }, [loadPersonal]);

  const includePersonal =
    agency &&
    !sellerId &&
    (marketplaceSource === '' || marketplaceSource === 'personal');

  const postaScoped = useMemo(() => {
    if (marketplaceSource === 'personal') return [];
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

  const personalScoped = useMemo(() => {
    if (!includePersonal) return [];
    return personalEntries.filter((entry) => {
      if (!personalMatchesStatus(entry.status, statusFilter)) return false;
      const q = searchQuery.trim().toLowerCase();
      if (!q) return true;
      const code = formatScanCodeLabel(entry.scanCode).toLowerCase();
      return (
        code.includes(q) ||
        (entry.clientName?.toLowerCase().includes(q) ?? false) ||
        (entry.address?.toLowerCase().includes(q) ?? false) ||
        (entry.repartidorName?.toLowerCase().includes(q) ?? false) ||
        entry.scanCode.toLowerCase().includes(q)
      );
    });
  }, [includePersonal, personalEntries, statusFilter, searchQuery]);

  const rows = useMemo(() => {
    const list: RegistryRow[] = [
      ...postaScoped.map((order) => ({
        kind: 'posta' as const,
        id: `posta-${order.id}`,
        sortAt: new Date(order.createdAt).getTime(),
        order,
      })),
      ...personalScoped.map((entry) => ({
        kind: 'personal' as const,
        id: `personal-${entry.id}`,
        sortAt: new Date(entry.scannedAt).getTime(),
        entry,
      })),
    ];
    return list.sort((a, b) => b.sortAt - a.sortAt);
  }, [postaScoped, personalScoped]);

  const stats = useMemo(() => {
    const postaBase = sellerId
      ? orders.filter((o) => o.sellerId === sellerId)
      : marketplaceSource === 'personal'
        ? []
        : marketplaceSource
          ? orders.filter((o) =>
              matchesOrderFilters(o, { externalSource: marketplaceSource })
            )
          : orders;
    const personalBase =
      agency && !sellerId && (marketplaceSource === '' || marketplaceSource === 'personal')
        ? personalEntries
        : [];

    return {
      total: postaBase.length + personalBase.length,
      pending:
        postaBase.filter((o) => o.status === OrderStatus.PENDING || o.status === OrderStatus.ASSIGNED)
          .length + personalBase.filter((e) => e.status === 'pending').length,
      delivering: postaBase.filter((o) => o.status === OrderStatus.DELIVERING).length,
      delivered:
        postaBase.filter((o) => o.status === OrderStatus.DELIVERED).length +
        personalBase.filter((e) => e.status === 'delivered').length,
      cancelled:
        postaBase.filter((o) => o.status === OrderStatus.CANCELLED).length +
        personalBase.filter((e) => e.status === 'cancelled').length,
      archived: postaBase.filter((o) => o.archived).length,
      personal: personalBase.length,
    };
  }, [orders, sellerId, marketplaceSource, agency, personalEntries]);

  const markPostaDelivered = async (order: Order) => {
    if (order.externalSource === 'mercadolibre' && !agency) {
      await showAlert({
        title: 'Mercado Libre',
        message:
          'Los envíos de Mercado Libre se confirman solos. No se pueden marcar a mano desde el vendedor.',
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

  const markPersonalDelivered = async (entry: AgencyDriverScanEntry) => {
    const label = entry.clientName?.trim() || formatScanCodeLabel(entry.scanCode);
    const ok = await confirm({
      title: 'Marcar como entregado',
      message: `¿Confirmar entrega de "${label}"?`,
      variant: 'warning',
      confirmText: 'Sí, entregado',
      cancelText: 'Cancelar',
    });
    if (!ok) return;
    setBusyId(entry.id);
    try {
      const res = await fetch(apiUrl(`/api/driver-scan/${entry.id}/status`), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: 'delivered' }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'No se pudo marcar entregado.');
      setPersonalEntries((prev) =>
        prev.map((e) => (e.id === entry.id ? { ...e, ...(body as AgencyDriverScanEntry) } : e))
      );
    } catch (err: unknown) {
      await showAlert({
        title: 'No se pudo marcar entregado',
        message: err instanceof Error ? err.message : 'Error al actualizar.',
        variant: 'error',
      });
    } finally {
      setBusyId(null);
    }
  };

  const deletePersonal = async (entry: AgencyDriverScanEntry) => {
    const label = entry.clientName?.trim() || formatScanCodeLabel(entry.scanCode);
    const ok = await confirm({
      title: 'Eliminar paquete personal',
      message: `¿Eliminar "${label}" del registro?`,
      variant: 'danger',
      confirmText: 'Eliminar',
      cancelText: 'Cancelar',
    });
    if (!ok) return;
    setBusyId(entry.id);
    try {
      const res = await fetch(apiUrl(`/api/driver-scan/${entry.id}`), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok && res.status !== 204) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'No se pudo eliminar.');
      }
      setPersonalEntries((prev) => prev.filter((e) => e.id !== entry.id));
    } catch (err: unknown) {
      await showAlert({
        title: 'No se pudo eliminar',
        message: err instanceof Error ? err.message : 'Error al eliminar.',
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
              Registro
            </h2>
          </div>
          <p className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">
            Envíos Posta y paquetes personales en la misma lista.
            {personalLoading ? ' · Cargando personales…' : ''}
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
        {sellerId && (
          <p className="text-[10px] text-[var(--color-text-faint)]">
            Los paquetes personales no tienen vendedor: se ocultan al filtrar por uno.
          </p>
        )}
      </div>

      <div className="shrink-0 grid grid-cols-3 sm:grid-cols-6 gap-2 px-4 py-3 border-b border-[var(--surface-border)] bg-[var(--surface-panel-2)]/30">
        {[
          { key: 'all', label: 'Total', value: stats.total },
          { key: OrderStatus.PENDING, label: 'Pend.', value: stats.pending },
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
        {rows.length === 0 ? (
          <div className="h-40 flex flex-col items-center justify-center gap-1 text-center px-4">
            {personalLoading ? (
              <Loader2 size={22} className="animate-spin text-[var(--color-text-muted)]" />
            ) : (
              <ClipboardList size={28} className="text-[var(--color-text-muted)] opacity-50" />
            )}
            <p className="text-sm text-[var(--color-text)] font-medium">Sin registros</p>
            <p className="text-[11px] text-[var(--color-text-muted)] max-w-sm">
              {sellerId
                ? 'Este vendedor no tiene pedidos con los filtros actuales.'
                : 'Ajustá los filtros o importá / escaneá envíos para verlos acá.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-[5px] border border-[var(--surface-border)]">
            <table className="w-full text-left text-xs">
              <thead className="bg-[var(--surface-panel-2)] text-[9px] font-mono uppercase tracking-wider text-[var(--color-text-muted)]">
                <tr>
                  <th className="px-3 py-2 font-bold">Fecha</th>
                  <th className="px-3 py-2 font-bold">Tipo</th>
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
                {rows.map((row) => {
                  if (row.kind === 'posta') {
                    const order = row.order;
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
                        key={row.id}
                        className="border-t border-[var(--surface-border)] hover:bg-[var(--surface-panel-2)]/40"
                      >
                        <td className="px-3 py-2 font-mono text-[10px] text-[var(--color-text-muted)] whitespace-nowrap">
                          <span className="block text-[var(--ink-soft)]">{dateLabel}</span>
                          <span className="block">{timeLabel}</span>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span className="inline-flex px-1.5 py-0.5 rounded border border-[var(--color-accent)]/25 bg-[var(--color-accent)]/10 text-[var(--color-accent)] text-[9px] font-mono font-bold uppercase">
                            Posta
                          </span>
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
                              onClick={() => void markPostaDelivered(order)}
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
                  }

                  const entry = row.entry;
                  const dateLabel = formatOperationalDateShort(
                    entry.routeDate || getOperationalDateKey(new Date(entry.scannedAt))
                  );
                  const timeLabel = new Date(entry.scannedAt).toLocaleTimeString('es-AR', {
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZone: 'America/Argentina/Buenos_Aires',
                  });
                  const canDeliver = entry.status === 'pending';

                  return (
                    <tr
                      key={row.id}
                      className="border-t border-[var(--surface-border)] hover:bg-[var(--surface-panel-2)]/40"
                    >
                      <td className="px-3 py-2 font-mono text-[10px] text-[var(--color-text-muted)] whitespace-nowrap">
                        <span className="block text-[var(--ink-soft)]">{dateLabel}</span>
                        <span className="block">{timeLabel}</span>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-[var(--color-warn)]/30 bg-[var(--color-warn)]/10 text-[var(--color-warn)] text-[9px] font-mono font-bold uppercase">
                          <Package className="w-3 h-3" />
                          Personal
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono text-[10px] text-[var(--ink-soft)] whitespace-nowrap">
                        {formatScanCodeLabel(entry.scanCode)}
                      </td>
                      <td className="px-3 py-2 font-semibold text-[var(--ink-soft)] max-w-[9rem] truncate">
                        {entry.clientName?.trim() || '—'}
                      </td>
                      <td className="px-3 py-2 text-[var(--color-text-muted)] max-w-[14rem] truncate">
                        {entry.address?.trim()
                          ? stripAddressReference(entry.address.trim())
                          : '—'}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded border text-[10px] font-mono font-bold uppercase tracking-wide ${
                            entry.status === 'delivered'
                              ? 'text-[var(--color-ok)] border-[var(--color-ok)]/30 bg-[var(--color-ok)]/10'
                              : entry.status === 'cancelled'
                                ? 'text-[var(--color-danger)] border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10'
                                : 'text-[var(--color-accent)] border-[var(--color-accent)]/30 bg-[var(--color-accent)]/10'
                          }`}
                        >
                          {personalStatusLabel(entry.status)}
                        </span>
                      </td>
                      {agency && (
                        <td className="px-3 py-2 text-[var(--color-text-faint)]">—</td>
                      )}
                      <td className="px-3 py-2 text-[var(--color-text-muted)] whitespace-nowrap">
                        {entry.repartidorName?.split(' ')[0] ?? '—'}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          {canDeliver && (
                            <button
                              type="button"
                              disabled={busyId === entry.id}
                              onClick={() => void markPersonalDelivered(entry)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded border border-[var(--color-ok)]/30 bg-[var(--color-ok)]/10 text-[var(--color-ok)] font-mono font-bold text-[9px] uppercase tracking-wider hover:bg-[var(--color-ok)]/15 disabled:opacity-50"
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              Entregado
                            </button>
                          )}
                          <button
                            type="button"
                            title="Eliminar"
                            disabled={busyId === entry.id}
                            onClick={() => void deletePersonal(entry)}
                            className="inline-flex items-center justify-center p-1.5 rounded border border-[var(--color-danger)]/30 text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 disabled:opacity-50"
                          >
                            {busyId === entry.id ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <Trash2 size={14} />
                            )}
                          </button>
                        </div>
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
