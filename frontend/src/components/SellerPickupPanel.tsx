/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, MapPin, Package, Store } from 'lucide-react';
import { PickupPoint, User } from '../types.js';

interface SellerPickupPanelProps {
  sellers: User[];
  pickupPoints?: PickupPoint[];
  initialSellerId?: string;
  compact?: boolean;
  lockSellerSelection?: boolean;
  collapsible?: boolean;
}

export default function SellerPickupPanel({
  sellers,
  pickupPoints = [],
  initialSellerId = '',
  compact = false,
  lockSellerSelection = false,
  collapsible = false,
}: SellerPickupPanelProps) {
  const [sellerId, setSellerId] = useState(initialSellerId);
  const [expanded, setExpanded] = useState(() => {
    if (!collapsible || typeof window === 'undefined') return true;
    return window.matchMedia('(min-width: 1024px)').matches;
  });

  useEffect(() => {
    if (initialSellerId) setSellerId(initialSellerId);
  }, [initialSellerId]);

  const selectedSeller = useMemo(
    () => sellers.find((s) => s.id === sellerId) ?? null,
    [sellers, sellerId]
  );

  const pickupPoint = useMemo(() => {
    if (!sellerId) return null;
    return pickupPoints.find((p) => p.userId === sellerId) ?? null;
  }, [pickupPoints, sellerId]);

  if (sellers.length === 0) {
    return (
      <div className="bg-[var(--input-bg)]/80 border border-[var(--surface-border)] rounded-lg p-3 text-[10px] text-[var(--color-text-muted)] font-mono">
        Agregá vendedores en Configuración para ver puntos de colecta.
      </div>
    );
  }

  return (
    <div
      className={`border border-[var(--color-accent)]/25 bg-[var(--color-accent)]/5 rounded-lg ${
        compact ? 'p-2.5 space-y-2' : expanded ? 'p-3 space-y-3' : 'p-2.5 space-y-2'
      }`}
    >
      <div className="flex items-start gap-2">
        <div className="w-8 h-8 rounded-[5px] bg-[var(--color-accent)]/15 flex items-center justify-center shrink-0">
          <Package className="w-4 h-4 text-[var(--color-accent)]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-display font-semibold text-[var(--color-text)]">
              Colecta en vendedor
            </p>
            {collapsible && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="shrink-0 p-1 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--surface-panel-2)] lg:hidden"
                aria-expanded={expanded}
                title={expanded ? 'Ocultar' : 'Mostrar'}
              >
                {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            )}
          </div>
          {(expanded || !collapsible) && (
            <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5 leading-relaxed">
              Los envíos Flex se sincronizan automáticamente desde Mercado Libre.
            </p>
          )}
        </div>
      </div>

      <div className={expanded || !collapsible ? 'space-y-2' : ''}>
        {!lockSellerSelection && (
          <div>
            <label className={`mono-label block mb-1 ${!expanded && collapsible ? 'sr-only' : ''}`}>
              Vendedor
            </label>
            <select
              value={sellerId}
              onChange={(e) => setSellerId(e.target.value)}
              className="w-full bg-[var(--paper)] border border-[var(--surface-border)] rounded-[5px] px-3 py-2 text-xs text-[var(--color-text)] focus:outline-none focus:border-[var(--color-accent)]"
            >
              <option value="">Seleccioná un vendedor…</option>
              {sellers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} (@{s.username})
                </option>
              ))}
            </select>
          </div>
        )}

        {expanded && selectedSeller && (
          <div className="rounded-lg border border-[var(--surface-border)] bg-[var(--paper)] px-2.5 py-2 space-y-1.5">
            <p className="text-[11px] font-medium text-[var(--ink-soft)] flex items-center gap-1.5">
              <Store className="w-3.5 h-3.5 text-[var(--route)] shrink-0" />
              {selectedSeller.name}
            </p>
            {pickupPoint ? (
              <p className="text-[10px] text-[var(--color-text-muted)] flex items-start gap-1.5">
                <MapPin className="w-3 h-3 text-[var(--color-ok)] shrink-0 mt-0.5" />
                <span>
                  <span className="font-medium text-[var(--color-ok)]">{pickupPoint.label}</span>
                  <span className="block truncate">{pickupPoint.address}</span>
                </span>
              </p>
            ) : (
              <p className="text-[10px] text-[var(--color-text-faint)]">
                Sin punto de colecta configurado — coordiná la dirección con el vendedor.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
