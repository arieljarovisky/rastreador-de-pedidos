/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
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
  deadlineHour?: number;
  layout?: 'icon' | 'navigator' | 'field';
  label?: string;
  className?: string;
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
  todayKey,
  deadlineHour,
  onPick,
  style,
}: {
  value: string;
  maxDateKey: string;
  minDateKey?: string;
  todayKey: string;
  deadlineHour?: number;
  onPick: (dateKey: string) => void;
  style: CSSProperties;
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
          const isToday = dateKey === todayKey;
          const isBeyondMax = dateKey > maxDateKey;
          const isBeforeMin = minDateKey ? dateKey < minDateKey : false;
          const isDisabled = isBeyondMax || isBeforeMin;
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
        <p className="text-[9px] font-mono text-[var(--color-text-muted)]">
          {deadlineHour != null
            ? `Corte operativo ${deadlineHour}:00 ART`
            : 'Corte operativo ART'}
        </p>
        {value !== todayKey && (
          <button
            type="button"
            onClick={() => onPick(todayKey)}
            className="shrink-0 px-2 py-1 rounded-lg border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/10 text-[var(--color-accent)] font-mono font-bold text-[9px] uppercase tracking-wider hover:bg-[var(--color-accent)]/15 transition"
          >
            Ir a hoy
          </button>
        )}
      </div>
    </div>
  );
}

function useCalendarPopoverPosition(anchorRef: RefObject<HTMLElement | null>, open: boolean) {
  const [style, setStyle] = useState<CSSProperties>({ visibility: 'hidden' });

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
  deadlineHour,
  layout = 'icon',
  label = 'Fecha',
  className = '',
  onPreviousDay,
  onNextDay,
  canGoNextDay = false,
  onGoToday,
  isToday = value === getOperationalDateKey(),
}: OperationalDatePickerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const popoverStyle = useCalendarPopoverPosition(anchorRef, open);
  const todayKey = getOperationalDateKey();
  const isFuture = value > todayKey;

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
          todayKey={todayKey}
          deadlineHour={deadlineHour}
          onPick={pickDate}
          style={popoverStyle}
        />
      </div>,
      document.body
    );

  if (layout === 'field') {
    return (
      <div ref={rootRef} className={`flex flex-col gap-1.5 min-w-0 w-full ${className}`.trim()}>
        <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--color-text-muted)] shrink-0 flex items-center gap-1.5 h-[1.125rem]">
          <Calendar className="w-3.5 h-3.5 text-[var(--color-accent)] shrink-0" />
          {label}
        </span>
        <button
          ref={anchorRef}
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-expanded={open}
          className={`w-full min-w-0 h-[2.375rem] bg-[var(--surface-panel-2)] border border-[var(--surface-border)] rounded-[5px] px-3 text-xs flex items-center justify-between gap-2 text-left transition focus:outline-none ${
            open ? 'border-[var(--color-accent)]' : 'hover:border-[var(--color-accent)]/50'
          }`}
        >
          <span className="font-mono text-[var(--color-text)] truncate">
            {formatOperationalDateShort(value)}
          </span>
          <ChevronDown
            className={`w-4 h-4 shrink-0 text-[var(--color-text-muted)] transition-transform duration-200 ${
              open ? 'rotate-180 text-[var(--color-accent)]' : ''
            }`}
          />
        </button>
        {calendarPortal}
      </div>
    );
  }

  if (layout === 'navigator') {
    const dateLabel = formatOperationalDateLabel(value);
    const weekday = formatOperationalWeekday(value);
    const shortDate = formatOperationalDateShort(value);
    const dayNum = parseOperationalDateKey(value).day;

    return (
      <div ref={rootRef} className="relative w-full">
        <div
          className={`flex items-stretch w-full rounded-[var(--radius-posta)] border overflow-hidden ${
            isToday || isFuture
              ? 'border-[var(--color-accent)]/35 bg-[var(--color-accent)]/5'
              : 'border-[var(--surface-border)] bg-[var(--surface-panel-2)]/80'
          }`}
        >
          <button
            type="button"
            onClick={onPreviousDay}
            className="flex items-center justify-center w-12 sm:w-11 min-h-[3.25rem] sm:min-h-0 shrink-0 border-r border-[var(--surface-border)]/80 text-[var(--color-text-muted)] hover:text-[var(--ink-soft)] hover:bg-[var(--surface-panel)]/60 transition"
            aria-label="Día anterior"
          >
            <ChevronLeft className="w-5 h-5 sm:w-4 sm:h-4" />
          </button>

          <div className="flex-1 min-w-0 flex items-center gap-2.5 sm:gap-3 px-2.5 sm:px-3 py-2.5 sm:py-2">
            <div
              className={`w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex flex-col items-center justify-center shrink-0 border ${
                isToday
                  ? 'bg-[var(--color-accent)] text-[#F6F0E4] border-[var(--color-accent)]'
                  : 'bg-[var(--surface-panel)] border-[var(--surface-border)] text-[var(--ink-soft)]'
              }`}
            >
              <span className="text-[8px] font-mono font-bold uppercase leading-none tracking-wide opacity-90">
                {weekday.slice(0, 3)}
              </span>
              <span className="text-lg sm:text-xl font-display font-bold leading-none mt-0.5">
                {dayNum}
              </span>
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm sm:text-base font-display font-bold text-[var(--ink-soft)] truncate">
                  {dateLabel}
                </span>
                {isToday ? (
                  <span className="shrink-0 inline-flex px-1.5 py-0.5 rounded-md bg-[var(--color-accent)]/15 border border-[var(--color-accent)]/25 text-[var(--color-accent)] text-[8px] font-mono font-bold uppercase tracking-wider">
                    En curso
                  </span>
                ) : isFuture ? (
                  <span className="shrink-0 inline-flex px-1.5 py-0.5 rounded-md bg-[var(--color-accent)]/10 border border-[var(--color-accent)]/20 text-[var(--color-accent)] text-[8px] font-mono font-bold uppercase tracking-wider">
                    Programado
                  </span>
                ) : (
                  <span className="shrink-0 inline-flex px-1.5 py-0.5 rounded-md bg-[var(--surface-panel)] border border-[var(--surface-border)] text-[var(--color-text-muted)] text-[8px] font-mono font-bold uppercase tracking-wider">
                    Histórico
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5 truncate">
                {weekday}, {shortDate}
              </p>
            </div>

            <button
              ref={anchorRef}
              type="button"
              onClick={() => setOpen((prev) => !prev)}
              aria-expanded={open}
              aria-label="Abrir calendario"
              className={`shrink-0 flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-lg border transition ${
                open
                  ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/15 text-[var(--color-accent)]'
                  : 'border-[var(--surface-border)] bg-[var(--surface-panel)] text-[var(--color-text-muted)] hover:text-[var(--ink-soft)] hover:border-[var(--color-accent)]/35'
              }`}
            >
              <Calendar className="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={onNextDay}
            disabled={!canGoNextDay}
            className="flex items-center justify-center w-12 sm:w-11 min-h-[3.25rem] sm:min-h-0 shrink-0 border-l border-[var(--surface-border)]/80 text-[var(--color-text-muted)] hover:text-[var(--ink-soft)] hover:bg-[var(--surface-panel)]/60 transition disabled:opacity-25 disabled:pointer-events-none"
            aria-label="Día siguiente"
          >
            <ChevronRight className="w-5 h-5 sm:w-4 sm:h-4" />
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
