import { useState, useCallback, useRef, useEffect, type ReactNode } from 'react';
import { Building2, MapPin, Globe, Instagram, Truck, Pencil, Camera, X, ArrowLeft, Map, Package, Shield, Briefcase } from 'lucide-react';
import type { AgencyMarketplaceProfile, AgencyShippingService, AgencyCoverageArea } from '../types.js';
import { apiUrl } from '../api.js';

interface AgencyProfileEditorProps {
  agencyName: string;
  profile: AgencyMarketplaceProfile;
  token: string;
  onSave: (profile: AgencyMarketplaceProfile) => Promise<AgencyMarketplaceProfile>;
  onLogoChange?: (logoUrl: string | null) => void;
  onBack: () => void;
  editForm: ReactNode;
  onFetchProfile?: () => Promise<AgencyMarketplaceProfile>;
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
    case 'same_day': return '#22c55e';
    case 'turbo': return '#f59e0b';
    case 'custom': return '#6366f1';
  }
}

function serviceIcon(type: AgencyShippingService['type']): string {
  switch (type) {
    case 'same_day': return '📦';
    case 'turbo': return '⚡';
    case 'custom': return '🎯';
  }
}

export default function AgencyProfileEditor({ agencyName, profile: initialProfile, token, onSave, onLogoChange, onBack, editForm, onFetchProfile }: AgencyProfileEditorProps) {
  const [editing, setEditing] = useState(false);
  const [profile, setProfile] = useState<AgencyMarketplaceProfile>(initialProfile);
  const [logoUrl, setLogoUrl] = useState<string | null>(initialProfile.logoUrl ?? null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!onFetchProfile) return;
    setLoading(true);
    void onFetchProfile()
      .then((fetched) => {
        setProfile(fetched);
        setLogoUrl(fetched.logoUrl ?? null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [onFetchProfile]);

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
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
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
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
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
      <div className="h-full flex flex-col overflow-hidden">
        <div className="shrink-0 flex items-center gap-2 px-4 py-3 border-b border-[var(--surface-border)] bg-[var(--surface-panel)]/50">
          <button
            onClick={() => setEditing(false)}
            className="p-1.5 rounded-[var(--radius-posta)] hover:bg-[var(--surface-panel-2)] transition text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <Pencil className="w-4 h-4 text-[var(--color-accent)]" />
          <h2 className="text-sm font-bold text-[var(--color-text)]">Editar perfil de agencia</h2>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {editForm}
        </div>
      </div>
    );
  }

  const hasServices = profile.shippingServices.length > 0;
  const hasCoverage = profile.coverageAreas.length > 0;
  const hasContact = Boolean(profile.website || profile.instagram);
  const isEmpty = !hasServices && !hasCoverage && !hasContact && !profile.city;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="shrink-0 flex items-center justify-between gap-2 px-4 py-2 border-b border-[var(--surface-border)] bg-[var(--surface-panel)]/50">
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="p-1.5 rounded-[var(--radius-posta)] hover:bg-[var(--surface-panel-2)] transition text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h2 className="text-sm font-bold text-[var(--color-text)]">Perfil de la Agencia</h2>
        </div>
        <button
          onClick={() => setEditing(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--color-accent)] text-white text-[11px] font-bold hover:bg-[var(--color-accent)]/90 transition shadow-sm"
        >
          <Pencil className="w-3 h-3" /> Editar perfil
        </button>
      </div>

      {/* LinkedIn-style profile content */}
      <div className="flex-1 overflow-y-auto">
        {/* Banner + Logo */}
        <div className="relative">
          {/* Cover banner */}
          <div className="h-28 sm:h-36 bg-gradient-to-r from-[var(--color-accent)]/20 via-[var(--color-accent)]/10 to-[#6366f1]/15 relative overflow-hidden">
            <div className="absolute inset-0 opacity-10">
              <div className="absolute top-4 left-8 w-32 h-32 rounded-full bg-[var(--color-accent)]/30 blur-3xl" />
              <div className="absolute bottom-2 right-12 w-24 h-24 rounded-full bg-[#6366f1]/30 blur-2xl" />
            </div>
          </div>

          {/* Logo overlapping banner */}
          <div className="absolute left-4 sm:left-6 -bottom-10 sm:-bottom-12">
            <div className="relative group/logo">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={`Logo de ${agencyName}`}
                  className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl object-cover border-4 border-[var(--surface-bg)] shadow-lg bg-[var(--surface-panel)]"
                />
              ) : (
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl bg-[var(--surface-panel)] border-4 border-[var(--surface-bg)] shadow-lg flex items-center justify-center">
                  <Building2 className="w-8 h-8 sm:w-10 sm:h-10 text-[var(--color-accent)]" />
                </div>
              )}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingLogo}
                className="absolute -bottom-1 -right-1 p-1.5 rounded-full bg-[var(--surface-panel)] border border-[var(--surface-border)] text-[var(--color-text-muted)] hover:text-[var(--color-accent)] hover:border-[var(--color-accent)]/50 transition shadow-md"
                title="Cambiar logo"
              >
                <Camera className="w-3.5 h-3.5" />
              </button>
              {logoUrl && (
                <button
                  type="button"
                  onClick={handleRemoveLogo}
                  disabled={uploadingLogo}
                  className="absolute -top-1 -right-1 p-1 rounded-full bg-[var(--color-danger)] text-white shadow-md opacity-0 group-hover/logo:opacity-100 transition"
                  title="Eliminar logo"
                >
                  <X className="w-3 h-3" />
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
          </div>
        </div>

        {/* Name & Info - with padding for logo overlap */}
        <div className="pt-14 sm:pt-16 px-4 sm:px-6 pb-4 border-b border-[var(--surface-border)] bg-[var(--surface-panel)]">
          <h1 className="text-xl sm:text-2xl font-bold text-[var(--color-text)] leading-tight">{agencyName}</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-0.5 flex items-center gap-1.5">
            <Briefcase className="w-3.5 h-3.5" />
            Agencia de logística y envíos
          </p>
          {(profile.city || profile.province) && (
            <p className="text-xs text-[var(--color-text-muted)] mt-1 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5" />
              {[profile.city, profile.province].filter(Boolean).join(', ')} · Argentina
            </p>
          )}

          {/* Contact links */}
          {hasContact && (
            <div className="flex flex-wrap items-center gap-3 mt-3">
              {profile.website && (
                <a
                  href={profile.website.startsWith('http') ? profile.website : `https://${profile.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-[var(--color-accent)] hover:underline font-medium"
                >
                  <Globe className="w-3.5 h-3.5" />
                  {profile.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                </a>
              )}
              {profile.instagram && (
                <a
                  href={`https://instagram.com/${profile.instagram.replace('@', '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-[var(--color-accent)] hover:underline font-medium"
                >
                  <Instagram className="w-3.5 h-3.5" />
                  @{profile.instagram.replace(/^@/, '')}
                </a>
              )}
            </div>
          )}
        </div>

        <div className="px-4 sm:px-6 py-4 space-y-4">
          {/* About section */}
          <section className="bg-[var(--surface-panel)] border border-[var(--surface-border)] rounded-xl p-4 sm:p-5">
            <h3 className="text-sm font-bold text-[var(--color-text)] mb-3 flex items-center gap-2">
              <Shield className="w-4 h-4 text-[var(--color-accent)]" />
              Acerca de
            </h3>
            <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
              {agencyName} es una agencia de logística
              {profile.city ? ` con base en ${profile.city}` : ''}
              {profile.province && !profile.city ? ` en ${profile.province}` : ''}
              {hasServices ? ` que ofrece ${profile.shippingServices.map(s => serviceLabel(s).toLowerCase()).join(', ')}` : ''}
              {hasCoverage ? `. Cubrimos ${profile.coverageAreas.length} zona${profile.coverageAreas.length > 1 ? 's' : ''} de entrega` : ''}
              .
            </p>
            <div className="flex flex-wrap gap-4 mt-4 pt-3 border-t border-[var(--surface-border)]">
              <div className="text-center">
                <span className="text-lg font-bold font-mono text-[var(--color-text)] block">{profile.shippingServices.length}</span>
                <span className="text-[9px] uppercase tracking-wider text-[var(--color-text-muted)]">Servicios</span>
              </div>
              <div className="text-center">
                <span className="text-lg font-bold font-mono text-[var(--color-text)] block">{profile.coverageAreas.length}</span>
                <span className="text-[9px] uppercase tracking-wider text-[var(--color-text-muted)]">Zonas</span>
              </div>
              {hasCoverage && (
                <div className="text-center">
                  <span className="text-lg font-bold font-mono text-[var(--color-ok)] block">
                    ${Math.min(...profile.coverageAreas.map(a => a.tariff)).toLocaleString('es-AR')}
                  </span>
                  <span className="text-[9px] uppercase tracking-wider text-[var(--color-text-muted)]">Desde</span>
                </div>
              )}
            </div>
          </section>

          {/* Services section */}
          {hasServices && (
            <section className="bg-[var(--surface-panel)] border border-[var(--surface-border)] rounded-xl p-4 sm:p-5">
              <h3 className="text-sm font-bold text-[var(--color-text)] mb-3 flex items-center gap-2">
                <Truck className="w-4 h-4 text-[var(--color-accent)]" />
                Servicios de envío
              </h3>
              <div className="space-y-3">
                {profile.shippingServices.map((s, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-[var(--surface-panel-2)] border border-[var(--surface-border)]">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center text-lg shrink-0"
                      style={{ backgroundColor: `${serviceColor(s.type)}15` }}
                    >
                      {serviceIcon(s.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-xs font-bold text-[var(--color-text)]">{serviceLabel(s)}</h4>
                      <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
                        {s.type === 'same_day' && 'Retiro y entrega en el mismo día hábil. Ideal para envíos locales.'}
                        {s.type === 'turbo' && 'Entrega express en 2 a 4 horas desde el retiro. Para envíos urgentes.'}
                        {s.type === 'custom' && (s.description || 'Servicio adaptado a las necesidades de tu negocio.')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Coverage section */}
          {hasCoverage && (
            <section className="bg-[var(--surface-panel)] border border-[var(--surface-border)] rounded-xl p-4 sm:p-5">
              <h3 className="text-sm font-bold text-[var(--color-text)] mb-3 flex items-center gap-2">
                <Map className="w-4 h-4 text-[var(--color-accent)]" />
                Zonas de cobertura
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {profile.coverageAreas.map((area) => (
                  <CoverageAreaCard key={area.id} area={area} />
                ))}
              </div>
            </section>
          )}

          {/* Empty state */}
          {isEmpty && (
            <section className="bg-[var(--surface-panel)] border border-[var(--surface-border)] rounded-xl p-6 text-center">
              <Building2 className="w-10 h-10 text-[var(--color-text-muted)] opacity-40 mx-auto mb-3" />
              <h3 className="text-sm font-bold text-[var(--color-text)] mb-1">Tu perfil está vacío</h3>
              <p className="text-xs text-[var(--color-text-muted)] mb-4">
                Completá tu perfil para que los vendedores te encuentren en el marketplace.
              </p>
              <button
                onClick={() => setEditing(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--color-accent)] text-white text-xs font-bold hover:bg-[var(--color-accent)]/90 transition"
              >
                <Pencil className="w-3.5 h-3.5" /> Completar perfil
              </button>
            </section>
          )}

          {/* Footer */}
          <div className="text-center py-2">
            <p className="text-[9px] text-[var(--color-text-muted)] uppercase tracking-widest">
              Vista previa · Así ven tu agencia los vendedores del marketplace
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function CoverageAreaCard({ area }: { area: AgencyCoverageArea; key?: string }) {
  return (
    <div className="flex items-start justify-between gap-2 p-3 rounded-lg bg-[var(--surface-panel-2)] border border-[var(--surface-border)]">
      <div className="min-w-0 flex-1">
        <span className="text-[11px] font-bold text-[var(--color-text)] block truncate">{area.name}</span>
        {area.places.length > 0 && (
          <span className="text-[9px] text-[var(--color-text-muted)] block mt-0.5">
            {area.places.slice(0, 4).join(', ')}{area.places.length > 4 ? ` +${area.places.length - 4}` : ''}
          </span>
        )}
        {area.minimumOrders && (
          <span className="inline-flex items-center gap-1 text-[8px] text-[var(--color-text-muted)] mt-1">
            <Package className="w-2.5 h-2.5" /> Mín. {area.minimumOrders} pedidos
          </span>
        )}
      </div>
      <div className="text-right shrink-0">
        <span className="text-sm font-mono font-bold text-[var(--color-ok)]">${area.tariff.toLocaleString('es-AR')}</span>
      </div>
    </div>
  );
}
