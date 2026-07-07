/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  buildOperationalMonthGrid,
  formatOperationalDateLabel,
  formatOperationalDateShort,
  formatOperationalMonthLabel,
  formatOperationalWeekday,
  getOperationalDateKey,
  getOperationalMonthKey,
  parseOperationalDateKey,
  shiftOperationalMonthKey,
} from '../utils/deliverySummary.js';

const WEEKDAY_LABELS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa', 'Do'];

interface OperationalDatePickerProps {
  value: string;
  onChange: (dateKey: string) => void;
  maxDateKey?: string;
  layout?: 'icon' | 'navigator';
  onPreviousDay?: () => void;
  onNextDay?: () => void;
  canGoNextDay?: boolean;
  onGoToday?: () => void;
  isToday?: boolean;
}

function CalendarPopover({
  value,
  maxDateKey,
  onPick,
  className = 'absolute left-0 top-full z-50 mt-2 w-[min(18rem,calc(100vw-2rem))]',
}: {
  value: string;
  maxDateKey: string;
  onPick: (dateKey: string) => void;
  className?: string;
}) {
  const [viewMonthKey, setViewMonthKey] = useState(() => getOperationalMonthKey(value));
  const maxMonthKey = getOperationalMonthKey(maxDateKey);
  const monthCells = useMemo(() => buildOperationalMonthGrid(viewMonthKey), [viewMonthKey]);
  const canGoNextMonth = viewMonthKey < maxMonthKey;

  useEffect(() => {
    setViewMonthKey(getOperationalMonthKey(value));
  }, [value]);

  return (
    <div
      role="dialog"
      aria-label="Calendario operativo"
      className={`rounded-[var(--radius-posta)] border border-[var(--surface-border)] bg-[var(--surface-panel)] shadow-2xl p-3 ${className}`}
    >
      <div className="flex items-center justify-between gap-2 mb-3">
        <button
          type="button"
          onClick={() => setViewMonthKey((m) => shiftOperationalMonthKey(m, -1))}
          className="p-1.5 rounded-lg border border-[var(--surface-border)] bg-[var(--surface-panel-2)] text-[var(--color-text-muted)] hover:text-[var(--ink-soft)] hover:border-[var(--color-accent)]/40 transition"
          aria-label="Mes anterior"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        <p className="text-[11px] font-mono font-bold uppercase tracking-wider text-[var(--ink-soft)] text-center min-w-0 truncate px-1">
          {formatOperationalMonthLabel(viewMonthKey)}
        </p>
        <button
          type="button"
          onClick={() => setViewMonthKey((m) => shiftOperationalMonthKey(m, 1))}
          disabled={!canGoNextMonth}
          className="p-1.5 rounded-lg border border-[var(--surface-border)] bg-[var(--surface-panel-2)] text-[var(--color-text-muted)] hover:text-[var(--ink-soft)] hover:border-[var(--color-accent)]/40 transition disabled:opacity-30 disabled:pointer-events-none"
          aria-label="Mes siguiente"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAY_LABELS.map((label) => (
          <span
            key={label}
            className="text-[9px] font-mono font-bold uppercase text-[var(--color-text-faint)] text-center py-0.5"
          >
            {label}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {monthCells.map((dateKey, index) => {
          if (!dateKey) {
            return <span key={`empty-${index}`} className="aspect-square" aria-hidden />;
          }

          const isSelected = dateKey === value;
          const isToday = dateKey === maxDateKey;
          const isFuture = dateKey > maxDateKey;
          const day = parseOperationalDateKey(dateKey).day;

          return (
            <button
              key={dateKey}
              type="button"
              disabled={isFuture}
              onClick={() => onPick(dateKey)}
              className={[
                'aspect-square rounded-lg text-[11px] font-mono font-bold transition',
                isSelected
                  ? 'bg-[var(--color-accent)] text-white shadow-md'
                  : isToday
                    ? 'border border-[var(--color-accent)]/40 text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10'
                    : 'text-[var(--ink-soft)] hover:bg-[var(--surface-panel-2)] border border-transparent',
                isFuture ? 'opacity-25 pointer-events-none' : '',
              ].join(' ')}
            >
              {day}
            </button>
          );
        })}
      </div>

      <div className="mt-3 pt-2 border-t border-[var(--surface-border)] flex items-center justify-between gap-2">
        <p className="text-[9px] font-mono text-[var(--color-text-muted)]">Corte operativo 21:00 ART</p>
        {value !== maxDateKey && (
          <button
            type="button"
            onClick={() => onPick(maxDateKey)}
            className="shrink-0 px-2 py-1 rounded-lg border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/10 text-[var(--color-accent)] font-mono font-bold text-[9px] uppercase tracking-wider hover:bg-[var(--color-accent)]/15 transition"
          >
            Ir a hoy
          </button>
        )}
      </div>
    </div>
  );
}

export default function OperationalDatePicker({
  value,
  onChange,
  maxDateKey = getOperationalDateKey(),
  layout = 'icon',
  onPreviousDay,
  onNextDay,
  canGoNextDay = false,
  onGoToday,
  isToday = value === maxDateKey,
}: OperationalDatePickerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
      if (layout === 'navigator' && !open) {
        if (event.key === 'ArrowLeft') onPreviousDay?.();
        if (event.key === 'ArrowRight' && canGoNextDay) onNextDay?.();
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, layout, onPreviousDay, onNextDay, canGoNextDay]);

  const pickDate = (dateKey: string) => {
    if (dateKey > maxDateKey) return;
    onChange(dateKey);
    setOpen(false);
  };

  if (layout === 'navigator') {
    const dateLabel = formatOperationalDateLabel(value);
    const weekday = formatOperationalWeekday(value);
    const shortDate = formatOperationalDateShort(value);

    return (
      <div ref={rootRef} className="relative mt-3 max-w-xl">
        <div
          className={`flex items-stretch rounded-[var(--radius-posta)] border overflow-hidden shadow-[0_1px_0_rgba(255,255,255,0.04)_inset] ${
            isToday
              ? 'border-[var(--color-accent)]/35 bg-gradient-to-r from-[var(--color-accent)]/8 via-[var(--surface-panel-2)] to-[var(--surface-panel-2)]'
              : 'border-[var(--surface-border)] bg-[var(--surface-panel-2)]/90'
          }`}
        >
          <button
            type="button"
            onClick={onPreviousDay}
            className="group px-3 sm:px-3.5 py-3 border-r border-[var(--surface-border)]/80 text-[var(--color-text-muted)] hover:text-[var(--ink-soft)] hover:bg-[var(--surface-panel)]/80 transition shrink-0"
            aria-label="Día anterior"
          >
            <ChevronLeft className="w-4 h-4 transition group-active:-translate-x-0.5" />
          </button>

          <button
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            aria-expanded={open}
            aria-label="Abrir calendario"
            className="flex-1 min-w-0 flex items-center gap-3 px-3 sm:px-4 py-2.5 text-left hover:bg-[var(--surface-panel)]/50 transition"
          >
            <div
              className={`w-10 h-10 rounded-xl flex flex-col items-center justify-center shrink-0 border ${
                isToday
                  ? 'bg-[var(--color-accent)]/15 border-[var(--color-accent)]/30 text-[var(--color-accent)]'
                  : 'bg-[var(--surface-panel)] border-[var(--surface-border)] text-[var(--color-text-muted)]'
              }`}
            >
              <span className="text-[8px] font-mono font-bold uppercase leading-none tracking-wider opacity-80">
                {weekday.slice(0, 3)}
              </span>
              <span className="text-base font-display font-bold leading-none mt-0.5">
                {parseOperationalDateKey(value).day}
              </span>
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm sm:text-base font-display font-bold text-[var(--ink-soft)] leading-tight">
                  {dateLabel}
                </span>
                {isToday ? (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-[var(--color-accent)]/15 border border-[var(--color-accent)]/25 text-[var(--color-accent)] text-[8px] font-mono font-bold uppercase tracking-wider">
                    Día en curso
                  </span>
                ) : (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-[var(--surface-panel)] border border-[var(--surface-border)] text-[var(--color-text-muted)] text-[8px] font-mono font-bold uppercase tracking-wider">
                    Histórico
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5 truncate flex items-center gap-1.5">
                <Calendar className="w-3 h-3 shrink-0 opacity-70" />
                <span>{shortDate}</span>
                <span className="text-[var(--color-text-faint)]">·</span>
                <span className="text-[var(--color-text-faint)]">Tocá para elegir fecha</span>
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={onNextDay}
            disabled={!canGoNextDay}
            className="group px-3 sm:px-3.5 py-3 border-l border-[var(--surface-border)]/80 text-[var(--color-text-muted)] hover:text-[var(--ink-soft)] hover:bg-[var(--surface-panel)]/80 transition shrink-0 disabled:opacity-25 disabled:pointer-events-none"
            aria-label="Día siguiente"
          >
            <ChevronRight className="w-4 h-4 transition group-active:translate-x-0.5" />
          </button>
        </div>

        {!isToday && onGoToday && (
          <div className="mt-1.5 flex justify-end">
            <button
              type="button"
              onClick={onGoToday}
              className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--color-accent)] hover:underline underline-offset-2"
            >
              Volver a hoy
            </button>
          </div>
        )}

        {open && (
          <CalendarPopover
            value={value}
            maxDateKey={maxDateKey}
            onPick={pickDate}
            className="absolute left-0 right-0 sm:right-auto sm:w-[18rem] top-full z-50 mt-2"
          />
        )}
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`p-1.5 rounded-lg border transition shrink-0 ${
          open
            ? 'border-[var(--color-accent)]/50 bg-[var(--color-accent)]/10 text-[var(--color-accent)]'
            : 'border-[var(--surface-border)] bg-[var(--surface-panel-2)] text-[var(--color-text-muted)] hover:text-[var(--ink-soft)] hover:border-[var(--color-accent)]/40'
        }`}
        aria-label="Elegir fecha"
        aria-expanded={open}
      >
        <Calendar className="w-4 h-4" />
      </button>

      {open && (
        <CalendarPopover
          value={value}
          maxDateKey={maxDateKey}
          onPick={pickDate}
          className="absolute left-0 top-full z-50 mt-1.5 w-[min(18rem,calc(100vw-2rem))]"
        />
      )}
    </div>
  );
}
