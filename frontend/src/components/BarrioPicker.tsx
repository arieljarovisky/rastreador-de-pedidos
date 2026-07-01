/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo, useState } from 'react';
import { barrioNames, type Barrio } from '../config/deliveryZones.js';

interface BarrioPickerProps {
  barrios: Barrio[];
  selected: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  /** Barrios ya usados en otras zonas (no seleccionables). */
  excludeIds?: string[];
  compact?: boolean;
}

export default function BarrioPicker({
  barrios,
  selected,
  onChange,
  disabled = false,
  excludeIds = [],
  compact = false,
}: BarrioPickerProps) {
  const [search, setSearch] = useState('');
  const excludeSet = useMemo(() => new Set(excludeIds), [excludeIds]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return barrios.filter((b) => {
      if (!q) return true;
      return b.name.toLowerCase().includes(q) || b.area.toLowerCase().includes(q);
    });
  }, [barrios, search]);

  const inputClass =
    'w-full bg-[var(--paper)] border border-[var(--surface-border)] rounded-lg py-2 px-3 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-faint)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)]/25 transition disabled:opacity-50';

  return (
    <div className="space-y-2">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selected.map((id) => (
            <button
              key={id}
              type="button"
              disabled={disabled}
              onClick={() => onChange(selected.filter((b) => b !== id))}
              className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[var(--color-accent)]/15 text-[var(--color-accent)] border border-[var(--color-accent)]/30 disabled:opacity-50"
            >
              {barrioNames(barrios, [id])} ×
            </button>
          ))}
        </div>
      )}
      <input
        type="search"
        disabled={disabled}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar barrio o zona (CABA / GBA)..."
        className={inputClass}
      />
      <div
        className={`overflow-y-auto border border-[var(--surface-border)] rounded-lg p-1.5 grid grid-cols-1 sm:grid-cols-2 gap-0.5 scrollbar-thin ${
          compact ? 'max-h-40' : 'max-h-48 sm:max-h-56'
        }`}
      >
        {filtered.map((barrio) => {
          const checked = selected.includes(barrio.id);
          const blocked = !checked && excludeSet.has(barrio.id);
          return (
            <label
              key={barrio.id}
              className={`flex items-center gap-2 px-1.5 py-1 rounded text-[11px] ${
                blocked
                  ? 'opacity-40 cursor-not-allowed'
                  : checked
                    ? 'bg-[var(--color-accent)]/10 cursor-pointer'
                    : 'hover:bg-[var(--paper)] cursor-pointer'
              }`}
            >
              <input
                type="checkbox"
                disabled={disabled || blocked}
                checked={checked}
                onChange={() => {
                  onChange(
                    checked ? selected.filter((id) => id !== barrio.id) : [...selected, barrio.id]
                  );
                }}
                className="accent-[var(--color-accent)]"
              />
              <span className="text-[var(--ink-soft)]">{barrio.name}</span>
              <span className="text-[var(--color-text-muted)] text-[9px] font-mono ml-auto">{barrio.area}</span>
            </label>
          );
        })}
        {filtered.length === 0 && (
          <p className="col-span-full text-[10px] text-[var(--color-text-muted)] px-2 py-3 text-center">
            No hay barrios que coincidan con la búsqueda.
          </p>
        )}
      </div>
      <p className="text-[9px] text-[var(--color-text-muted)] leading-normal">
        Elegí barrios del catálogo oficial. Se usarán en los mapas de cobertura.
      </p>
    </div>
  );
}
