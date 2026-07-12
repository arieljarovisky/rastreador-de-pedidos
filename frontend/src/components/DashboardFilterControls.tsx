/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bike, ChevronDown, Map } from 'lucide-react';
import { User } from '../types.js';
import { type DeliveryZone, pricingZoneDisplayName } from '../config/deliveryZones.js';

interface FilterVariantProps {
  variant?: 'map' | 'panel';
  className?: string;
}

interface CordonFilterControlProps extends FilterVariantProps {
  zones: DeliveryZone[];
  value: string;
  onChange: (zoneId: string) => void;
}

export function CordonFilterControl({
  zones,
  value,
  onChange,
  variant = 'panel',
  className = '',
}: CordonFilterControlProps) {
  if (zones.length === 0) return null;

  const selectedName = zones.find((z) => z.id === value);
  const label = selectedName ? pricingZoneDisplayName(selectedName) : 'Todos los cordones';

  if (variant === 'map') {
    return (
      <div className={`relative ${className}`}>
        <label className="sr-only" htmlFor="map-cordon-filter">
          Filtrar por cordón
        </label>
        <div className="relative">
          <Map className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-accent)] pointer-events-none" />
          <select
            id="map-cordon-filter"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full appearance-none bg-[var(--surface-panel)]/95 backdrop-blur-md border border-[var(--surface-border)]/80 hover:border-[var(--color-accent)] rounded-[var(--radius-posta)] pl-8 pr-8 py-2 shadow-lg transition text-[11px] font-medium text-[var(--color-text)] truncate"
            title="Filtrar pedidos por cordón"
          >
            <option value="">Todos los cordones</option>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {pricingZoneDisplayName(z)}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)] pointer-events-none" />
        </div>
        {value && (
          <p className="mt-1 px-0.5 text-[9px] text-[var(--color-text-faint)] truncate" title={label}>
            {label}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-1.5 min-w-0 ${className}`}>
      <label
        htmlFor="ops-cordon-filter"
        className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--color-text-muted)] shrink-0 flex items-center gap-1.5 h-[1.125rem]"
      >
        <Map className="w-3.5 h-3.5 text-[var(--color-accent)]" />
        Cordón
      </label>
      <select
        id="ops-cordon-filter"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full min-w-0 min-h-11 sm:min-h-0 sm:h-[2.375rem] bg-[var(--surface-panel-2)] border border-[var(--surface-border)] rounded-[5px] px-3 text-sm sm:text-xs text-[var(--color-text)] focus:outline-none focus:border-[var(--color-accent)]"
      >
        <option value="">Todos los cordones</option>
        {zones.map((z) => (
          <option key={z.id} value={z.id}>
            {pricingZoneDisplayName(z)}
          </option>
        ))}
      </select>
    </div>
  );
}

interface RepartidorFilterControlProps extends FilterVariantProps {
  repartidores: User[];
  value: string;
  onChange: (repartidorId: string) => void;
  includeUnassigned?: boolean;
}

export function RepartidorFilterControl({
  repartidores,
  value,
  onChange,
  includeUnassigned = true,
  variant = 'panel',
  className = '',
}: RepartidorFilterControlProps) {
  if (repartidores.length === 0 && !includeUnassigned) return null;

  const selectedName =
    value === '__unassigned__'
      ? 'Sin asignar'
      : repartidores.find((r) => r.id === value)?.name;
  const label = selectedName ?? 'Todos los repartidores';

  if (variant === 'map') {
    return (
      <div className={`relative ${className}`}>
        <label className="sr-only" htmlFor="map-repartidor-filter">
          Filtrar por repartidor
        </label>
        <div className="relative">
          <Bike className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-accent)] pointer-events-none" />
          <select
            id="map-repartidor-filter"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full appearance-none bg-[var(--surface-panel)]/95 backdrop-blur-md border border-[var(--surface-border)]/80 hover:border-[var(--color-accent)] rounded-[var(--radius-posta)] pl-8 pr-8 py-2 shadow-lg transition text-[11px] font-medium text-[var(--color-text)] truncate"
            title="Filtrar pedidos por repartidor"
          >
            <option value="">Todos los repartidores</option>
            {includeUnassigned && <option value="__unassigned__">Sin asignar</option>}
            {repartidores.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)] pointer-events-none" />
        </div>
        {value && (
          <p className="mt-1 px-0.5 text-[9px] text-[var(--color-text-faint)] truncate" title={label}>
            {label}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-1.5 min-w-0 ${className}`}>
      <label
        htmlFor="ops-repartidor-filter"
        className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--color-text-muted)] shrink-0 flex items-center gap-1.5 h-[1.125rem]"
      >
        <Bike className="w-3.5 h-3.5 text-[var(--color-accent)]" />
        Repartidor
      </label>
      <select
        id="ops-repartidor-filter"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full min-w-0 min-h-11 sm:min-h-0 sm:h-[2.375rem] bg-[var(--surface-panel-2)] border border-[var(--surface-border)] rounded-[5px] px-3 text-sm sm:text-xs text-[var(--color-text)] focus:outline-none focus:border-[var(--color-accent)]"
      >
        <option value="">Todos los repartidores</option>
        {includeUnassigned && <option value="__unassigned__">Sin asignar</option>}
        {repartidores.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
    </div>
  );
}
