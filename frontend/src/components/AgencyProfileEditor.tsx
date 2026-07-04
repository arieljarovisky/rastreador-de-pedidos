import { useState, useCallback, useRef, type ReactNode } from 'react';
import { Building2, MapPin, Globe, Instagram, Truck, Pencil, Camera, X, Check, Map, DollarSign, Package } from 'lucide-react';
import type { AgencyMarketplaceProfile, AgencyShippingService, AgencyCoverageArea } from '../types.js';
import { apiUrl } from '../api.js';

interface AgencyProfileEditorProps {
  agencyName: string;
  profile: AgencyMarketplaceProfile;
  token: string;
  onSave: (profile: AgencyMarketplaceProfile) => Promise<AgencyMarketplaceProfile>;
  onLogoChange?: (logoUrl: string | null) => void;
  children?: ReactNode;
}

function serviceLabel(service: AgencyShippingService): string {
  switch (service.type) {
    case 'same_day': return 'Envío en el día';
    case 'turbo': return 'Envío Turbo (2-4hs)';
    case 'custom': return service.label || 'Personalizado';
  }
}

function serviceColor(type: AgencyShippingService['type']): string {
  switch (type) {
    case 'same_day': return 'var(--color-ok)';
    case 'turbo': return '#f59e0b';
    case 'custom': return '#6366f1';
  }
}

export default function AgencyProfileEditor({ agencyName, profile, token, onSave, onLogoChange, children }: AgencyProfileEditorProps) {
  const [editing, setEditing] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(profile.logoUrl ?? null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLogoUpload = useCallback(async (file: File) => {
    if (file.size > 500_000) {
      alert('El logo es demasiado grande. Máximo 500KB.');
      return;
    }

    if (!file.type.startsWith('image/')) {
      alert('Solo se permiten archivos de imagen.');
      return;
    }

    setUploadingLogo(true);
    try {
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const res = await fetch(apiUrl('/api/accounts/agency/logo'), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ logoUrl: dataUrl }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error || 'No se pudo subir el logo');
      }

      setLogoUrl(dataUrl);
      onLogoChange?.(dataUrl);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al subir logo');
    } finally {
      setUploadingLogo(false);
    }
  }, [token, onLogoChange]);

  const handleRemoveLogo = useCallback(async () => {
    setUploadingLogo(true);
    try {
      await fetch(apiUrl('/api/accounts/agency/logo'), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ logoUrl: null }),
      });
      setLogoUrl(null);
      onLogoChange?.(null);
    } catch {
      alert('No se pudo eliminar el logo');
    } finally {
      setUploadingLogo(false);
    }
  }, [token, onLogoChange]);

  if (editing) {
    return (
      <div className="relative">
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="absolute top-2 right-2 z-10 p-1.5 rounded-full bg-[var(--surface-panel-2)] border border-[var(--surface-border)] hover:bg-[var(--color-danger)]/10 hover:border-[var(--color-danger)]/40 text-[var(--color-text-muted)] hover:text-[var(--color-danger)] transition"
          title="Cerrar editor"
        >
          <X className="w-3.5 h-3.5" />
        </button>
        {children}
      </div>
    );
  }

  return (
    <div className="relative group">
      {/* Edit button */}
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="absolute top-3 right-3 z-10 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[var(--color-accent)] text-white text-[11px] font-bold shadow-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-[var(--color-accent)]/90"
        title="Editar perfil"
      >
        <Pencil className="w-3 h-3" /> Editar
      </button>

      {/* Profile Preview */}
      <div className="border border-[var(--surface-border)] rounded-xl overflow-hidden bg-[var(--surface-panel)]">
        {/* Hero */}
        <div className="relative bg-gradient-to-br from-[var(--color-accent)]/10 via-[var(--surface-panel)] to-[var(--surface-panel-2)] px-4 sm:px-5 py-5 border-b border-[var(--surface-border)]">
          <div className="flex items-start gap-4">
            {/* Logo */}
            <div className="relative group/logo shrink-0">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={`Logo de ${agencyName}`}
                  className="w-16 h-16 rounded-xl object-cover border-2 border-[var(--surface-border)]"
                />
              ) : (
                <div className="w-16 h-16 rounded-xl bg-[var(--color-accent)]/10 border-2 border-[var(--color-accent)]/30 flex items-center justify-center">
                  <Building2 className="w-7 h-7 text-[var(--color-accent)]" />
                </div>
              )}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingLogo}
                className="absolute -bottom-1 -right-1 p-1 rounded-full bg-[var(--surface-panel)] border border-[var(--surface-border)] text-[var(--color-text-muted)] hover:text-[var(--color-accent)] hover:border-[var(--color-accent)]/50 transition shadow-sm"
                title="Cambiar logo"
              >
                <Camera className="w-3 h-3" />
              </button>
              {logoUrl && (
                <button
                  type="button"
                  onClick={handleRemoveLogo}
                  disabled={uploadingLogo}
                  className="absolute -top-1 -right-1 p-0.5 rounded-full bg-[var(--color-danger)] text-white transition shadow-sm opacity-0 group-hover/logo:opacity-100"
                  title="Eliminar logo"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleLogoUpload(file);
                  e.target.value = '';
                }}
              />
            </div>

            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold text-[var(--color-text)]">{agencyName}</h2>
              {(profile.city || profile.province) && (
                <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)] mt-0.5">
                  <MapPin className="w-3.5 h-3.5" />
                  <span>{[profile.city, profile.province].filter(Boolean).join(', ')}</span>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-3 mt-2">
                {profile.website && (
                  <span className="inline-flex items-center gap-1 text-[10px] text-[var(--color-accent)]">
                    <Globe className="w-3 h-3" />
                    {profile.website.replace(/^https?:\/\//, '')}
                  </span>
                )}
                {profile.instagram && (
                  <span className="inline-flex items-center gap-1 text-[10px] text-[var(--color-accent)]">
                    <Instagram className="w-3 h-3" />
                    @{profile.instagram.replace(/^@/, '')}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Services */}
        {profile.shippingServices.length > 0 && (
          <div className="px-4 sm:px-5 py-3 border-b border-[var(--surface-border)]">
            <div className="flex items-center gap-2 mb-2">
              <Truck className="w-3.5 h-3.5 text-[var(--color-accent)]" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Servicios</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {profile.shippingServices.map((s, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[var(--surface-border)] bg-[var(--surface-panel-2)]"
                >
                  <Truck className="w-3 h-3" style={{ color: serviceColor(s.type) }} />
                  <span className="text-[11px] font-medium text-[var(--color-text)]">{serviceLabel(s)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Coverage */}
        {profile.coverageAreas.length > 0 && (
          <div className="px-4 sm:px-5 py-3 border-b border-[var(--surface-border)]">
            <div className="flex items-center gap-2 mb-2">
              <Map className="w-3.5 h-3.5 text-[var(--color-accent)]" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Cobertura y tarifas</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {profile.coverageAreas.slice(0, 4).map((area) => (
                <CoverageCard key={area.id} area={area} />
              ))}
              {profile.coverageAreas.length > 4 && (
                <div className="flex items-center justify-center text-[10px] text-[var(--color-text-muted)] py-2">
                  +{profile.coverageAreas.length - 4} zonas más
                </div>
              )}
            </div>
          </div>
        )}

        {/* Empty state */}
        {profile.shippingServices.length === 0 && profile.coverageAreas.length === 0 && !profile.website && !profile.instagram && (
          <div className="px-4 py-6 text-center">
            <p className="text-xs text-[var(--color-text-muted)]">
              Tu perfil está vacío. Hacé clic en <strong>Editar</strong> para agregar servicios, cobertura e información de contacto.
            </p>
          </div>
        )}

        {/* Footer hint */}
        <div className="px-4 py-2 bg-[var(--surface-panel-2)] text-center">
          <p className="text-[9px] text-[var(--color-text-muted)] uppercase tracking-wider">
            Así se ve tu agencia para los vendedores en el marketplace
          </p>
        </div>
      </div>
    </div>
  );
}

function CoverageCard({ area }: { area: AgencyCoverageArea; key?: string }) {
  return (
    <div className="flex items-start justify-between gap-2 px-2.5 py-2 rounded-lg bg-[var(--surface-panel-2)] border border-[var(--surface-border)]">
      <div className="min-w-0">
        <span className="text-[11px] font-medium text-[var(--color-text)] block truncate">{area.name}</span>
        {area.places.length > 0 && (
          <span className="text-[9px] text-[var(--color-text-muted)] truncate block">
            {area.places.slice(0, 3).join(', ')}{area.places.length > 3 ? '…' : ''}
          </span>
        )}
      </div>
      <div className="text-right shrink-0">
        <span className="text-[11px] font-mono font-bold text-[var(--color-ok)]">${area.tariff.toLocaleString('es-AR')}</span>
        {area.minimumOrders && (
          <span className="text-[8px] text-[var(--color-text-muted)] block">mín. {area.minimumOrders}</span>
        )}
      </div>
    </div>
  );
}
