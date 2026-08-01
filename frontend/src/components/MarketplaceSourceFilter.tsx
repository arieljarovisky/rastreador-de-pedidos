/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Store } from 'lucide-react';

export const MARKETPLACE_SOURCE_OPTIONS = [
  { value: '', label: 'Todas las tiendas' },
  { value: 'mercadolibre', label: 'Mercado Libre' },
  { value: 'tiendanube', label: 'Tienda Nube' },
  { value: 'shopify', label: 'Shopify' },
  { value: 'woocommerce', label: 'WooCommerce' },
  { value: 'manual', label: 'Manual (sin tienda)' },
] as const;

interface MarketplaceSourceFilterProps {
  value: string;
  onChange: (source: string) => void;
  className?: string;
}

export default function MarketplaceSourceFilter({
  value,
  onChange,
  className = '',
}: MarketplaceSourceFilterProps) {
  return (
    <div className={`flex flex-col gap-1.5 min-w-0 ${className}`}>
      <label
        htmlFor="marketplace-source-filter"
        className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--color-text-muted)] shrink-0 flex items-center gap-1.5"
      >
        <Store className="w-3.5 h-3.5 text-[var(--color-accent)]" />
        Tienda online
      </label>
      <select
        id="marketplace-source-filter"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full min-w-0 min-h-11 sm:min-h-0 sm:h-[2.375rem] bg-[var(--surface-panel-2)] border border-[var(--surface-border)] rounded-[5px] px-3 text-sm sm:text-xs text-[var(--color-text)] focus:outline-none focus:border-[var(--color-accent)]"
      >
        {MARKETPLACE_SOURCE_OPTIONS.map((opt) => (
          <option key={opt.value || 'all'} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
