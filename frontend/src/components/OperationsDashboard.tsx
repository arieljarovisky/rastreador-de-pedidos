/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  Clock,
  CheckCircle2,
  AlertTriangle,
  Package,
  Truck,
  Users,
  ChevronRight,
  Bike,
  Layers,
} from 'lucide-react';
import { Order, OrderStatus, User, UserRole, isAgencyAdmin } from '../types.js';
import StatusBadge from './ui/StatusBadge.tsx';
import { getOrderExceptionBadge } from '../utils/orderBadge.js';
import OperationalDatePicker from './OperationalDatePicker.tsx';
import {
  computeDeliverySummaryFromOrders,
  formatMinutesUntilDeadline,
  getUndeliveredTodayOrders,
  getDeliveredTodayOrders,
  getDeliveredLateTodayOrders,
  getOrderDeliveredAt,
  getOperationalDateKey,
  shiftOperationalDateKey,
  formatOperationalDateShort,
  DELIVERY_DEADLINE_HOUR,
  DELIVERY_TIMEZONE_LABEL,
  formatArTime,
} from '../utils/deliverySummary.js';
import SellerFilterControl from './SellerFilterControl.tsx';
import { CordonFilterControl, RepartidorFilterControl } from './DashboardFilterControls.tsx';
import { buildCordonMapZones } from '../config/ambaCordonZones.js';
import { getOrderOperationalDateKey, matchesOrderFilters } from '../utils/orderFilters.js';
import type { Barrio, DeliveryZone } from '../config/deliveryZones.js';

interface OperationsDashboardProps {
  orders: Order[];
  repartidores?: User[];
  sellers?: User[];
  deliveryZones?: DeliveryZone[];
  barrios?: Barrio[];
  userRole?: UserRole;
  deadlineHour?: number;
  onSelectOrder?: (orderId: string) => void;
  onScheduleOrderToday?: (orderId: string) => Promise<void>;
  onGoToOperations?: () => void;
}

export default function OperationsDashboard({
  orders,
  repartidores = [],
  sellers = [],
  deliveryZones = [],
  barrios = [],
  userRole,
  deadlineHour = DELIVERY_DEADLINE_HOUR,
  onSelectOrder,
  onScheduleOrderToday,
  onGoToOperations,
}: OperationsDashboardProps) {
  const todayKey = getOperationalDateKey();
  const tomorrowKey = shiftOperationalDateKey(todayKey, 1);
  const cutHour = deadlineHour;
  const [selectedDateKey, setSelectedDateKey] = useState(todayKey);
  const [sellerFilterId, setSellerFilterId] = useState('');
  const [cordonFilterId, setCordonFilterId] = useState('');
  const [repartidorFilterId, setRepartidorFilterId] = useState('');
  const isToday = selectedDateKey === todayKey;
  const isTomorrow = selectedDateKey === tomorrowKey;
  const isFuture = selectedDateKey > todayKey;

  const cordonZones = useMemo(
    () => buildCordonMapZones(deliveryZones, barrios),
    [deliveryZones, barrios]
  );
  const orderFilterContext = useMemo(
    () => ({
      sellerId: sellerFilterId || undefined,
      cordonId: cordonFilterId || undefined,
      repartidorId: repartidorFilterId || undefined,
      deliveryZones,
      barrios,
    }),
    [sellerFilterId, cordonFilterId, repartidorFilterId, deliveryZones, barrios]
  );

  const scopedOrders = useMemo(
    () => orders.filter((o) => matchesOrderFilters(o, orderFilterContext)),
    [orders, orderFilterContext]
  );

  /** Fechas operativas con al menos un envío (según filtros activos). */
  const datesWithShipments = useMemo(() => {
    const keys = new Set<string>();
    for (const order of scopedOrders) {
      if (order.archived) continue;
      keys.add(getOrderOperationalDateKey(order));
    }
    return [...keys].sort();
  }, [scopedOrders]);

  const latestShipmentDateKey = datesWithShipments.at(-1) ?? todayKey;
  const maxDateKey =
    latestShipmentDateKey > tomorrowKey ? latestShipmentDateKey : tomorrowKey;
  const nextShipmentDateKey =
    datesWithShipments.find((key) => key > selectedDateKey) ?? null;
  const canGoForward = nextShipmentDateKey != null;

  const summary = useMemo(
    () => computeDeliverySummaryFromOrders(scopedOrders, selectedDateKey, cutHour),
    [scopedOrders, selectedDateKey, cutHour]
  );
  const undelivered = useMemo(
    () => getUndeliveredTodayOrders(scopedOrders, selectedDateKey),
    [scopedOrders, selectedDateKey]
  );
  const delivered = useMemo(
    () => getDeliveredTodayOrders(scopedOrders, selectedDateKey),
    [scopedOrders, selectedDateKey]
  );
  const deliveredLate = useMemo(
    () => getDeliveredLateTodayOrders(scopedOrders, selectedDateKey),
    [scopedOrders, selectedDateKey]
  );

  const statusBreakdown = useMemo(() => {
    const undeliveredToday = getUndeliveredTodayOrders(scopedOrders, selectedDateKey);
    return {
      pending: undeliveredToday.filter((o) => o.status === OrderStatus.PENDING).length,
      assigned: undeliveredToday.filter((o) => o.status === OrderStatus.ASSIGNED).length,
      delivering: undeliveredToday.filter((o) => o.status === OrderStatus.DELIVERING).length,
    };
  }, [scopedOrders, selectedDateKey]);

  const sellerBreakdown = useMemo(() => {
    if (!isAgencyAdmin(userRole)) return [];
    const map = new Map<string, { id: string; name: string; undelivered: number; delivered: number }>();
    for (const order of orders) {
      if (!order.sellerId) continue;
      const isUndelivered =
        getUndeliveredTodayOrders([order], selectedDateKey).length > 0;
      const isDelivered = getDeliveredTodayOrders([order], selectedDateKey).length > 0;
      if (!isUndelivered && !isDelivered) continue;
      const entry = map.get(order.sellerId) ?? {
        id: order.sellerId,
        name: order.sellerName ?? 'Sin nombre',
        undelivered: 0,
        delivered: 0,
      };
      if (isUndelivered) entry.undelivered += 1;
      if (isDelivered) entry.delivered += 1;
      map.set(order.sellerId, entry);
    }
    return [...map.values()].sort((a, b) => b.undelivered - a.undelivered);
  }, [orders, userRole, selectedDateKey]);

  const progressPct =
    summary.total > 0 ? Math.round((summary.delivered / summary.total) * 100) : 0;

  const urgency =
    summary.overdue > 0
      ? 'overdue'
      : summary.undelivered > 0 && summary.minutesUntilDeadline <= 120
        ? 'warning'
        : 'ok';

  const isAgency = isAgencyAdmin(userRole);
  const dayScopeLabel = isToday
    ? 'hoy'
    : isTomorrow
      ? 'mañana'
      : formatOperationalDateShort(selectedDateKey);

  return (
    <div
      className="flex flex-col posta-surface"
      id="operations-dashboard"
    >
      <div className="p-3 sm:p-4 border-b border-[var(--surface-border)] space-y-3 sm:space-y-3 lg:shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
              {isAgency ? 'Posta Agencia' : 'Posta Envios'} · Panel del día
            </p>
            <h1 className="text-lg sm:text-xl font-display font-bold text-[var(--ink-soft)] mt-0.5">
              Control de entregas
            </h1>
          </div>
          {onGoToOperations && (
            <button
              type="button"
              onClick={onGoToOperations}
              className="shrink-0 min-h-11 px-3 py-2.5 rounded-[5px] bg-[var(--color-cta)] hover:brightness-110 text-[#F6F0E4] font-mono font-bold text-[10px] uppercase tracking-wider flex items-center gap-1"
            >
              Mapa y pedidos
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <OperationalDatePicker
          layout="navigator"
          value={selectedDateKey}
          maxDateKey={maxDateKey}
          deadlineHour={cutHour}
          isToday={isToday}
          canGoNextDay={canGoForward}
          onChange={setSelectedDateKey}
          onPreviousDay={() =>
            setSelectedDateKey((d) => {
              for (let i = datesWithShipments.length - 1; i >= 0; i -= 1) {
                const key = datesWithShipments[i];
                if (key && key < d) return key;
              }
              return shiftOperationalDateKey(d, -1);
            })
          }
          onNextDay={() => {
            if (nextShipmentDateKey) setSelectedDateKey(nextShipmentDateKey);
          }}
          onGoToday={() => setSelectedDateKey(todayKey)}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-2">
          {isAgency && sellers.length > 0 && (
            <SellerFilterControl
              sellers={sellers}
              value={sellerFilterId}
              onChange={setSellerFilterId}
            />
          )}
          <CordonFilterControl
            zones={cordonZones}
            value={cordonFilterId}
            onChange={setCordonFilterId}
          />
          {isAgency && (
            <RepartidorFilterControl
              repartidores={repartidores}
              value={repartidorFilterId}
              onChange={setRepartidorFilterId}
            />
          )}
        </div>

        <p className="text-[11px] text-[var(--color-text-muted)] flex items-center gap-1.5 flex-wrap">
          <Clock className="w-3.5 h-3.5 shrink-0" />
          <span>
            Corte {cutHour}:00 hs ({DELIVERY_TIMEZONE_LABEL})
            {isToday ? (
              <>
                {' · '}
                {summary.isPastDeadline
                  ? 'vencido'
                  : formatMinutesUntilDeadline(summary.minutesUntilDeadline)}
                {' · ahora '}
                {formatArTime()} hs
              </>
            ) : isFuture ? (
              <> · pedidos programados</>
            ) : (
              <> · día cerrado</>
            )}
          </span>
        </p>

        <div className="space-y-2">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <KpiCard label="Total pedidos" value={summary.total} tone="accent" icon={Layers} />
            <KpiCard label="Entregados" value={summary.delivered} tone="ok" icon={CheckCircle2} />
            <KpiCard label="Sin entregar" value={summary.undelivered} tone={summary.undelivered > 0 ? 'warn' : 'neutral'} icon={Package} />
            <KpiCard label="Fuera plazo" value={summary.overdue} tone={summary.overdue > 0 ? 'danger' : 'neutral'} icon={AlertTriangle} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <KpiCard
              label="Entregados tarde"
              value={summary.deliveredLate}
              tone={summary.deliveredLate > 0 ? 'danger' : 'neutral'}
              icon={AlertTriangle}
            />
            <KpiCard label="En ruta" value={statusBreakdown.delivering} tone="warn" icon={Truck} />
            <KpiCard label="Pendientes" value={statusBreakdown.pending + statusBreakdown.assigned} tone="neutral" icon={Package} />
          </div>
        </div>

        {summary.total > 0 && (
          <div>
            <div className="flex justify-between text-[10px] font-mono text-[var(--color-text-muted)] mb-1">
              <span>Progreso del día ({summary.total} pedidos)</span>
              <span className={urgency === 'overdue' ? 'text-[var(--color-danger)] font-bold' : ''}>
                {progressPct}%
              </span>
            </div>
            <div className="h-2.5 sm:h-2 bg-[var(--surface-panel-2)] rounded-full overflow-hidden border border-[var(--surface-border)]">
              <div
                className="h-full bg-[var(--color-ok)] transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col p-3 sm:p-4 pt-3 pb-6 lg:pb-4">
        <div
          className={`grid gap-3 ${
            isAgency && sellerBreakdown.length > 0
              ? 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4'
              : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'
          }`}
        >
          <OrderListSection
            title={isToday ? 'Sin entregar hoy' : isTomorrow ? 'Sin entregar mañana' : 'Sin entregar'}
            count={undelivered.length}
            orders={undelivered}
            emptyMessage={
              isToday
                ? 'Todos los pedidos del día fueron entregados.'
                : isTomorrow
                  ? 'No hay pedidos programados para mañana.'
                  : `No quedaron pedidos sin entregar el ${dayScopeLabel}.`
            }
            tone="warn"
            onSelectOrder={onSelectOrder}
            onScheduleOrderToday={
              !isToday && onScheduleOrderToday ? onScheduleOrderToday : undefined
            }
            showSeller={isAgency}
          />
          <OrderListSection
            title={isToday ? 'Entregados hoy' : isTomorrow ? 'Entregados mañana' : 'Entregados'}
            count={delivered.length}
            orders={delivered}
            emptyMessage={
              isToday
                ? 'Todavía no hay entregas registradas hoy.'
                : isTomorrow
                  ? 'Todavía no hay entregas registradas para mañana.'
                  : `No hubo entregas registradas el ${dayScopeLabel}.`
            }
            tone="ok"
            onSelectOrder={onSelectOrder}
            showSeller={isAgency}
          />
          <OrderListSection
            title="Entregados fuera de plazo"
            count={deliveredLate.length}
            orders={deliveredLate}
            emptyMessage={
              isToday
                ? `Ningún pedido entregado después del corte de las ${cutHour}:00.`
                : isTomorrow
                  ? 'Ningún pedido de mañana entregado fuera de plazo.'
                  : `Ningún pedido entregado fuera de plazo el ${dayScopeLabel}.`
            }
            tone="danger"
            onSelectOrder={onSelectOrder}
            showSeller={isAgency}
            showDeliveredAt
            deadlineHour={cutHour}
            className="md:col-span-2 xl:col-span-1"
          />

          {isAgency && sellerBreakdown.length > 0 && (
            <SellerBreakdownSection
              rows={sellerBreakdown}
              selectedSellerId={sellerFilterId}
              onSelectSeller={setSellerFilterId}
              className="hidden 2xl:flex"
            />
          )}
        </div>

        {isAgency && sellerBreakdown.length > 0 && (
          <SellerBreakdownSection
            rows={sellerBreakdown}
            selectedSellerId={sellerFilterId}
            onSelectSeller={setSellerFilterId}
            className="mt-3 2xl:hidden"
          />
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
    <div className={`rounded border px-3 py-3 min-w-0 ${tones[tone]}`}>
      <div className="flex items-center gap-1.5 mb-1.5 opacity-80 min-w-0">
        <Icon className="w-3.5 h-3.5 shrink-0" />
        <span className="text-[9px] sm:text-[10px] font-mono font-bold uppercase tracking-tight truncate">{label}</span>
      </div>
      <p className="text-2xl font-bold font-mono leading-none tabular-nums">
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
  onScheduleOrderToday,
  showSeller,
  showDeliveredAt = false,
  deadlineHour = DELIVERY_DEADLINE_HOUR,
  className = '',
}: {
  title: string;
  count: number;
  orders: Order[];
  emptyMessage: string;
  tone: 'ok' | 'warn' | 'danger';
  onSelectOrder?: (orderId: string) => void;
  onScheduleOrderToday?: (orderId: string) => Promise<void>;
  showSeller?: boolean;
  showDeliveredAt?: boolean;
  deadlineHour?: number;
  className?: string;
}) {
  const PAGE_SIZE = 6;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const visibleOrders = orders.slice(0, visibleCount);
  const hasMore = visibleCount < orders.length;

  // Si cambia el listado (fecha/filtro), volver a las primeras 6.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [orders]);

  const borderTone =
    tone === 'ok'
      ? 'border-[var(--color-ok)]/30'
      : tone === 'danger'
        ? 'border-[var(--color-danger)]/30'
        : 'border-[var(--color-warn)]/30';

  return (
    <section
      className={`border rounded-[var(--radius-posta)] overflow-hidden flex flex-col ${borderTone} ${className}`}
    >
      <div className="shrink-0 px-3 py-2.5 sm:py-2 bg-[var(--surface-panel-2)] border-b border-[var(--surface-border)] flex justify-between items-center">
        <h2 className="text-[11px] font-mono font-bold uppercase tracking-wider text-[var(--ink-soft)]">
          {title}
        </h2>
        <span className="text-[10px] font-mono font-bold text-[var(--color-text-muted)]">{count}</span>
      </div>
      {orders.length === 0 ? (
        <p className="flex-1 flex items-center justify-center px-3 py-8 sm:py-6 text-center text-[12px] sm:text-[11px] text-[var(--color-text-muted)]">
          {emptyMessage}
        </p>
      ) : (
        <>
          <ul className="divide-y divide-[var(--surface-border)]/50">
            {visibleOrders.map((order) => (
              <li key={order.id} className="px-3 py-3.5 sm:py-2.5 hover:bg-[var(--surface-panel-2)]/60 transition">
                <button
                  type="button"
                  onClick={() => onSelectOrder?.(order.id)}
                  className="w-full text-left min-h-[4.25rem] sm:min-h-0"
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5 sm:mb-1">
                    <span className="text-[11px] sm:text-[10px] font-mono text-[var(--color-text-faint)]">{order.id}</span>
                    {(() => {
                      const exception = getOrderExceptionBadge(order);
                      return (
                        <StatusBadge
                          status={order.status}
                          label={exception?.label}
                          tone={exception?.tone}
                        />
                      );
                    })()}
                  </div>
                  <p className="text-[15px] sm:text-sm font-semibold text-[var(--ink-soft)] truncate">{order.clientName}</p>
                  <p className="text-[12px] sm:text-[11px] text-[var(--color-text-muted)] truncate mt-0.5">{order.address}</p>
                  {showSeller && order.sellerName && (
                    <p className="text-[11px] sm:text-[10px] text-[var(--color-accent)] mt-1 sm:mt-0.5">{order.sellerName}</p>
                  )}
                  {order.repartidorName && (
                    <p className="text-[11px] sm:text-[10px] text-[var(--color-text-muted)] mt-1 sm:mt-0.5 flex items-center gap-1">
                      <Bike className="w-3.5 h-3.5 sm:w-3 sm:h-3 shrink-0" />
                      {order.repartidorName}
                    </p>
                  )}
                  {showDeliveredAt && (() => {
                    const deliveredAt = getOrderDeliveredAt(order);
                    return deliveredAt ? (
                      <p className="text-[11px] sm:text-[10px] text-[var(--color-danger)] mt-1 sm:mt-0.5 font-mono">
                        Entregado {formatArTime(deliveredAt)} hs · corte {deadlineHour}:00
                      </p>
                    ) : null;
                  })()}
                </button>
                {onScheduleOrderToday && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void onScheduleOrderToday(order.id);
                    }}
                    className="mt-2 w-full sm:w-auto px-2.5 py-1.5 rounded-[5px] border border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10 text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--color-accent)] hover:bg-[var(--color-accent)]/20 transition"
                  >
                    Programar para hoy
                  </button>
                )}
              </li>
            ))}
          </ul>
          {hasMore && (
            <div className="shrink-0 border-t border-[var(--surface-border)]/60 p-2">
              <button
                type="button"
                onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
                className="w-full py-2 rounded-[5px] border border-[var(--surface-border)] bg-[var(--surface-panel-2)]/80 hover:bg-[var(--surface-panel-2)] text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--color-accent)] transition"
              >
                Cargar más ({orders.length - visibleCount} restantes)
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function SellerBreakdownSection({
  rows,
  selectedSellerId = '',
  onSelectSeller,
  className = '',
}: {
  rows: Array<{ id: string; name: string; undelivered: number; delivered: number }>;
  selectedSellerId?: string;
  onSelectSeller?: (sellerId: string) => void;
  className?: string;
}) {
  return (
    <section
      className={`border border-[var(--surface-border)] rounded-[var(--radius-posta)] overflow-hidden flex flex-col ${className}`}
    >
      <div className="shrink-0 px-3 py-2.5 sm:py-2 bg-[var(--surface-panel-2)] border-b border-[var(--surface-border)]">
        <h2 className="text-[11px] font-mono font-bold uppercase tracking-wider text-[var(--ink-soft)] flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5 text-[var(--color-accent)]" />
          Por vendedor
        </h2>
        {onSelectSeller && (
          <p className="text-[10px] sm:text-[9px] text-[var(--color-text-faint)] mt-1">Tocá un vendedor para filtrar</p>
        )}
      </div>
      <div className="xl:flex-1 xl:min-h-0 max-h-[16rem] xl:max-h-none overflow-y-auto divide-y divide-[var(--surface-border)]/60 scrollbar-thin">
        {rows.map((row) => {
          const isActive = selectedSellerId === row.id;
          const inner = (
            <>
              <span className="font-medium text-[var(--ink-soft)] truncate text-[15px] sm:text-sm">{row.name}</span>
              <div className="flex items-center gap-2 shrink-0 font-mono text-[11px] sm:text-[10px]">
                <span className="text-[var(--color-ok)]">{row.delivered} ok</span>
                <span className={row.undelivered > 0 ? 'text-[var(--color-warn)] font-bold' : 'text-[var(--color-text-muted)]'}>
                  {row.undelivered} pend.
                </span>
              </div>
            </>
          );
          if (!onSelectSeller) {
            return (
              <div key={row.id} className="flex items-center justify-between px-3 py-3 sm:py-2 text-sm">
                {inner}
              </div>
            );
          }
          return (
            <button
              key={row.id}
              type="button"
              onClick={() => onSelectSeller(isActive ? '' : row.id)}
              className={`w-full flex items-center justify-between px-3 py-3.5 sm:py-2.5 text-sm text-left transition min-h-12 sm:min-h-0 ${
                isActive
                  ? 'bg-[var(--color-accent)]/10 border-l-2 border-[var(--color-accent)]'
                  : 'hover:bg-[var(--surface-panel-2)]/60 active:bg-[var(--surface-panel-2)]'
              }`}
            >
              {inner}
            </button>
          );
        })}
      </div>
    </section>
  );
}
