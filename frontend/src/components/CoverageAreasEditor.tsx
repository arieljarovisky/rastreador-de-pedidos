/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Plus, Trash2, MapPin, DollarSign, Package } from 'lucide-react';
import type { AgencyCoverageArea } from '../types.js';

export interface CoverageAreaDraft {
  id: string;
  name: string;
  placesText: string;
  tariff: string;
  minimumOrders: string;
}

export function parsePlacesInput(text: string): string[] {
  return text
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function emptyCoverageDraft(): CoverageAreaDraft {
  return {
    id: `cov_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name: '',
    placesText: '',
    tariff: '',
    minimumOrders: '',
  };
}

export function coverageAreasToDrafts(areas: AgencyCoverageArea[]): CoverageAreaDraft[] {
  if (areas.length === 0) return [emptyCoverageDraft()];
  return areas.map((area) => ({
    id: area.id,
    name: area.name,
    placesText: area.places.join(', '),
    tariff: String(area.tariff),
    minimumOrders: area.minimumOrders != null ? String(area.minimumOrders) : '',
  }));
}

export function draftsToCoverageAreas(drafts: CoverageAreaDraft[]): AgencyCoverageArea[] {
  return drafts.map((draft) => ({
    id: draft.id,
    name: draft.name.trim(),
    places: parsePlacesInput(draft.placesText),
    tariff: Number(draft.tariff),
    minimumOrders: draft.minimumOrders.trim() ? Number(draft.minimumOrders) : null,
  }));
}

export function coverageDraftsAreValid(drafts: CoverageAreaDraft[]): boolean {
  if (drafts.length === 0) return false;
  return drafts.every((draft) => {
    if (!draft.name.trim()) return false;
    if (parsePlacesInput(draft.placesText).length === 0) return false;
    if (draft.tariff.trim() === '' || Number.isNaN(Number(draft.tariff)) || Number(draft.tariff) < 0) {
      return false;
    }
    if (draft.minimumOrders.trim()) {
      const min = Number(draft.minimumOrders);
      if (!Number.isFinite(min) || min < 1) return false;
    }
    return true;
  });
}

interface CoverageAreasEditorProps {
  value: CoverageAreaDraft[];
  onChange: (next: CoverageAreaDraft[]) => void;
  disabled?: boolean;
  compact?: boolean;
  /** En pantallas anchas, muestra las zonas en grilla de 2 columnas. */
  grid?: boolean;
  /** Oculta título y descripción (cuando el padre ya los muestra). */
  hideHeader?: boolean;
}

export default function CoverageAreasEditor({
  value,
  onChange,
  disabled = false,
  compact = false,
  grid = false,
  hideHeader = false,
}: CoverageAreasEditorProps) {
  const updateRow = (id: string, patch: Partial<CoverageAreaDraft>) => {
    onChange(value.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const removeRow = (id: string) => {
    if (value.length <= 1) return;
    onChange(value.filter((row) => row.id !== id));
  };

  const inputClass =
    'w-full bg-[var(--paper)] border border-[var(--surface-border)] rounded-lg py-2 px-3 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-faint)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)]/25 transition disabled:opacity-50';

  const zonesWrapperClass = grid && value.length > 1 ? 'grid grid-cols-1 md:grid-cols-2 gap-3' : 'space-y-3';

  return (
    <div className="space-y-3">
      {!hideHeader && (
        <div>
          <p className="text-xs font-semibold text-[var(--color-text)] flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-[var(--color-accent)]" />
            Zonas de cobertura y tarifas
          </p>
          <p className="text-[10px] text-[var(--color-text-muted)] mt-1 leading-relaxed">
            Indicá cada zona, los lugares que abarca, la tarifa por envío y el pedido mínimo (opcional).
          </p>
        </div>
      )}

      <div className={zonesWrapperClass}>
      {value.map((row, index) => (
        <div
          key={row.id}
          className={`rounded-lg border border-[var(--surface-border)] bg-[var(--surface-panel-2)] ${compact ? 'p-2.5' : 'p-3.5'} space-y-2.5 h-fit`}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-mono uppercase tracking-wide text-[var(--color-text-muted)]">
              Zona {index + 1}
            </p>
            {value.length > 1 && (
              <button
                type="button"
                disabled={disabled}
                onClick={() => removeRow(row.id)}
                className="text-[var(--color-danger)] hover:opacity-80 disabled:opacity-40"
                aria-label="Eliminar zona"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div>
            <label className="mono-label block mb-1">Nombre de la zona</label>
            <input
              type="text"
              required
              disabled={disabled}
              value={row.name}
              onChange={(e) => updateRow(row.id, { name: e.target.value })}
              placeholder="Ej: CABA Norte, GBA Sur, Córdoba capital"
              className={inputClass}
            />
          </div>

          <div>
            <label className="mono-label block mb-1">Lugares que abarca</label>
            <textarea
              required
              disabled={disabled}
              value={row.placesText}
              onChange={(e) => updateRow(row.id, { placesText: e.target.value })}
              placeholder="Barrios, ciudades o localidades separados por coma. Ej: Palermo, Belgrano, Vicente López"
              rows={compact ? 2 : 3}
              className={`${inputClass} resize-y min-h-[3rem]`}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mono-label block mb-1 flex items-center gap-1">
                <DollarSign className="w-3 h-3" />
                Tarifa (ARS)
              </label>
              <input
                type="number"
                required
                min={0}
                step="0.01"
                disabled={disabled}
                value={row.tariff}
                onChange={(e) => updateRow(row.id, { tariff: e.target.value })}
                placeholder="3500"
                className={inputClass}
              />
            </div>
            <div>
              <label className="mono-label block mb-1 flex items-center gap-1">
                <Package className="w-3 h-3" />
                Pedido mínimo
              </label>
              <input
                type="number"
                min={1}
                step={1}
                disabled={disabled}
                value={row.minimumOrders}
                onChange={(e) => updateRow(row.id, { minimumOrders: e.target.value })}
                placeholder="Opcional"
                className={inputClass}
              />
            </div>
          </div>
        </div>
      ))}
      </div>

      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange([...value, emptyCoverageDraft()])}
        className="w-full flex items-center justify-center gap-1.5 rounded border border-dashed border-[var(--surface-border)] py-2 text-[10px] font-mono uppercase tracking-wide text-[var(--color-accent)] hover:border-[var(--color-accent)]/50 transition disabled:opacity-50"
      >
        <Plus className="w-3.5 h-3.5" />
        Agregar otra zona
      </button>
    </div>
  );
}

export function formatCoverageTariff(tariff: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(tariff);
}
