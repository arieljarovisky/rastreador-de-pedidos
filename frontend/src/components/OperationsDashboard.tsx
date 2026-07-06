/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import {
  Clock,
  CheckCircle2,
  AlertTriangle,
  Package,
  Truck,
  Users,
  MapPin,
  ChevronRight,
  Bike,
  Layers,
} from 'lucide-react';
import { Order, OrderStatus, User, UserRole, isAgencyAdmin } from '../types.js';
import StatusBadge from './ui/StatusBadge.tsx';
import {
  computeDeliverySummaryFromOrders,
  formatMinutesUntilDeadline,
  getUndeliveredTodayOrders,
  getDeliveredTodayOrders,
  getDeliveredLateTodayOrders,
  getOrderDeliveredAt,
  DELIVERY_DEADLINE_HOUR,
  DELIVERY_TIMEZONE_LABEL,
  formatArTime,
} from '../utils/deliverySummary.js';

interface OperationsDashboardProps {
  orders: Order[];
  repartidores?: User[];
  sellers?: User[];
  userRole?: UserRole;
  onSelectOrder?: (orderId: string) => void;
  onGoToOperations?: () => void;
}

export default function OperationsDashboard({
  orders,
  repartidores = [],
  sellers = [],
  userRole,
  onSelectOrder,
  onGoToOperations,
}: OperationsDashboardProps) {
  const summary = useMemo(() => computeDeliverySummaryFromOrders(orders), [orders]);
  const undelivered = useMemo(() => getUndeliveredTodayOrders(orders), [orders]);
  const delivered = useMemo(() => getDeliveredTodayOrders(orders), [orders]);
  const deliveredLate = useMemo(() => getDeliveredLateTodayOrders(orders), [orders]);

  const statusBreakdown = useMemo(() => {
    const undeliveredToday = getUndeliveredTodayOrders(orders);
    return {
      pending: undeliveredToday.filter((o) => o.status === OrderStatus.PENDING).length,
      assigned: undeliveredToday.filter((o) => o.status === OrderStatus.ASSIGNED).length,
      delivering: undeliveredToday.filter((o) => o.status === OrderStatus.DELIVERING).length,
    };
  }, [orders]);

  const sellerBreakdown = useMemo(() => {
    if (!isAgencyAdmin(userRole)) return [];
    const map = new Map<string, { name: string; undelivered: number; delivered: number }>();
    for (const order of orders) {
      if (!order.sellerId) continue;
      const isUndelivered =
        getUndeliveredTodayOrders([order]).length > 0;
      const isDelivered = getDeliveredTodayOrders([order]).length > 0;
      if (!isUndelivered && !isDelivered) continue;
      const entry = map.get(order.sellerId) ?? {
        name: order.sellerName ?? 'Sin nombre',
        undelivered: 0,
        delivered: 0,
      };
      if (isUndelivered) entry.undelivered += 1;
      if (isDelivered) entry.delivered += 1;
      map.set(order.sellerId, entry);
    }
    return [...map.values()].sort((a, b) => b.undelivered - a.undelivered);
  }, [orders, userRole]);

  const enRouteCount = repartidores.filter((r) => r.currentLocation).length;
  const progressPct =
    summary.total > 0 ? Math.round((summary.delivered / summary.total) * 100) : 0;

  const urgency =
    summary.isPastDeadline && summary.undelivered > 0
      ? 'overdue'
      : summary.undelivered > 0 && summary.minutesUntilDeadline <= 120
        ? 'warning'
        : 'ok';

  const isAgency = isAgencyAdmin(userRole);

  return (
    <div className="h-full flex flex-col min-h-0 overflow-hidden posta-surface" id="operations-dashboard">
      <div className="shrink-0 p-3 sm:p-4 border-b border-[var(--surface-border)] space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
              {isAgency ? 'Posta Agencia' : 'Posta Envios'} · Panel del día
            </p>
            <h1 className="text-lg sm:text-xl font-display font-bold text-[var(--ink-soft)] mt-0.5">
              Control de entregas
            </h1>
            <p className="text-[11px] text-[var(--color-text-muted)] mt-1 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              Corte {DELIVERY_DEADLINE_HOUR}:00 hs ({DELIVERY_TIMEZONE_LABEL}) ·{' '}
              {summary.isPastDeadline
                ? 'vencido'
                : formatMinutesUntilDeadline(summary.minutesUntilDeadline)}
              {' · ahora '}
              {formatArTime()} hs
            </p>
          </div>
          {onGoToOperations && (
            <button
              type="button"
              onClick={onGoToOperations}
              className="shrink-0 px-3 py-2 rounded-[5px] bg-[var(--color-cta)] hover:brightness-110 text-[#F6F0E4] font-mono font-bold text-[10px] uppercase tracking-wider flex items-center gap-1"
            >
              Mapa y pedidos
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-2">
          <KpiCard label="Total pedidos" value={summary.total} tone="accent" icon={Layers} />
          <KpiCard label="Entregados" value={summary.delivered} tone="ok" icon={CheckCircle2} />
          <KpiCard label="Sin entregar" value={summary.undelivered} tone={summary.undelivered > 0 ? 'warn' : 'neutral'} icon={Package} />
          <KpiCard label="Fuera plazo" value={summary.overdue} tone={summary.overdue > 0 ? 'danger' : 'neutral'} icon={AlertTriangle} />
          <KpiCard
            label="Entreg. tarde"
            value={summary.deliveredLate}
            tone={summary.deliveredLate > 0 ? 'danger' : 'neutral'}
            icon={AlertTriangle}
          />
          <KpiCard label="En ruta" value={statusBreakdown.delivering} tone="warn" icon={Truck} />
          <KpiCard label="Pendientes" value={statusBreakdown.pending + statusBreakdown.assigned} tone="neutral" icon={Package} />
          {isAgency && (
            <KpiCard label="Repartidores GPS" value={enRouteCount} sub={`/${repartidores.length}`} tone="accent" icon={MapPin} />
          )}
        </div>

        {summary.total > 0 && (
          <div>
            <div className="flex justify-between text-[10px] font-mono text-[var(--color-text-muted)] mb-1">
              <span>Progreso del día ({summary.total} pedidos)</span>
              <span className={urgency === 'overdue' ? 'text-[var(--color-danger)] font-bold' : ''}>
                {progressPct}%
              </span>
            </div>
            <div className="h-2 bg-[var(--surface-panel-2)] rounded-full overflow-hidden border border-[var(--surface-border)]">
              <div
                className="h-full bg-[var(--color-ok)] transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4 space-y-4 scrollbar-thin">
        <div className="grid lg:grid-cols-3 gap-4">
          <OrderListSection
            title="Sin entregar hoy"
            count={undelivered.length}
            orders={undelivered}
            emptyMessage="Todos los pedidos del día fueron entregados."
            tone="warn"
            onSelectOrder={onSelectOrder}
            showSeller={isAgency}
          />
          <OrderListSection
            title="Entregados hoy"
            count={delivered.length}
            orders={delivered}
            emptyMessage="Todavía no hay entregas registradas hoy."
            tone="ok"
            onSelectOrder={onSelectOrder}
            showSeller={isAgency}
          />
          <OrderListSection
            title="Entregados fuera de plazo"
            count={deliveredLate.length}
            orders={deliveredLate}
            emptyMessage="Ningún pedido entregado después del corte de las 21:00."
            tone="danger"
            onSelectOrder={onSelectOrder}
            showSeller={isAgency}
            showDeliveredAt
          />
        </div>

        {isAgency && sellerBreakdown.length > 0 && (
          <section className="border border-[var(--surface-border)] rounded-[var(--radius-posta)] overflow-hidden">
            <div className="px-3 py-2 bg-[var(--surface-panel-2)] border-b border-[var(--surface-border)]">
              <h2 className="text-[11px] font-mono font-bold uppercase tracking-wider text-[var(--ink-soft)] flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-[var(--color-accent)]" />
                Por vendedor
              </h2>
            </div>
            <div className="divide-y divide-[var(--surface-border)]/60">
              {sellerBreakdown.map((row) => (
                <div key={row.name} className="flex items-center justify-between px-3 py-2.5 text-sm">
                  <span className="font-medium text-[var(--ink-soft)] truncate">{row.name}</span>
                  <div className="flex items-center gap-3 shrink-0 font-mono text-[11px]">
                    <span className="text-[var(--color-ok)]">{row.delivered} ok</span>
                    <span className={row.undelivered > 0 ? 'text-[var(--color-warn)] font-bold' : 'text-[var(--color-text-muted)]'}>
                      {row.undelivered} pend.
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  tone,
  icon: Icon,
}: {
  label: string;
  value: number;
  sub?: string;
  tone: 'ok' | 'warn' | 'danger' | 'accent' | 'neutral';
  icon: React.ComponentType<{ className?: string }>;
}) {
  const tones = {
    ok: 'border-[var(--color-ok)]/25 bg-[var(--color-ok)]/5 text-[var(--color-ok)]',
    warn: 'border-[var(--color-warn)]/25 bg-[var(--color-warn)]/5 text-[var(--color-warn)]',
    danger: 'border-[var(--color-danger)]/25 bg-[var(--color-danger)]/5 text-[var(--color-danger)]',
    accent: 'border-[var(--color-accent)]/25 bg-[var(--color-accent)]/5 text-[var(--color-accent)]',
    neutral: 'border-[var(--surface-border)] bg-[var(--surface-panel-2)] text-[var(--ink-soft)]',
  };

  return (
    <div className={`rounded border px-2.5 py-2 ${tones[tone]}`}>
      <div className="flex items-center gap-1 mb-1 opacity-80">
        <Icon className="w-3 h-3" />
        <span className="text-[8px] font-mono font-bold uppercase tracking-tight">{label}</span>
      </div>
      <p className="text-xl font-bold font-mono leading-none">
        {value}
        {sub && <span className="text-xs text-[var(--color-text-muted)]">{sub}</span>}
      </p>
    </div>
  );
}

function OrderListSection({
  title,
  count,
  orders,
  emptyMessage,
  tone,
  onSelectOrder,
  showSeller,
  showDeliveredAt = false,
}: {
  title: string;
  count: number;
  orders: Order[];
  emptyMessage: string;
  tone: 'ok' | 'warn' | 'danger';
  onSelectOrder?: (orderId: string) => void;
  showSeller?: boolean;
  showDeliveredAt?: boolean;
}) {
  const borderTone =
    tone === 'ok'
      ? 'border-[var(--color-ok)]/30'
      : tone === 'danger'
        ? 'border-[var(--color-danger)]/30'
        : 'border-[var(--color-warn)]/30';

  return (
    <section className={`border rounded-[var(--radius-posta)] overflow-hidden ${borderTone}`}>
      <div className="px-3 py-2 bg-[var(--surface-panel-2)] border-b border-[var(--surface-border)] flex justify-between items-center">
        <h2 className="text-[11px] font-mono font-bold uppercase tracking-wider text-[var(--ink-soft)]">
          {title}
        </h2>
        <span className="text-[10px] font-mono font-bold text-[var(--color-text-muted)]">{count}</span>
      </div>
      {orders.length === 0 ? (
        <p className="px-3 py-6 text-center text-[11px] text-[var(--color-text-muted)]">{emptyMessage}</p>
      ) : (
        <ul className="divide-y divide-[var(--surface-border)]/50 max-h-72 overflow-y-auto scrollbar-thin">
          {orders.map((order) => (
            <li key={order.id}>
              <button
                type="button"
                onClick={() => onSelectOrder?.(order.id)}
                className="w-full text-left px-3 py-2.5 hover:bg-[var(--surface-panel-2)]/60 transition"
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-[10px] font-mono text-[var(--color-text-faint)]">{order.id}</span>
                  <StatusBadge status={order.status} />
                </div>
                <p className="text-sm font-semibold text-[var(--ink-soft)] truncate">{order.clientName}</p>
                <p className="text-[11px] text-[var(--color-text-muted)] truncate">{order.address}</p>
                {showSeller && order.sellerName && (
                  <p className="text-[10px] text-[var(--color-accent)] mt-0.5">{order.sellerName}</p>
                )}
                {order.repartidorName && (
                  <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5 flex items-center gap-1">
                    <Bike className="w-3 h-3 shrink-0" />
                    {order.repartidorName}
                  </p>
                )}
                {showDeliveredAt && (() => {
                  const deliveredAt = getOrderDeliveredAt(order);
                  return deliveredAt ? (
                    <p className="text-[10px] text-[var(--color-danger)] mt-0.5 font-mono">
                      Entregado {formatArTime(deliveredAt)} hs · corte {DELIVERY_DEADLINE_HOUR}:00
                    </p>
                  ) : null;
                })()}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
