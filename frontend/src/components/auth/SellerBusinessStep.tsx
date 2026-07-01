/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo, useState } from 'react';
import { Search, Package, Tags } from 'lucide-react';
import {
  ML_SELLER_CATEGORIES,
  SELLER_MONTHLY_ORDER_OPTIONS,
  type SellerMonthlyOrders,
} from '../../config/sellerRegistration.js';

const inputClass =
  'w-full bg-[var(--paper)] border border-[var(--surface-border)] rounded-lg py-2.5 px-3 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-faint)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)]/25 transition disabled:opacity-50';

interface SellerBusinessStepProps {
  monthlyOrders: SellerMonthlyOrders | '';
  categories: string[];
  onMonthlyOrdersChange: (value: SellerMonthlyOrders) => void;
  onCategoriesChange: (categories: string[]) => void;
  disabled?: boolean;
}

export default function SellerBusinessStep({
  monthlyOrders,
  categories,
  onMonthlyOrdersChange,
  onCategoriesChange,
  disabled = false,
}: SellerBusinessStepProps) {
  const [search, setSearch] = useState('');

  const filteredCategories = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return ML_SELLER_CATEGORIES;
    return ML_SELLER_CATEGORIES.filter((c) => c.toLowerCase().includes(q));
  }, [search]);

  const toggleCategory = (category: string) => {
    if (categories.includes(category)) {
      onCategoriesChange(categories.filter((c) => c !== category));
    } else {
      onCategoriesChange([...categories, category]);
    }
  };

  return (
    <div className="space-y-5">
      <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
        Contanos el volumen de envíos y en qué categorías de Mercado Libre vendés. Así las agencias pueden entender mejor tu operación.
      </p>

      <div>
        <label className="mono-label block mb-2 flex items-center gap-1.5">
          <Package className="w-3.5 h-3.5 text-[var(--color-accent)]" />
          ¿Cuántos pedidos enviás por mes?
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 auto-rows-fr">
          {SELLER_MONTHLY_ORDER_OPTIONS.map((opt) => {
            const selected = monthlyOrders === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                disabled={disabled}
                onClick={() => onMonthlyOrdersChange(opt.value)}
                className={`h-full min-h-[3.25rem] flex items-center text-left rounded-lg border px-3 py-2.5 text-xs transition ${
                  selected
                    ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-text)] ring-1 ring-[var(--color-accent)]/30'
                    : 'border-[var(--surface-border)] bg-[var(--surface-panel-2)] text-[var(--color-text-muted)] hover:border-[var(--color-accent)]/40'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="mono-label block mb-2 flex items-center gap-1.5">
          <Tags className="w-3.5 h-3.5 text-[var(--color-accent)]" />
          Categorías de Mercado Libre
          <span className="text-[var(--color-text-faint)] font-normal normal-case tracking-normal">
            ({categories.length} seleccionada{categories.length === 1 ? '' : 's'})
          </span>
        </label>
        <div className="relative mb-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-faint)]" />
          <input
            type="search"
            disabled={disabled}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar categoría..."
            className={`${inputClass} pl-10`}
          />
        </div>
        <div className="max-h-[min(16rem,40vh)] lg:max-h-64 overflow-y-auto rounded-lg border border-[var(--surface-border)] p-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5 scrollbar-thin">
          {filteredCategories.map((category) => {
            const checked = categories.includes(category);
            return (
              <label
                key={category}
                className={`flex items-start gap-2 rounded-md px-2 py-2 cursor-pointer text-xs leading-snug transition ${
                  checked
                    ? 'bg-[var(--color-accent)]/10 border border-[var(--color-accent)]/30'
                    : 'hover:bg-[var(--surface-panel-2)] border border-transparent'
                }`}
              >
                <input
                  type="checkbox"
                  disabled={disabled}
                  checked={checked}
                  onChange={() => toggleCategory(category)}
                  className="mt-0.5 shrink-0 accent-[var(--color-accent)]"
                />
                <span className={checked ? 'text-[var(--color-text)] font-medium' : 'text-[var(--ink-soft)]'}>
                  {category}
                </span>
              </label>
            );
          })}
          {filteredCategories.length === 0 && (
            <p className="col-span-full text-xs text-[var(--color-text-muted)] py-4 text-center">
              No hay categorías que coincidan con la búsqueda.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function sellerBusinessStepValid(monthlyOrders: string, categories: string[]): boolean {
  return Boolean(monthlyOrders) && categories.length > 0;
}
