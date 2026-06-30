/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import {
  Building2,
  Globe,
  Instagram,
  Truck,
  Zap,
  Clock,
  MapPin,
  ChevronDown,
  ChevronUp,
  Check,
  X,
  ExternalLink,
  Layers,
} from 'lucide-react';
import type { AgencyShippingService, MarketplaceAgency } from '../types.js';

const SERVICE_LABELS: Record<AgencyShippingService['type'], string> = {
  same_day: 'Envío en el día',
  turbo: 'Envío turbo',
  custom: 'Personalizado',
};

const SERVICE_ICONS: Record<AgencyShippingService['type'], typeof Truck> = {
  same_day: Clock,
  turbo: Zap,
  custom: Truck,
};

function ServiceIcon({ type, className }: { type: AgencyShippingService['type']; className?: string }) {
  const Icon = SERVICE_ICONS[type];
  return <Icon className={className} />;
}

export function AgencyDetailContent({ agency }: { agency: MarketplaceAgency }) {
  const locationLabel = [agency.city, agency.province].filter(Boolean).join(', ');
  const hasCoverage = Boolean(
    locationLabel || agency.departurePoint?.address || (agency.coverageZones?.length ?? 0) > 0
  );

  return (
    <div className="space-y-3 pt-2 border-t border-[var(--surface-border)] mt-2">
      {agency.shippingServices.length > 0 && (
        <div>
          <p className="text-[9px] font-mono uppercase tracking-wide text-[var(--color-text-muted)] mb-1.5 flex items-center gap-1">
            <Truck className="w-3 h-3" />
            Servicios de envío
          </p>
          <ul className="space-y-1.5">
            {agency.shippingServices.map((svc, i) => (
              <li
                key={`${svc.type}-${i}`}
                className="flex items-start gap-2 text-[11px] text-[var(--ink-soft)] bg-[var(--surface-panel)] rounded px-2 py-1.5 border border-[var(--surface-border)]"
              >
                <ServiceIcon type={svc.type} className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[var(--color-accent)]" />
                <div className="min-w-0">
                  <p className="font-semibold text-[var(--color-text)]">
                    {svc.type === 'custom' && svc.label ? svc.label : SERVICE_LABELS[svc.type]}
                  </p>
                  {svc.description && (
                    <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5 leading-relaxed">
                      {svc.description}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {hasCoverage && (
        <div>
          <p className="text-[9px] font-mono uppercase tracking-wide text-[var(--color-text-muted)] mb-1.5 flex items-center gap-1">
            <MapPin className="w-3 h-3" />
            Cobertura
          </p>
          <div className="space-y-1.5 text-[11px] text-[var(--ink-soft)]">
            {locationLabel && (
              <p className="flex items-center gap-1.5">
                <MapPin className="w-3 h-3 shrink-0 text-[var(--color-accent)]" />
                <span>
                  <span className="text-[var(--color-text-muted)]">Base: </span>
                  {locationLabel}
                </span>
              </p>
            )}
            {agency.departurePoint?.address && (
              <p className="text-[10px] text-[var(--color-text-muted)] pl-4 leading-relaxed">
                Depósito: {agency.departurePoint.address}
              </p>
            )}
            {agency.coverageZones && agency.coverageZones.length > 0 && (
              <div className="space-y-1">
                {agency.coverageZones.map((zone) => (
                  <div
                    key={zone.id}
                    className="rounded px-2 py-1.5 bg-[var(--surface-panel)] border border-[var(--surface-border)]"
                  >
                    <p className="font-semibold text-[var(--color-text)] flex items-center gap-1">
                      <Layers className="w-3 h-3 text-[var(--color-accent)]" />
                      {zone.name}
                    </p>
                    {zone.barrios && zone.barrios.length > 0 && (
                      <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5 leading-relaxed">
                        {zone.barrios.join(' · ')}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
            {!agency.coverageZones?.length && locationLabel && (
              <p className="text-[10px] text-[var(--color-text-muted)] pl-4">
                Consultá con la agencia el alcance exacto en tu zona.
              </p>
            )}
          </div>
        </div>
      )}

      {(agency.website || agency.instagram) && (
        <div className="flex flex-wrap gap-2">
          {agency.website && (
            <a
              href={agency.website.startsWith('http') ? agency.website : `https://${agency.website}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 text-[10px] text-[var(--color-accent)] hover:underline"
            >
              <Globe className="w-3 h-3" />
              {agency.website.replace(/^https?:\/\//, '')}
              <ExternalLink className="w-2.5 h-2.5 opacity-60" />
            </a>
          )}
          {agency.instagram && (
            <a
              href={`https://instagram.com/${agency.instagram.replace(/^@/, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 text-[10px] text-[var(--color-accent)] hover:underline"
            >
              <Instagram className="w-3 h-3" />@{agency.instagram.replace(/^@/, '')}
              <ExternalLink className="w-2.5 h-2.5 opacity-60" />
            </a>
          )}
        </div>
      )}
    </div>
  );
}

interface AgencyMarketplacePanelProps {
  agencies: MarketplaceAgency[];
  selectedAgencyId?: string | null;
  loading?: boolean;
  onSelectAgency: (agencyId: string | null) => Promise<void>;
  compact?: boolean;
}

export default function AgencyMarketplacePanel({
  agencies,
  selectedAgencyId,
  loading = false,
  onSelectAgency,
  compact = false,
}: AgencyMarketplacePanelProps) {
  const [saving, setSaving] = useState<string | 'clear' | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleSelect = async (agencyId: string | null) => {
    setSaving(agencyId ?? 'clear');
    try {
      await onSelectAgency(agencyId);
    } finally {
      setSaving(null);
    }
  };

  const toggleExpand = (agencyId: string) => {
    setExpandedId((prev) => (prev === agencyId ? null : agencyId));
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

  const selectedAgency = selectedAgencyId
    ? agencies.find((a) => a.id === selectedAgencyId)
    : undefined;

  return (
    <div className="space-y-2">
      {selectedAgencyId && (
        <button
          type="button"
          disabled={!!saving}
          onClick={() => void handleSelect(null)}
          className="w-full flex items-center justify-center gap-1.5 rounded border border-dashed border-[var(--surface-border)] px-3 py-2 text-[10px] font-mono uppercase tracking-wide text-[var(--color-text-muted)] hover:border-[var(--color-danger)]/50 hover:text-[var(--color-danger)] transition disabled:opacity-50"
        >
          <X className="w-3 h-3" />
          {saving === 'clear' ? 'Quitando…' : 'Quitar agencia seleccionada'}
        </button>
      )}

      <div className={`space-y-2 ${compact ? '' : 'max-h-[28rem] overflow-y-auto pr-1 scrollbar-thin'}`}>
        {agencies.map((agency) => {
          const selected = agency.id === selectedAgencyId;
          const expanded = expandedId === agency.id;
          return (
            <div
              key={agency.id}
              className={`rounded border transition ${
                selected
                  ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/10'
                  : 'border-[var(--surface-border)] bg-[var(--surface-panel-2)]'
              }`}
            >
              <div className="flex items-start gap-2 p-3">
                <Building2 className="w-4 h-4 shrink-0 mt-0.5 text-[var(--color-accent)]" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-[var(--color-text)]">{agency.name}</p>
                      {(agency.city || agency.province) && (
                        <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5 flex items-center gap-1">
                          <MapPin className="w-2.5 h-2.5 shrink-0" />
                          {[agency.city, agency.province].filter(Boolean).join(', ')}
                        </p>
                      )}
                    </div>
                    {selected && (
                      <span className="inline-flex items-center gap-0.5 text-[9px] font-mono uppercase text-[var(--color-accent)] shrink-0">
                        <Check className="w-3 h-3" />
                        {saving === agency.id ? '…' : 'Elegida'}
                      </span>
                    )}
                  </div>

                  {agency.shippingServices.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {agency.shippingServices.map((svc, i) => (
                        <span
                          key={`${svc.type}-${i}`}
                          className="inline-flex items-center gap-0.5 text-[9px] font-mono uppercase tracking-wide px-1.5 py-0.5 rounded bg-[var(--surface-panel)] border border-[var(--surface-border)] text-[var(--color-text-muted)]"
                        >
                          <ServiceIcon type={svc.type} className="w-2.5 h-2.5" />
                          {svc.type === 'custom' && svc.label ? svc.label : SERVICE_LABELS[svc.type]}
                        </span>
                      ))}
                    </div>
                  )}

                  {!compact && expanded && <AgencyDetailContent agency={agency} />}
                </div>
              </div>

              <div className="flex border-t border-[var(--surface-border)] divide-x divide-[var(--surface-border)]">
                {!compact && (
                  <button
                    type="button"
                    onClick={() => toggleExpand(agency.id)}
                    className="flex-1 flex items-center justify-center gap-1 py-2 text-[9px] font-mono uppercase tracking-wide text-[var(--color-text-muted)] hover:text-[var(--ink-soft)] hover:bg-[var(--surface-panel)] transition"
                  >
                    {expanded ? (
                      <>
                        <ChevronUp className="w-3 h-3" /> Ocultar detalle
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-3 h-3" /> Ver servicios y cobertura
                      </>
                    )}
                  </button>
                )}
                <button
                  type="button"
                  disabled={!!saving}
                  onClick={() => void handleSelect(selected ? null : agency.id)}
                  className={`flex-1 flex items-center justify-center gap-1 py-2 text-[9px] font-mono uppercase tracking-wide transition disabled:opacity-50 ${
                    selected
                      ? 'text-[var(--color-danger)] hover:bg-[var(--color-danger)]/5'
                      : 'text-[var(--color-accent)] hover:bg-[var(--color-accent)]/5'
                  }`}
                >
                  {selected ? (
                    <>
                      <X className="w-3 h-3" /> Deseleccionar
                    </>
                  ) : saving === agency.id ? (
                    'Guardando…'
                  ) : (
                    <>
                      <Check className="w-3 h-3" /> Elegir agencia
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {selectedAgency && !compact && (
        <div className="rounded border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/5 p-3">
          <p className="text-[10px] font-mono uppercase tracking-wide text-[var(--color-accent)] mb-2">
            Resumen — {selectedAgency.name}
          </p>
          <AgencyDetailContent agency={selectedAgency} />
        </div>
      )}
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
