/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChevronDown, Store } from 'lucide-react';
import { User } from '../types.js';

interface SellerFilterControlProps {
  sellers: User[];
  value: string;
  onChange: (sellerId: string) => void;
  /** Estilo compacto para controles flotantes del mapa */
  variant?: 'map' | 'panel';
  className?: string;
}

export default function SellerFilterControl({
  sellers,
  value,
  onChange,
  variant = 'panel',
  className = '',
}: SellerFilterControlProps) {
  if (sellers.length === 0) return null;

  const selectedName = sellers.find((s) => s.id === value)?.name;
  const label = selectedName ?? 'Todos los vendedores';

  if (variant === 'map') {
    return (
      <div className={`relative ${className}`}>
        <label className="sr-only" htmlFor="map-seller-filter">
          Filtrar por vendedor
        </label>
        <div className="relative">
          <Store className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-accent)] pointer-events-none" />
          <select
            id="map-seller-filter"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full appearance-none bg-[var(--surface-panel)]/95 backdrop-blur-md border border-[var(--surface-border)]/80 hover:border-[var(--color-accent)] rounded-[var(--radius-posta)] pl-8 pr-8 py-2 shadow-lg transition text-[11px] font-medium text-[var(--color-text)] truncate"
            title="Filtrar pedidos por vendedor"
          >
            <option value="">Todos los vendedores</option>
            {sellers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
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
        htmlFor="ops-seller-filter"
        className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--color-text-muted)] shrink-0 flex items-center gap-1.5"
      >
        <Store className="w-3.5 h-3.5 text-[var(--color-accent)]" />
        Vendedor
      </label>
      <select
        id="ops-seller-filter"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full min-w-0 bg-[var(--surface-panel-2)] border border-[var(--surface-border)] rounded-[5px] px-3 py-2 text-xs text-[var(--color-text)] focus:outline-none focus:border-[var(--color-accent)]"
      >
        <option value="">Todos los vendedores</option>
        {sellers.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </div>
  );
}
