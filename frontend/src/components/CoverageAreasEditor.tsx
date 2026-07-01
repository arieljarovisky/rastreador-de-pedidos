/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Plus, Trash2, MapPin, DollarSign, Package } from 'lucide-react';
import type { AgencyCoverageArea } from '../types.js';
import { barrioNames, type Barrio } from '../config/deliveryZones.js';
import {
  defaultMlZoneIdsForCordon,
  mlZoneIdsToBarrioIds,
  mlZoneLabels,
  type MlFlexCordon,
  type MlFlexZone,
} from '../config/mlFlexZones.js';
import MlFlexZonePicker from './MlFlexZonePicker.js';
import CoveragePreviewMap from './CoveragePreviewMap.js';

export interface CoverageAreaDraft {
  id: string;
  name: string;
  cordon: MlFlexCordon | null;
  mlZoneIds: string[];
  tariff: string;
  minimumOrders: string;
}

function newDraftId(): string {
  return `cov_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function emptyCoverageDraft(): CoverageAreaDraft {
  return {
    id: newDraftId(),
    name: '',
    cordon: null,
    mlZoneIds: [],
    tariff: '',
    minimumOrders: '',
  };
}

export function defaultCoverageDrafts(
  mlZones: MlFlexZone[],
  cordonLabels: Record<MlFlexCordon, string>,
  cordonOrder: MlFlexCordon[]
): CoverageAreaDraft[] {
  return cordonOrder.map((cordon) => ({
    id: newDraftId(),
    name: cordonLabels[cordon],
    cordon,
    mlZoneIds: defaultMlZoneIdsForCordon(cordon, mlZones),
    tariff: '',
    minimumOrders: '',
  }));
}

export function coverageAreasToDrafts(areas: AgencyCoverageArea[]): CoverageAreaDraft[] {
  if (areas.length === 0) return [];
  return areas.map((area) => ({
    id: area.id,
    name: area.name,
    cordon: null,
    mlZoneIds: area.mlZoneIds?.length ? area.mlZoneIds : [],
    tariff: String(area.tariff),
    minimumOrders: area.minimumOrders != null ? String(area.minimumOrders) : '',
  }));
}

export function draftsToCoverageAreas(
  drafts: CoverageAreaDraft[],
  barrioCatalog: Barrio[] = [],
  mlZones: MlFlexZone[] = []
): AgencyCoverageArea[] {
  return drafts.map((draft) => {
    const barrios = mlZoneIdsToBarrioIds(draft.mlZoneIds, mlZones);
    const places =
      barrioCatalog.length > 0 ? barrioNames(barrioCatalog, barrios).split(', ') : barrios;
    const autoName =
      draft.mlZoneIds.length > 0 && mlZones.length > 0
        ? mlZoneLabels(draft.mlZoneIds, mlZones)
        : places.join(', ');
    return {
      id: draft.id,
      name: draft.name.trim() || autoName,
      mlZoneIds: draft.mlZoneIds,
      barrios,
      places,
      tariff: Number(draft.tariff),
      minimumOrders: draft.minimumOrders.trim() ? Number(draft.minimumOrders) : null,
    };
  });
}

export function coverageDraftsAreValid(drafts: CoverageAreaDraft[]): boolean {
  if (drafts.length === 0) return false;
  return drafts.every((draft) => {
    if (draft.mlZoneIds.length === 0) return false;
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

export function draftBarrioIds(draft: CoverageAreaDraft, mlZones: MlFlexZone[]): string[] {
  return mlZoneIdsToBarrioIds(draft.mlZoneIds, mlZones);
}

export function formatCoveragePlaces(area: AgencyCoverageArea, barrioCatalog: Barrio[] = []): string {
  if (area.barrios?.length && barrioCatalog.length > 0) {
    return barrioNames(barrioCatalog, area.barrios);
  }
  return area.places.join(' · ');
}

interface CoverageAreasEditorProps {
  value: CoverageAreaDraft[];
  onChange: (next: CoverageAreaDraft[]) => void;
  barrios: Barrio[];
  mlZones: MlFlexZone[];
  cordonLabels: Record<MlFlexCordon, string>;
  cordonOrder: MlFlexCordon[];
  disabled?: boolean;
  compact?: boolean;
  grid?: boolean;
  hideHeader?: boolean;
}

export default function CoverageAreasEditor({
  value,
  onChange,
  barrios,
  mlZones,
  cordonLabels,
  cordonOrder,
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

  const usedMlZoneIds = (excludeRowId: string) =>
    value.filter((row) => row.id !== excludeRowId).flatMap((row) => row.mlZoneIds);

  const allSelectedMlZoneIds = value.flatMap((row) => row.mlZoneIds);

  const inputClass =
    'w-full bg-[var(--paper)] border border-[var(--surface-border)] rounded-lg py-2 px-3 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-faint)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)]/25 transition disabled:opacity-50';

  const zonesWrapperClass =
    grid && value.length > 1 ? 'grid grid-cols-1 md:grid-cols-2 gap-3' : 'space-y-3';

  return (
    <div className="space-y-3">
      {!hideHeader && (
        <div>
          <p className="text-xs font-semibold text-[var(--color-text)] flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-[var(--color-accent)]" />
            Zonas Flex y tarifas
          </p>
          <p className="text-[10px] text-[var(--color-text-muted)] mt-1 leading-relaxed">
            Mismas zonas que Mercado Libre Flex (CABA y cordones GBA). Definí tarifa y pedido mínimo por grupo.
          </p>
        </div>
      )}

      <CoveragePreviewMap
        barrios={barrios}
        mlZones={mlZones}
        selectedMlZoneIds={allSelectedMlZoneIds}
        cordonLabels={cordonLabels}
        className="mb-1"
      />

      <div className={zonesWrapperClass}>
        {value.map((row, index) => (
          <div
            key={row.id}
            className={`rounded-lg border border-[var(--surface-border)] bg-[var(--surface-panel-2)] ${compact ? 'p-2.5' : 'p-3.5'} space-y-2.5`}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-mono uppercase tracking-wide text-[var(--color-text-muted)]">
                {row.cordon ? cordonLabels[row.cordon] : `Zona ${index + 1}`}
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
              <label className="mono-label block mb-1">Nombre de la tarifa (opcional)</label>
              <input
                type="text"
                disabled={disabled}
                value={row.name}
                onChange={(e) => updateRow(row.id, { name: e.target.value })}
                placeholder={
                  row.mlZoneIds.length > 0
                    ? mlZoneLabels(row.mlZoneIds, mlZones)
                    : row.cordon
                      ? cordonLabels[row.cordon]
                      : 'Ej: CABA, 1.er cordón norte'
                }
                className={inputClass}
              />
            </div>

            <div>
              <label className="mono-label block mb-1">Zonas Flex incluidas</label>
              <MlFlexZonePicker
                mlZones={mlZones}
                cordonLabels={cordonLabels}
                cordonOrder={cordonOrder}
                selected={row.mlZoneIds}
                onChange={(next) => updateRow(row.id, { mlZoneIds: next })}
                cordon={row.cordon}
                disabled={disabled}
                excludeIds={usedMlZoneIds(row.id)}
                compact={compact}
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
        Agregar otra tarifa
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
