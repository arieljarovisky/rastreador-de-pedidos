/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  buildOperationalMonthGrid,
  formatOperationalMonthLabel,
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
}

export default function OperationalDatePicker({
  value,
  onChange,
  maxDateKey = getOperationalDateKey(),
}: OperationalDatePickerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [viewMonthKey, setViewMonthKey] = useState(() => getOperationalMonthKey(value));
  const maxMonthKey = getOperationalMonthKey(maxDateKey);

  useEffect(() => {
    if (open) setViewMonthKey(getOperationalMonthKey(value));
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const monthCells = useMemo(() => buildOperationalMonthGrid(viewMonthKey), [viewMonthKey]);
  const canGoNextMonth = viewMonthKey < maxMonthKey;

  const pickDate = (dateKey: string) => {
    if (dateKey > maxDateKey) return;
    onChange(dateKey);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`p-1.5 rounded border transition shrink-0 ${
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
        <div
          role="dialog"
          aria-label="Calendario operativo"
          className="absolute left-0 top-full z-50 mt-1.5 w-[min(18rem,calc(100vw-2rem))] rounded-[var(--radius-posta)] border border-[var(--surface-border)] bg-[var(--surface-panel)] shadow-2xl p-3"
        >
          <div className="flex items-center justify-between gap-2 mb-3">
            <button
              type="button"
              onClick={() => setViewMonthKey((m) => shiftOperationalMonthKey(m, -1))}
              className="p-1 rounded border border-[var(--surface-border)] bg-[var(--surface-panel-2)] text-[var(--color-text-muted)] hover:text-[var(--ink-soft)] hover:border-[var(--color-accent)]/40 transition"
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
              className="p-1 rounded border border-[var(--surface-border)] bg-[var(--surface-panel-2)] text-[var(--color-text-muted)] hover:text-[var(--ink-soft)] hover:border-[var(--color-accent)]/40 transition disabled:opacity-30 disabled:pointer-events-none"
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
                  onClick={() => pickDate(dateKey)}
                  className={[
                    'aspect-square rounded text-[11px] font-mono font-bold transition',
                    isSelected
                      ? 'bg-[var(--color-accent)] text-white shadow-md'
                      : isToday
                        ? 'border border-[var(--color-accent)]/40 text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10'
                        : 'text-[var(--ink-soft)] hover:bg-[var(--surface-panel-2)] hover:border-[var(--surface-border)] border border-transparent',
                    isFuture ? 'opacity-25 pointer-events-none' : '',
                  ].join(' ')}
                >
                  {day}
                </button>
              );
            })}
          </div>

          <div className="mt-3 pt-2 border-t border-[var(--surface-border)] flex items-center justify-between gap-2">
            <p className="text-[9px] font-mono text-[var(--color-text-muted)]">
              Corte operativo 21:00 ART
            </p>
            {value !== maxDateKey && (
              <button
                type="button"
                onClick={() => pickDate(maxDateKey)}
                className="shrink-0 px-2 py-1 rounded border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/10 text-[var(--color-accent)] font-mono font-bold text-[9px] uppercase tracking-wider hover:bg-[var(--color-accent)]/15 transition"
              >
                Ir a hoy
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
