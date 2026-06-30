/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { Building2, Globe, Instagram, Truck, Zap, Clock } from 'lucide-react';
import type { AgencyShippingService, MarketplaceAgency } from '../types.js';

const SERVICE_LABELS: Record<AgencyShippingService['type'], string> = {
  same_day: 'Envío en el día',
  turbo: 'Envío turbo',
  custom: 'Personalizado',
};

interface AgencyMarketplacePanelProps {
  agencies: MarketplaceAgency[];
  selectedAgencyId?: string | null;
  loading?: boolean;
  onSelectAgency: (agencyId: string) => Promise<void>;
  compact?: boolean;
}

export default function AgencyMarketplacePanel({
  agencies,
  selectedAgencyId,
  loading = false,
  onSelectAgency,
  compact = false,
}: AgencyMarketplacePanelProps) {
  const [saving, setSaving] = useState<string | null>(null);

  const handleSelect = async (agencyId: string) => {
    if (agencyId === selectedAgencyId) return;
    setSaving(agencyId);
    try {
      await onSelectAgency(agencyId);
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return <p className="text-xs text-[var(--color-text-muted)]">Cargando agencias...</p>;
  }

  if (agencies.length === 0) {
    return (
      <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
        Todavía no hay agencias registradas en el marketplace. Volvé a intentar más tarde.
      </p>
    );
  }

  return (
    <div className={`space-y-2 ${compact ? '' : 'max-h-72 overflow-y-auto pr-1 scrollbar-thin'}`}>
      {agencies.map((agency) => {
        const selected = agency.id === selectedAgencyId;
        return (
          <button
            key={agency.id}
            type="button"
            disabled={!!saving}
            onClick={() => void handleSelect(agency.id)}
            className={`w-full text-left rounded border p-3 transition ${
              selected
                ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/10'
                : 'border-[var(--surface-border)] bg-[var(--surface-panel-2)] hover:border-[var(--color-accent)]/50'
            }`}
          >
            <div className="flex items-start gap-2">
              <Building2 className="w-4 h-4 shrink-0 mt-0.5 text-[var(--color-accent)]" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-[var(--color-text)]">{agency.name}</p>
                {(agency.city || agency.province) && (
                  <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                    {[agency.city, agency.province].filter(Boolean).join(', ')}
                  </p>
                )}
                {agency.shippingServices.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {agency.shippingServices.map((svc, i) => (
                      <span
                        key={`${svc.type}-${i}`}
                        className="inline-flex items-center gap-0.5 text-[9px] font-mono uppercase tracking-wide px-1.5 py-0.5 rounded bg-[var(--surface-panel)] border border-[var(--surface-border)] text-[var(--color-text-muted)]"
                      >
                        {svc.type === 'turbo' && <Zap className="w-2.5 h-2.5" />}
                        {svc.type === 'same_day' && <Clock className="w-2.5 h-2.5" />}
                        {svc.type === 'custom' && <Truck className="w-2.5 h-2.5" />}
                        {svc.type === 'custom' && svc.label ? svc.label : SERVICE_LABELS[svc.type]}
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap gap-2 mt-1.5">
                  {agency.website && (
                    <span className="inline-flex items-center gap-0.5 text-[9px] text-[var(--color-text-muted)]">
                      <Globe className="w-2.5 h-2.5" />
                      {agency.website.replace(/^https?:\/\//, '')}
                    </span>
                  )}
                  {agency.instagram && (
                    <span className="inline-flex items-center gap-0.5 text-[9px] text-[var(--color-text-muted)]">
                      <Instagram className="w-2.5 h-2.5" />@{agency.instagram}
                    </span>
                  )}
                </div>
              </div>
              {selected && (
                <span className="text-[9px] font-mono uppercase text-[var(--color-accent)] shrink-0">
                  {saving === agency.id ? '...' : 'Elegida'}
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function AgencySelectDropdown({
  agencies,
  value,
  onChange,
  required = false,
}: {
  agencies: MarketplaceAgency[];
  value: string;
  onChange: (agencyId: string) => void;
  required?: boolean;
}) {
  return (
    <select
      required={required}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-[var(--surface-panel-2)] border border-[var(--surface-border)] rounded px-2.5 py-1.5 text-xs text-[var(--ink-soft)] focus:outline-none focus:border-[var(--color-accent)]"
    >
      <option value="">Elegí una agencia de logística</option>
      {agencies.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
          {a.province ? ` (${a.province})` : ''}
        </option>
      ))}
    </select>
  );
}
