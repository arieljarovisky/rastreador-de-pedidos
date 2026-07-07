/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  minDateKey?: string;
  layout?: 'icon' | 'navigator' | 'field';
  label?: string;
  onPreviousDay?: () => void;
  onNextDay?: () => void;
  canGoNextDay?: boolean;
  onGoToday?: () => void;
  isToday?: boolean;
}

function CalendarPopover({
  value,
  maxDateKey,
  minDateKey,
  onPick,
  style,
}: {
  value: string;
  maxDateKey: string;
  minDateKey?: string;
  onPick: (dateKey: string) => void;
  style: React.CSSProperties;
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
      style={style}
      className="w-[18rem] max-w-[calc(100vw-2rem)] rounded-[var(--radius-posta)] border border-[var(--surface-border)] bg-[var(--surface-panel)] shadow-2xl p-3"
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
        <p className="text-[11px] font-display font-semibold text-[var(--ink-soft)] text-center min-w-0 truncate px-1">
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
        {WEEKDAY_LABELS.map((day) => (
          <span
            key={day}
            className="h-7 flex items-center justify-center text-[9px] font-mono font-bold uppercase text-[var(--color-text-faint)]"
          >
            {day}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {monthCells.map((dateKey, index) => {
          if (!dateKey) {
            return <span key={`empty-${index}`} className="h-9" aria-hidden />;
          }

          const isSelected = dateKey === value;
          const isToday = dateKey === maxDateKey;
          const isFuture = dateKey > maxDateKey;
          const isBeforeMin = minDateKey ? dateKey < minDateKey : false;
          const isDisabled = isFuture || isBeforeMin;
          const day = parseOperationalDateKey(dateKey).day;

          return (
            <button
              key={dateKey}
              type="button"
              disabled={isDisabled}
              onClick={() => onPick(dateKey)}
              className={[
                'h-9 w-full rounded-lg text-[12px] font-mono font-bold transition flex items-center justify-center',
                isSelected
                  ? 'bg-[var(--color-accent)] text-white shadow-md'
                  : isToday
                    ? 'border border-[var(--color-accent)]/40 text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10'
                    : 'text-[var(--color-text)] hover:bg-[var(--surface-panel-2)] border border-transparent',
                isDisabled ? 'opacity-25 pointer-events-none' : '',
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

function useCalendarPopoverPosition(anchorRef: React.RefObject<HTMLElement | null>, open: boolean) {
  const [style, setStyle] = useState<React.CSSProperties>({ visibility: 'hidden' });

  useEffect(() => {
    if (!open || !anchorRef.current) return;

    const update = () => {
      const rect = anchorRef.current!.getBoundingClientRect();
      const width = 288;
      const margin = 12;
      let left = rect.left;
      if (left + width > window.innerWidth - margin) {
        left = window.innerWidth - width - margin;
      }
      if (left < margin) left = margin;

      let top = rect.bottom + 8;
      const estimatedHeight = 340;
      if (top + estimatedHeight > window.innerHeight - margin) {
        top = Math.max(margin, rect.top - estimatedHeight - 8);
      }

      setStyle({
        position: 'fixed',
        top,
        left,
        zIndex: 10002,
        visibility: 'visible',
      });
    };

    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, anchorRef]);

  return style;
}

export default function OperationalDatePicker({
  value,
  onChange,
  maxDateKey = getOperationalDateKey(),
  minDateKey,
  layout = 'icon',
  label = 'Fecha',
  onPreviousDay,
  onNextDay,
  canGoNextDay = false,
  onGoToday,
  isToday = value === maxDateKey,
}: OperationalDatePickerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const popoverStyle = useCalendarPopoverPosition(anchorRef, open);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if ((target as Element).closest?.('[data-operational-calendar]')) return;
      setOpen(false);
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
    if (minDateKey && dateKey < minDateKey) return;
    onChange(dateKey);
    setOpen(false);
  };

  const calendarPortal =
    open &&
    createPortal(
      <div data-operational-calendar>
        <CalendarPopover
          value={value}
          maxDateKey={maxDateKey}
          minDateKey={minDateKey}
          onPick={pickDate}
          style={popoverStyle}
        />
      </div>,
      document.body
    );

  if (layout === 'field') {
    return (
      <div ref={rootRef} className="flex flex-col gap-0.5 min-w-[9.5rem] flex-1 sm:flex-none sm:min-w-[10.5rem]">
        <span className="mono-label">{label}</span>
        <button
          ref={anchorRef}
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-expanded={open}
          className={`posta-input px-2.5 py-2 text-xs flex items-center justify-between gap-2 text-left transition ${
            open ? 'border-[var(--color-accent)]' : ''
          }`}
        >
          <span className="font-mono text-[var(--ink-soft)] truncate">
            {formatOperationalDateShort(value)}
          </span>
          <Calendar className={`w-3.5 h-3.5 shrink-0 ${open ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-muted)]'}`} />
        </button>
        {calendarPortal}
      </div>
    );
  }

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
            ref={anchorRef}
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

        {calendarPortal}
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={anchorRef}
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
      {calendarPortal}
    </div>
  );
}
