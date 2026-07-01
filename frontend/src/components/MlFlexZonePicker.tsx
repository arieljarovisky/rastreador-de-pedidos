/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo, useState } from 'react';
import {
  type MlFlexCordon,
  type MlFlexZone,
  mlZoneLabels,
  mlZonesForCordon,
} from '../config/mlFlexZones.js';

interface MlFlexZonePickerProps {
  mlZones: MlFlexZone[];
  cordonLabels: Record<MlFlexCordon, string>;
  cordonOrder: MlFlexCordon[];
  selected: string[];
  onChange: (next: string[]) => void;
  /** Si está definido, solo muestra zonas de ese cordón. */
  cordon?: MlFlexCordon | null;
  disabled?: boolean;
  excludeIds?: string[];
  compact?: boolean;
}

export default function MlFlexZonePicker({
  mlZones,
  cordonLabels,
  cordonOrder,
  selected,
  onChange,
  cordon = null,
  disabled = false,
  excludeIds = [],
  compact = false,
}: MlFlexZonePickerProps) {
  const [search, setSearch] = useState('');
  const excludeSet = useMemo(() => new Set(excludeIds), [excludeIds]);

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const cordons = cordon ? [cordon] : cordonOrder;
    return cordons
      .map((c) => ({
        cordon: c,
        label: cordonLabels[c],
        zones: mlZonesForCordon(c, mlZones).filter((z) => {
          if (!q) return true;
          return z.label.toLowerCase().includes(q) || cordonLabels[c].toLowerCase().includes(q);
        }),
      }))
      .filter((g) => g.zones.length > 0);
  }, [cordon, cordonLabels, cordonOrder, mlZones, search]);

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
              onClick={() => onChange(selected.filter((z) => z !== id))}
              className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[var(--color-accent)]/15 text-[var(--color-accent)] border border-[var(--color-accent)]/30 disabled:opacity-50"
            >
              {mlZoneLabels([id], mlZones)} ×
            </button>
          ))}
        </div>
      )}
      <input
        type="search"
        disabled={disabled}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar zona Flex (ej: Vicente López, CABA)..."
        className={inputClass}
      />
      <div
        className={`overflow-y-auto border border-[var(--surface-border)] rounded-lg p-2 space-y-2 scrollbar-thin ${
          compact ? 'max-h-44' : 'max-h-52 sm:max-h-60'
        }`}
      >
        {groups.map((group) => (
          <div key={group.cordon}>
            <p className="text-[9px] font-mono uppercase tracking-wide text-[var(--color-text-muted)] mb-1 px-0.5">
              {group.label}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-0.5">
              {group.zones.map((zone) => {
                const checked = selected.includes(zone.id);
                const blocked = !checked && excludeSet.has(zone.id);
                return (
                  <label
                    key={zone.id}
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
                          checked ? selected.filter((id) => id !== zone.id) : [...selected, zone.id]
                        );
                      }}
                      className="accent-[var(--color-accent)]"
                    />
                    <span className="text-[var(--ink-soft)]">{zone.label}</span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
        {groups.length === 0 && (
          <p className="text-[10px] text-[var(--color-text-muted)] px-2 py-3 text-center">
            No hay zonas que coincidan con la búsqueda.
          </p>
        )}
      </div>
      <p className="text-[9px] text-[var(--color-text-muted)] leading-normal">
        Mismas zonas que Mercado Libre Flex. El mapa usa los límites oficiales de cada partido (Georef / IGN).
      </p>
    </div>
  );
}
