/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, Loader2, Package, Search, Trash2, X } from 'lucide-react';
import { Order, OrderStatus, User, isAgencyAdmin, UserRole } from '../types.js';
import StatusBadge, { ORDER_STATUS_LABELS } from './ui/StatusBadge.tsx';
import MarketplaceSourceIcon from './ui/MarketplaceSourceIcon.tsx';
import MarketplaceSourceFilter from './MarketplaceSourceFilter.tsx';
import SellerFilterControl from './SellerFilterControl.tsx';
import OperationalDatePicker from './OperationalDatePicker.tsx';
import { getOrderExceptionBadge } from '../utils/orderBadge.js';
import {
  getOrderImportedDateKey,
} from '../utils/orderFilters.js';
import { formatOperationalDateShort, getOperationalDateKey } from '../utils/deliverySummary.js';
import { useModal } from '../context/ModalContext.tsx';
import { apiUrl, fetchOrdersRegistry, type OrdersRegistryStats } from '../api.ts';
import type {
  AgencyDriverScanEntry,
  AgencyDriverScanStatus,
} from './AgencyDriverScanPage.tsx';

const PAGE_SIZE = 25;
const EMPTY_STATS: OrdersRegistryStats = {
  total: 0,
  pending: 0,
  delivering: 0,
  delivered: 0,
  cancelled: 0,
  archived: 0,
};

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
  const [dateFromKey, setDateFromKey] = useState('');
  const [dateToKey, setDateToKey] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [personalEntries, setPersonalEntries] = useState<AgencyDriverScanEntry[]>([]);
  const [personalLoading, setPersonalLoading] = useState(false);
  const [pageOrders, setPageOrders] = useState<Order[]>([]);
  const [postaTotal, setPostaTotal] = useState(0);
  const [postaStats, setPostaStats] = useState<OrdersRegistryStats>(EMPTY_STATS);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);

  useEffect(() => {
    if (initialSellerId) setSellerId(initialSellerId);
  }, [initialSellerId]);

  useEffect(() => {
    const t = window.setTimeout(() => setSearchDebounced(searchQuery.trim()), 300);
    return () => window.clearTimeout(t);
  }, [searchQuery]);

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

  const personalScoped = useMemo(() => {
    if (!includePersonal) return [];
    return personalEntries
      .filter((entry) => {
        if (!personalMatchesStatus(entry.status, statusFilter)) return false;
        if (dateFromKey || dateToKey) {
          const entryDay =
            entry.routeDate || getOperationalDateKey(new Date(entry.scannedAt));
          const from = dateFromKey && dateToKey && dateFromKey > dateToKey ? dateToKey : dateFromKey;
          const to = dateFromKey && dateToKey && dateFromKey > dateToKey ? dateFromKey : dateToKey;
          if (from && entryDay < from) return false;
          if (to && entryDay > to) return false;
        }
        const q = searchDebounced.toLowerCase();
        if (!q) return true;
        const code = formatScanCodeLabel(entry.scanCode).toLowerCase();
        return (
          code.includes(q) ||
          (entry.clientName?.toLowerCase().includes(q) ?? false) ||
          (entry.address?.toLowerCase().includes(q) ?? false) ||
          (entry.repartidorName?.toLowerCase().includes(q) ?? false) ||
          entry.scanCode.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => new Date(b.scannedAt).getTime() - new Date(a.scannedAt).getTime());
  }, [includePersonal, personalEntries, statusFilter, searchDebounced, dateFromKey, dateToKey]);

  const personalN = marketplaceSource === 'personal' ? personalScoped.length : includePersonal ? personalScoped.length : 0;
  const onlyPersonal = marketplaceSource === 'personal';
  const onlyPosta = !includePersonal || (marketplaceSource !== '' && marketplaceSource !== 'personal');

  // Offset/limit de Posta según si los personales van primero en la lista.
  const postaQuery = useMemo(() => {
    if (onlyPersonal) return { offset: 0, limit: 0, skip: true as const };
    const start = (page - 1) * PAGE_SIZE;
    if (onlyPosta || personalN === 0) {
      return { offset: start, limit: PAGE_SIZE, skip: false as const };
    }
    if (start + PAGE_SIZE <= personalN) {
      return { offset: 0, limit: 0, skip: true as const };
    }
    if (start < personalN) {
      return { offset: 0, limit: PAGE_SIZE - (personalN - start), skip: false as const };
    }
    return { offset: start - personalN, limit: PAGE_SIZE, skip: false as const };
  }, [onlyPersonal, onlyPosta, page, personalN]);

  const loadRegistryPage = useCallback(
    async (signal?: AbortSignal) => {
      if (!token) {
        setPageOrders([]);
        setPostaTotal(0);
        setPostaStats(EMPTY_STATS);
        setHistoryLoading(false);
        return;
      }
      if (onlyPersonal) {
        setPageOrders([]);
        setPostaTotal(0);
        setPostaStats(EMPTY_STATS);
        setHistoryLoading(false);
        setHistoryError(null);
        return;
      }
      setHistoryLoading(true);
      setHistoryError(null);
      try {
        const limit = postaQuery.skip || postaQuery.limit === 0 ? 1 : postaQuery.limit;
        const offset = postaQuery.skip || postaQuery.limit === 0 ? 0 : postaQuery.offset;
        const data = await fetchOrdersRegistry(token, {
          limit,
          offset,
          sellerId: sellerId || undefined,
          externalSource: marketplaceSource || undefined,
          status: statusFilter,
          dateFrom: dateFromKey || undefined,
          dateTo: dateToKey || undefined,
          q: searchDebounced || undefined,
          signal,
        });
        if (signal?.aborted) return;
        setPageOrders(
          postaQuery.skip || postaQuery.limit === 0 ? [] : (data.items as Order[])
        );
        setPostaTotal(data.total);
        setPostaStats(data.stats);
      } catch (err) {
        if (signal?.aborted) return;
        setHistoryError(err instanceof Error ? err.message : 'No se pudo cargar el historial');
        setPageOrders([]);
        setPostaTotal(0);
        setPostaStats(EMPTY_STATS);
      } finally {
        if (!signal?.aborted) setHistoryLoading(false);
      }
    },
    [
      token,
      onlyPersonal,
      postaQuery.skip,
      postaQuery.limit,
      postaQuery.offset,
      sellerId,
      marketplaceSource,
      statusFilter,
      dateFromKey,
      dateToKey,
      searchDebounced,
    ]
  );

  useEffect(() => {
    const ac = new AbortController();
    void loadRegistryPage(ac.signal);
    return () => ac.abort();
  }, [loadRegistryPage]);

  // Sync liviano: si el listado operativo actualiza un pedido visible, refrescar la fila.
  useEffect(() => {
    if (orders.length === 0 || pageOrders.length === 0) return;
    setPageOrders((prev) => {
      let changed = false;
      const next = prev.map((o) => {
        const live = orders.find((x) => x.id === o.id);
        if (
          live &&
          (live.updatedAt !== o.updatedAt ||
            live.status !== o.status ||
            live.archived !== o.archived ||
            live.repartidorId !== o.repartidorId)
        ) {
          changed = true;
          return live;
        }
        return o;
      });
      return changed ? next : prev;
    });
  }, [orders, pageOrders.length]);

  const pageRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    const personalRows: RegistryRow[] = personalScoped.map((entry) => ({
      kind: 'personal' as const,
      id: `personal-${entry.id}`,
      sortAt: new Date(entry.scannedAt).getTime(),
      entry,
    }));
    const postaRows: RegistryRow[] = pageOrders.map((order) => ({
      kind: 'posta' as const,
      id: `posta-${order.id}`,
      sortAt: new Date(order.createdAt).getTime(),
      order,
    }));

    if (onlyPersonal) {
      return personalRows.slice(start, start + PAGE_SIZE);
    }
    if (onlyPosta || personalN === 0) {
      return postaRows;
    }
    // Personales primero (ya ordenados), luego la página de Posta del servidor.
    if (start + PAGE_SIZE <= personalN) {
      return personalRows.slice(start, start + PAGE_SIZE);
    }
    if (start < personalN) {
      return [...personalRows.slice(start), ...postaRows];
    }
    return postaRows;
  }, [page, personalScoped, pageOrders, onlyPersonal, onlyPosta, personalN]);

  const totalCount = onlyPersonal ? personalN : postaTotal + (includePersonal ? personalN : 0);
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  useEffect(() => {
    setPage(1);
  }, [sellerId, marketplaceSource, statusFilter, searchDebounced, dateFromKey, dateToKey]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const stats = useMemo(() => {
    const personalBase = includePersonal ? personalEntries : [];
    const personalPending = personalBase.filter((e) => e.status === 'pending').length;
    const personalDelivered = personalBase.filter((e) => e.status === 'delivered').length;
    const personalCancelled = personalBase.filter((e) => e.status === 'cancelled').length;

    if (marketplaceSource === 'personal') {
      return {
        total: personalBase.length,
        pending: personalPending,
        delivering: 0,
        delivered: personalDelivered,
        cancelled: personalCancelled,
        archived: 0,
        personal: personalBase.length,
      };
    }

    return {
      total: postaStats.total + (includePersonal ? personalBase.length : 0),
      pending: postaStats.pending + (includePersonal ? personalPending : 0),
      delivering: postaStats.delivering,
      delivered: postaStats.delivered + (includePersonal ? personalDelivered : 0),
      cancelled: postaStats.cancelled + (includePersonal ? personalCancelled : 0),
      archived: postaStats.archived,
      personal: includePersonal ? personalBase.length : 0,
    };
  }, [postaStats, includePersonal, personalEntries, marketplaceSource]);

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
      setPageOrders((prev) =>
        prev.map((o) =>
          o.id === order.id
            ? { ...o, status: OrderStatus.DELIVERED, updatedAt: new Date().toISOString() }
            : o
        )
      );
      void loadRegistryPage();
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
    <div className="w-full flex flex-col">
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
            {historyLoading ? ' · Cargando historial…' : ''}
            {personalLoading ? ' · Cargando personales…' : ''}
          </p>
          {historyError && (
            <p className="mt-1 text-[11px] text-[var(--color-danger)]">
              {historyError}{' '}
              <button
                type="button"
                className="underline font-semibold"
                onClick={() => void loadRegistryPage()}
              >
                Reintentar
              </button>
            </p>
          )}
        </div>

        <div className="space-y-2">
          <div className="rounded-[5px] border border-[var(--surface-border)] bg-[var(--surface-panel-2)]/40 p-2.5 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
                Rango de fechas
              </span>
              {(dateFromKey || dateToKey) && (
                <button
                  type="button"
                  onClick={() => {
                    setDateFromKey('');
                    setDateToKey('');
                  }}
                  className="inline-flex items-center gap-1 text-[9px] font-mono font-bold uppercase tracking-wider text-[var(--color-text-muted)] hover:text-[var(--color-accent)] transition"
                >
                  <X className="w-3 h-3" />
                  Limpiar
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <OperationalDatePicker
                layout="field"
                label="Desde"
                empty={!dateFromKey}
                placeholder="Sin fecha"
                value={dateFromKey || dateToKey || getOperationalDateKey()}
                onChange={setDateFromKey}
                maxDateKey={dateToKey || getOperationalDateKey()}
              />
              <OperationalDatePicker
                layout="field"
                label="Hasta"
                empty={!dateToKey}
                placeholder="Sin fecha"
                value={dateToKey || dateFromKey || getOperationalDateKey()}
                onChange={setDateToKey}
                minDateKey={dateFromKey || undefined}
                maxDateKey={getOperationalDateKey()}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {agency && sellers.length > 0 && (
              <SellerFilterControl sellers={sellers} value={sellerId} onChange={setSellerId} />
            )}
            <MarketplaceSourceFilter value={marketplaceSource} onChange={setMarketplaceSource} />
            <div className="relative min-w-0 sm:col-span-2 lg:col-span-1">
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
            onClick={() => {
              setStatusFilter(card.key);
              setPage(1);
            }}
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

      {/* Paginación sticky: queda visible al scrollear */}
      <div className="sticky top-0 z-30 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-2.5 border-b border-[var(--surface-border)] bg-[var(--surface-panel)]/95 backdrop-blur-md shadow-[0_1px_0_0_var(--surface-border)]">
        <p className="text-[10px] font-mono text-[var(--color-text-muted)]">
          {historyLoading && pageRows.length === 0
            ? 'Cargando…'
            : totalCount === 0
              ? '0 registros'
              : `${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, totalCount)} de ${totalCount}`}
          {' · '}
          {PAGE_SIZE} por página
          {dateFromKey || dateToKey
            ? ` · ${dateFromKey ? formatOperationalDateShort(dateFromKey) : '…'} → ${dateToKey ? formatOperationalDateShort(dateToKey) : '…'}`
            : ''}
        </p>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={currentPage <= 1 || historyLoading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-[5px] border border-[var(--surface-border)] bg-[var(--surface-panel-2)] text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--ink-soft)] hover:border-[var(--color-accent)]/40 disabled:opacity-35 disabled:pointer-events-none"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Anterior
          </button>
          <span className="min-w-[4.5rem] text-center text-[11px] font-mono font-bold text-[var(--ink-soft)]">
            {currentPage} / {totalPages}
          </span>
          <button
            type="button"
            disabled={currentPage >= totalPages || historyLoading}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-[5px] border border-[var(--surface-border)] bg-[var(--surface-panel-2)] text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--ink-soft)] hover:border-[var(--color-accent)]/40 disabled:opacity-35 disabled:pointer-events-none"
          >
            Siguiente
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="px-4 py-3 pb-6">
        {historyLoading && pageRows.length === 0 ? (
          <div className="h-40 flex flex-col items-center justify-center gap-2 text-center px-4">
            <Loader2 size={22} className="animate-spin text-[var(--color-text-muted)]" />
            <p className="text-sm text-[var(--color-text)] font-medium">Cargando historial…</p>
            <p className="text-[11px] text-[var(--color-text-muted)]">
              Página {currentPage} · {PAGE_SIZE} por página.
            </p>
          </div>
        ) : pageRows.length === 0 ? (
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
          <div className="space-y-3">
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
                {pageRows.map((row) => {
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
                          {order.externalSource ? (
                            <MarketplaceSourceIcon source={order.externalSource} size="md" />
                          ) : (
                            <span
                              className="inline-flex items-center justify-center h-4 w-4 rounded-[3px] border border-[var(--surface-border)] bg-[var(--surface-panel-2)]"
                              title="Carga manual"
                            >
                              <Package className="w-2.5 h-2.5 text-[var(--color-text-muted)]" />
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 font-mono text-[10px] whitespace-nowrap">
                          <button
                            type="button"
                            className="text-[var(--color-accent)] hover:underline"
                            onClick={() => onSelectOrder?.(order.id)}
                            title="Ver en Envíos"
                          >
                            {order.id}
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
          </div>
        )}
      </div>
    </div>
  );
}
