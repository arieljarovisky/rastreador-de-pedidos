import { Building2, MapPin, Globe, Instagram, Truck, ArrowLeft, Map, DollarSign, Package, Shield, Phone, Mail, Check, X } from 'lucide-react';
import { useState } from 'react';
import type { MarketplaceAgency, AgencyShippingService, AgencyCoverageArea } from '../types.js';

interface AgencyProfilePageProps {
  agency: MarketplaceAgency;
  token: string;
  onBack: () => void;
  preferredAgencyId?: string | null;
  onSelectAgency?: (agencyId: string | null) => Promise<void>;
}

function serviceLabel(service: AgencyShippingService): string {
  switch (service.type) {
    case 'same_day': return 'Envío en el día';
    case 'turbo': return 'Envío Turbo (2-4hs)';
    case 'custom': return service.label || 'Servicio personalizado';
  }
}

function serviceDescription(service: AgencyShippingService): string {
  if (service.description) return service.description;
  switch (service.type) {
    case 'same_day': return 'Retiro y entrega dentro del mismo día hábil';
    case 'turbo': return 'Entrega express en 2 a 4 horas desde el retiro';
    case 'custom': return 'Servicio adaptado a necesidades específicas';
  }
}

function serviceColor(type: AgencyShippingService['type']): string {
  switch (type) {
    case 'same_day': return 'var(--color-ok)';
    case 'turbo': return '#f59e0b';
    case 'custom': return '#6366f1';
  }
}

function CoverageAreaCard({ area }: { area: AgencyCoverageArea; key?: string }) {
  return (
    <div className="bg-[var(--surface-panel-2)] border border-[var(--surface-border)] rounded-lg p-3">
      <div className="flex items-start justify-between gap-2 mb-2">
        <h4 className="text-xs font-bold text-[var(--color-text)]">{area.name}</h4>
        <span className="text-xs font-mono font-bold text-[var(--color-ok)] shrink-0">
          ${area.tariff.toLocaleString('es-AR')}
        </span>
      </div>
      {area.places.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {area.places.slice(0, 8).map((place, i) => (
            <span
              key={i}
              className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--surface-panel)] border border-[var(--surface-border)] text-[var(--color-text-muted)]"
            >
              {place}
            </span>
          ))}
          {area.places.length > 8 && (
            <span className="text-[9px] px-1.5 py-0.5 text-[var(--color-text-muted)]">
              +{area.places.length - 8} más
            </span>
          )}
        </div>
      )}
      {area.minimumOrders && (
        <div className="flex items-center gap-1 text-[9px] text-[var(--color-text-muted)]">
          <Package className="w-3 h-3" />
          <span>Mínimo: {area.minimumOrders} pedidos</span>
        </div>
      )}
    </div>
  );
}

export default function AgencyProfilePage({ agency, onBack, preferredAgencyId, onSelectAgency }: AgencyProfilePageProps) {
  const [saving, setSaving] = useState(false);
  const isContracted = agency.id === preferredAgencyId;

  const handleSelect = async () => {
    if (!onSelectAgency) return;
    setSaving(true);
    try {
      await onSelectAgency(isContracted ? null : agency.id);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b border-[var(--surface-border)] bg-[var(--surface-panel)]/50">
        <div className="flex items-center gap-2 px-3 py-2">
          <button
            onClick={onBack}
            className="p-1.5 rounded-[var(--radius-posta)] hover:bg-[var(--surface-panel-2)] transition text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            title="Volver a agencias"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <Building2 className="w-4 h-4 text-[var(--color-accent)]" />
          <h2 className="text-sm font-bold text-[var(--color-text)] truncate flex-1">{agency.name}</h2>
          {onSelectAgency && (
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSelect()}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wide transition disabled:opacity-50 ${
                isContracted
                  ? 'border border-[var(--color-danger)]/40 text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10'
                  : 'bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent)]/90'
              }`}
            >
              {saving ? (
                'Guardando…'
              ) : isContracted ? (
                <>
                  <X className="w-3 h-3" /> Quitar
                </>
              ) : (
                <>
                  <Check className="w-3 h-3" /> Contratar
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Hero section */}
        <div className="relative bg-gradient-to-br from-[var(--color-accent)]/10 via-[var(--surface-panel)] to-[var(--surface-panel-2)] px-4 sm:px-6 py-6 sm:py-8 border-b border-[var(--surface-border)]">
          <div className="flex flex-col sm:flex-row items-start gap-4">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl overflow-hidden border-2 border-[var(--color-accent)]/30 flex items-center justify-center shrink-0">
              {agency.logoUrl ? (
                <img src={agency.logoUrl} alt={`Logo de ${agency.name}`} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-[var(--color-accent)]/10 flex items-center justify-center">
                  <Building2 className="w-8 h-8 sm:w-10 sm:h-10 text-[var(--color-accent)]" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-[var(--color-text)] mb-1">{agency.name}</h1>
              {isContracted && (
                <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wide px-2 py-0.5 rounded bg-[var(--color-accent)]/15 text-[var(--color-accent)] mb-2">
                  <Check className="w-3 h-3" />
                  Tu agencia contratada
                </span>
              )}
              {(agency.city || agency.province) && (
                <div className="flex items-center gap-1.5 text-sm text-[var(--color-text-muted)] mb-3">
                  <MapPin className="w-4 h-4" />
                  <span>{[agency.city, agency.province].filter(Boolean).join(', ')}</span>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-3">
                {agency.website && (
                  <a
                    href={agency.website.startsWith('http') ? agency.website : `https://${agency.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-[var(--color-accent)] hover:underline"
                  >
                    <Globe className="w-3.5 h-3.5" />
                    {agency.website.replace(/^https?:\/\//, '')}
                  </a>
                )}
                {agency.instagram && (
                  <a
                    href={`https://instagram.com/${agency.instagram.replace('@', '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-[var(--color-accent)] hover:underline"
                  >
                    <Instagram className="w-3.5 h-3.5" />
                    {agency.instagram}
                  </a>
                )}
                {agency.contactPhone && (
                  <a
                    href={`tel:${agency.contactPhone.replace(/\s/g, '')}`}
                    className="inline-flex items-center gap-1.5 text-xs text-[var(--color-accent)] hover:underline"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    {agency.contactPhone}
                  </a>
                )}
                {agency.contactEmail && (
                  <a
                    href={`mailto:${agency.contactEmail}`}
                    className="inline-flex items-center gap-1.5 text-xs text-[var(--color-accent)] hover:underline"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    {agency.contactEmail}
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="px-4 sm:px-6 py-5 space-y-6">
          {/* Acerca de */}
          {agency.description && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Shield className="w-4 h-4 text-[var(--color-accent)]" />
                <h3 className="text-sm font-bold text-[var(--color-text)] uppercase tracking-wide">Acerca de</h3>
              </div>
              <div className="bg-[var(--surface-panel)] border border-[var(--surface-border)] rounded-lg p-4">
                <p className="text-xs text-[var(--color-text-muted)] leading-relaxed whitespace-pre-line">
                  {agency.description}
                </p>
              </div>
            </section>
          )}

          {/* Servicios de envío */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Truck className="w-4 h-4 text-[var(--color-accent)]" />
              <h3 className="text-sm font-bold text-[var(--color-text)] uppercase tracking-wide">Servicios de envío</h3>
            </div>
            {agency.shippingServices.length === 0 ? (
              <p className="text-xs text-[var(--color-text-muted)] italic">Esta agencia aún no publicó servicios.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {agency.shippingServices.map((service, i) => (
                  <div
                    key={i}
                    className="bg-[var(--surface-panel)] border border-[var(--surface-border)] rounded-lg p-4 hover:border-[var(--color-accent)]/30 transition"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center"
                        style={{ backgroundColor: `${serviceColor(service.type)}20` }}
                      >
                        <Truck className="w-4 h-4" style={{ color: serviceColor(service.type) }} />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-[var(--color-text)]">{serviceLabel(service)}</h4>
                      </div>
                    </div>
                    <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed">
                      {serviceDescription(service)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Zonas de cobertura */}
          {agency.coverageAreas && agency.coverageAreas.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Map className="w-4 h-4 text-[var(--color-accent)]" />
                <h3 className="text-sm font-bold text-[var(--color-text)] uppercase tracking-wide">Zonas de cobertura y tarifas</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {agency.coverageAreas.map((area) => (
                  <CoverageAreaCard key={area.id} area={area} />
                ))}
              </div>
            </section>
          )}

          {/* Información adicional */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Shield className="w-4 h-4 text-[var(--color-accent)]" />
              <h3 className="text-sm font-bold text-[var(--color-text)] uppercase tracking-wide">Información</h3>
            </div>
            <div className="bg-[var(--surface-panel)] border border-[var(--surface-border)] rounded-lg p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {agency.departurePoint && (
                  <div className="flex items-start gap-2">
                    <MapPin className="w-3.5 h-3.5 text-[var(--color-text-muted)] mt-0.5 shrink-0" />
                    <div>
                      <span className="text-[9px] uppercase tracking-wider text-[var(--color-text-muted)] font-mono block">Base operativa</span>
                      <span className="text-xs text-[var(--color-text)]">{agency.departurePoint.address}</span>
                    </div>
                  </div>
                )}
                {agency.coverageZones && agency.coverageZones.length > 0 && (
                  <div className="flex items-start gap-2">
                    <Map className="w-3.5 h-3.5 text-[var(--color-text-muted)] mt-0.5 shrink-0" />
                    <div>
                      <span className="text-[9px] uppercase tracking-wider text-[var(--color-text-muted)] font-mono block">Zonas operativas</span>
                      <span className="text-xs text-[var(--color-text)]">
                        {agency.coverageZones.map((z) => z.name).join(', ')}
                      </span>
                    </div>
                  </div>
                )}
                <div className="flex items-start gap-2">
                  <DollarSign className="w-3.5 h-3.5 text-[var(--color-text-muted)] mt-0.5 shrink-0" />
                  <div>
                    <span className="text-[9px] uppercase tracking-wider text-[var(--color-text-muted)] font-mono block">Tarifas desde</span>
                    <span className="text-xs text-[var(--color-text)] font-bold">
                      {agency.coverageAreas && agency.coverageAreas.length > 0
                        ? `$${Math.min(...agency.coverageAreas.map((a) => a.tariff)).toLocaleString('es-AR')}`
                        : 'Consultar'}
                    </span>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Truck className="w-3.5 h-3.5 text-[var(--color-text-muted)] mt-0.5 shrink-0" />
                  <div>
                    <span className="text-[9px] uppercase tracking-wider text-[var(--color-text-muted)] font-mono block">Servicios</span>
                    <span className="text-xs text-[var(--color-text)]">
                      {agency.shippingServices.length > 0
                        ? agency.shippingServices.map((s) => serviceLabel(s)).join(', ')
                        : 'Consultar'}
                    </span>
                  </div>
                </div>
                {agency.contactPhone && (
                  <div className="flex items-start gap-2">
                    <Phone className="w-3.5 h-3.5 text-[var(--color-text-muted)] mt-0.5 shrink-0" />
                    <div>
                      <span className="text-[9px] uppercase tracking-wider text-[var(--color-text-muted)] font-mono block">Teléfono</span>
                      <a href={`tel:${agency.contactPhone.replace(/\s/g, '')}`} className="text-xs text-[var(--color-accent)] hover:underline">
                        {agency.contactPhone}
                      </a>
                    </div>
                  </div>
                )}
                {agency.contactEmail && (
                  <div className="flex items-start gap-2">
                    <Mail className="w-3.5 h-3.5 text-[var(--color-text-muted)] mt-0.5 shrink-0" />
                    <div>
                      <span className="text-[9px] uppercase tracking-wider text-[var(--color-text-muted)] font-mono block">Email</span>
                      <a href={`mailto:${agency.contactEmail}`} className="text-xs text-[var(--color-accent)] hover:underline">
                        {agency.contactEmail}
                      </a>
                    </div>
                  </div>
                )}
                {agency.cutoffTime && (
                  <div className="flex items-start gap-2">
                    <Shield className="w-3.5 h-3.5 text-[var(--color-text-muted)] mt-0.5 shrink-0" />
                    <div>
                      <span className="text-[9px] uppercase tracking-wider text-[var(--color-text-muted)] font-mono block">Horario de corte</span>
                      <span className="text-xs text-[var(--color-text)]">{agency.cutoffTime} hs</span>
                    </div>
                  </div>
                )}
                {agency.repartidoresCount != null && agency.repartidoresCount > 0 && (
                  <div className="flex items-start gap-2">
                    <Truck className="w-3.5 h-3.5 text-[var(--color-text-muted)] mt-0.5 shrink-0" />
                    <div>
                      <span className="text-[9px] uppercase tracking-wider text-[var(--color-text-muted)] font-mono block">Repartidores</span>
                      <span className="text-xs text-[var(--color-text)]">{agency.repartidoresCount}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
