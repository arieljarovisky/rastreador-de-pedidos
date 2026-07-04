import { useState, useEffect, useCallback } from 'react';
import { Building2, MapPin, Globe, Instagram, Truck, ArrowLeft, Search, ChevronRight } from 'lucide-react';
import { apiUrl } from '../api.js';
import type { MarketplaceAgency, AgencyShippingService } from '../types.js';
import AgencyProfilePage from './AgencyProfilePage.tsx';

interface AgenciesPageProps {
  token: string;
  onBack: () => void;
}

function serviceLabel(service: AgencyShippingService): string {
  switch (service.type) {
    case 'same_day': return 'Envío en el día';
    case 'turbo': return 'Envío Turbo';
    case 'custom': return service.label || 'Personalizado';
  }
}

function AgencyCard({ agency, onClick }: { agency: MarketplaceAgency; onClick: () => void; key?: string }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-[var(--surface-panel)] border border-[var(--surface-border)] rounded-lg p-4 hover:border-[var(--color-accent)]/50 hover:shadow-md transition-all group"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-9 h-9 rounded-full bg-[var(--color-accent)]/10 border border-[var(--color-accent)]/30 flex items-center justify-center shrink-0">
              <Building2 className="w-4 h-4 text-[var(--color-accent)]" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-[var(--color-text)] truncate group-hover:text-[var(--color-accent)] transition">
                {agency.name}
              </h3>
              {(agency.city || agency.province) && (
                <div className="flex items-center gap-1 text-[10px] text-[var(--color-text-muted)]">
                  <MapPin className="w-3 h-3" />
                  <span>{[agency.city, agency.province].filter(Boolean).join(', ')}</span>
                </div>
              )}
            </div>
          </div>

          {agency.shippingServices.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {agency.shippingServices.map((s, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide bg-[var(--color-ok)]/10 text-[var(--color-ok)] border border-[var(--color-ok)]/20"
                >
                  <Truck className="w-2.5 h-2.5" />
                  {serviceLabel(s)}
                </span>
              ))}
            </div>
          )}

          {agency.coverageAreas && agency.coverageAreas.length > 0 && (
            <div className="mt-2 text-[10px] text-[var(--color-text-muted)]">
              <span className="font-mono uppercase tracking-wider">Cobertura:</span>{' '}
              {agency.coverageAreas.slice(0, 3).map((a) => a.name).join(', ')}
              {agency.coverageAreas.length > 3 && ` +${agency.coverageAreas.length - 3} más`}
            </div>
          )}
        </div>

        <ChevronRight className="w-4 h-4 text-[var(--color-text-muted)] group-hover:text-[var(--color-accent)] transition shrink-0 mt-2" />
      </div>

      <div className="flex items-center gap-3 mt-2.5 pt-2 border-t border-[var(--surface-border)]">
        {agency.website && (
          <span className="inline-flex items-center gap-1 text-[10px] text-[var(--color-text-muted)]">
            <Globe className="w-3 h-3" /> Web
          </span>
        )}
        {agency.instagram && (
          <span className="inline-flex items-center gap-1 text-[10px] text-[var(--color-text-muted)]">
            <Instagram className="w-3 h-3" /> {agency.instagram}
          </span>
        )}
        {!agency.website && !agency.instagram && (
          <span className="text-[10px] text-[var(--color-text-muted)] italic">Sin redes sociales</span>
        )}
      </div>
    </button>
  );
}

export default function AgenciesPage({ token, onBack }: AgenciesPageProps) {
  const [agencies, setAgencies] = useState<MarketplaceAgency[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedAgencyId, setSelectedAgencyId] = useState<string | null>(null);

  const fetchAgencies = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(apiUrl('/api/marketplace/agencies'), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error || 'No se pudieron cargar las agencias');
      }
      setAgencies(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchAgencies();
  }, [fetchAgencies]);

  const filtered = agencies.filter((a) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      a.name.toLowerCase().includes(q) ||
      (a.city?.toLowerCase().includes(q)) ||
      (a.province?.toLowerCase().includes(q))
    );
  });

  if (selectedAgencyId) {
    const agency = agencies.find((a) => a.id === selectedAgencyId);
    if (agency) {
      return (
        <AgencyProfilePage
          agency={agency}
          token={token}
          onBack={() => setSelectedAgencyId(null)}
        />
      );
    }
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between gap-3 px-3 py-2 border-b border-[var(--surface-border)] bg-[var(--surface-panel)]/50">
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="p-1.5 rounded-[var(--radius-posta)] hover:bg-[var(--surface-panel-2)] transition text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            title="Volver"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <Building2 className="w-4 h-4 text-[var(--color-accent)]" />
          <h2 className="text-sm font-bold text-[var(--color-text)]">Agencias de Envío</h2>
          {!loading && (
            <span className="text-[10px] font-mono text-[var(--color-text-muted)] bg-[var(--surface-panel-2)] px-1.5 py-0.5 rounded">
              {filtered.length}
            </span>
          )}
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--color-text-muted)]" />
          <input
            type="text"
            placeholder="Buscar agencia..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-7 pr-3 py-1.5 text-[11px] rounded border border-[var(--surface-border)] bg-[var(--surface-panel-2)] text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] w-44 focus:outline-none focus:border-[var(--color-accent)]/50"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <svg className="animate-spin h-5 w-5 text-[var(--color-accent)]" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
        )}

        {error && (
          <div className="bg-[var(--color-danger)]/10 border border-[var(--color-danger)]/30 rounded-lg p-3 text-sm text-[var(--color-danger)]">
            {error}
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Building2 className="w-10 h-10 text-[var(--color-text-muted)] opacity-40 mb-3" />
            <p className="text-sm text-[var(--color-text-muted)]">
              {search ? 'No se encontraron agencias con ese criterio' : 'No hay agencias disponibles'}
            </p>
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.map((agency) => (
              <AgencyCard
                key={agency.id}
                agency={agency}
                onClick={() => setSelectedAgencyId(agency.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
