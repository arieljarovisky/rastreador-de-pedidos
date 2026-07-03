/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { Clock, CheckCircle2, AlertTriangle, Package } from 'lucide-react';
import { Order } from '../types.js';
import {
  computeDeliverySummaryFromOrders,
  formatMinutesUntilDeadline,
  DELIVERY_DEADLINE_HOUR,
  DELIVERY_TIMEZONE_LABEL,
  formatArTime,
} from '../utils/deliverySummary.js';

interface DeliveryControlPanelProps {
  orders: Order[];
}

export default function DeliveryControlPanel({ orders }: DeliveryControlPanelProps) {
  const summary = useMemo(() => computeDeliverySummaryFromOrders(orders), [orders]);

  const progressPct =
    summary.total > 0 ? Math.round((summary.delivered / summary.total) * 100) : 0;

  const urgency =
    summary.isPastDeadline && summary.undelivered > 0
      ? 'overdue'
      : summary.undelivered > 0 && summary.minutesUntilDeadline <= 120
        ? 'warning'
        : 'ok';

  return (
    <div
      className={`rounded border px-2.5 py-2 space-y-2 ${
        urgency === 'overdue'
          ? 'bg-[var(--color-danger)]/8 border-[var(--color-danger)]/30'
          : urgency === 'warning'
            ? 'bg-[var(--color-warn)]/8 border-[var(--color-warn)]/30'
            : 'bg-[var(--surface-panel-2)] border-[var(--surface-border)]/80'
      }`}
      id="delivery-control-panel"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Clock
            className={`w-3.5 h-3.5 shrink-0 ${
              urgency === 'overdue'
                ? 'text-[var(--color-danger)]'
                : urgency === 'warning'
                  ? 'text-[var(--color-warn)]'
                  : 'text-[var(--color-accent)]'
            }`}
          />
          <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-[var(--ink-soft)] truncate">
            Control del día · corte {DELIVERY_DEADLINE_HOUR}:00 {DELIVERY_TIMEZONE_LABEL}
          </span>
        </div>
        <span
          className={`text-[9px] font-mono font-bold shrink-0 ${
            urgency === 'overdue' ? 'text-[var(--color-danger)]' : 'text-[var(--color-text-muted)]'
          }`}
        >
          {summary.isPastDeadline
            ? 'Vencido'
            : formatMinutesUntilDeadline(summary.minutesUntilDeadline)}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-1 text-center">
        <div className="bg-[var(--color-ok)]/5 border border-[var(--color-ok)]/20 rounded px-1 py-1">
          <CheckCircle2 className="w-3 h-3 mx-auto text-[var(--color-ok)] mb-0.5" />
          <p className="text-[8px] text-[var(--color-ok)] font-mono font-bold uppercase">Entregados</p>
          <p className="text-sm font-bold text-[var(--color-ok)] font-mono leading-tight">
            {summary.delivered}
          </p>
        </div>
        <div
          className={`rounded px-1 py-1 border ${
            summary.undelivered > 0
              ? 'bg-[var(--color-warn)]/5 border-[var(--color-warn)]/20'
              : 'bg-[var(--surface-panel)] border-[var(--surface-border)]/60'
          }`}
        >
          <Package
            className={`w-3 h-3 mx-auto mb-0.5 ${
              summary.undelivered > 0 ? 'text-[var(--color-warn)]' : 'text-[var(--color-text-muted)]'
            }`}
          />
          <p
            className={`text-[8px] font-mono font-bold uppercase ${
              summary.undelivered > 0 ? 'text-[var(--color-warn)]' : 'text-[var(--color-text-muted)]'
            }`}
          >
            Sin entregar
          </p>
          <p
            className={`text-sm font-bold font-mono leading-tight ${
              summary.undelivered > 0 ? 'text-[var(--color-warn)]' : 'text-[var(--ink-soft)]'
            }`}
          >
            {summary.undelivered}
          </p>
        </div>
        <div
          className={`rounded px-1 py-1 border ${
            summary.overdue > 0
              ? 'bg-[var(--color-danger)]/5 border-[var(--color-danger)]/20'
              : 'bg-[var(--surface-panel)] border-[var(--surface-border)]/60'
          }`}
        >
          <AlertTriangle
            className={`w-3 h-3 mx-auto mb-0.5 ${
              summary.overdue > 0 ? 'text-[var(--color-danger)]' : 'text-[var(--color-text-muted)]'
            }`}
          />
          <p
            className={`text-[8px] font-mono font-bold uppercase ${
              summary.overdue > 0 ? 'text-[var(--color-danger)]' : 'text-[var(--color-text-muted)]'
            }`}
          >
            Fuera plazo
          </p>
          <p
            className={`text-sm font-bold font-mono leading-tight ${
              summary.overdue > 0 ? 'text-[var(--color-danger)]' : 'text-[var(--ink-soft)]'
            }`}
          >
            {summary.overdue}
          </p>
        </div>
      </div>

      {summary.total > 0 && (
        <div>
          <div className="flex justify-between text-[8px] font-mono text-[var(--color-text-muted)] mb-0.5">
            <span>Progreso del día</span>
            <span>{progressPct}%</span>
          </div>
          <div className="h-1.5 bg-[var(--surface-panel)] rounded-full overflow-hidden border border-[var(--surface-border)]/50">
            <div
              className="h-full bg-[var(--color-ok)] transition-all duration-500 rounded-full"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
