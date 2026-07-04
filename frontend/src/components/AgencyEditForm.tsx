import { useState, useEffect } from 'react';
import type { AgencyMarketplaceProfile, AgencyShippingService } from '../types.js';
import CoverageAreasEditor, {
  coverageAreasToDrafts,
  defaultCoverageDrafts,
  draftsToCoverageAreas,
  type CoverageAreaDraft,
} from './CoverageAreasEditor.tsx';
import type { MlFlexCordon, MlFlexZone } from '../config/mlFlexZones.js';
import type { Barrio } from '../config/deliveryZones.js';

interface AgencyEditFormProps {
  city?: string;
  province?: string;
  barrios: Barrio[];
  mlZones: MlFlexZone[];
  cordonLabels: Record<MlFlexCordon, string>;
  cordonOrder: MlFlexCordon[];
  onFetchProfile?: () => Promise<AgencyMarketplaceProfile>;
  onSaveProfile: (profile: AgencyMarketplaceProfile) => Promise<AgencyMarketplaceProfile>;
  onRefreshMarketplaceAgencies?: () => void;
  onSaved?: () => void;
}

export default function AgencyEditForm({
  city = '',
  province = '',
  barrios,
  mlZones,
  cordonLabels,
  cordonOrder,
  onFetchProfile,
  onSaveProfile,
  onRefreshMarketplaceAgencies,
  onSaved,
}: AgencyEditFormProps) {
  const [profileWebsite, setProfileWebsite] = useState('');
  const [profileInstagram, setProfileInstagram] = useState('');
  const [profileCity, setProfileCity] = useState(city);
  const [profileProvince, setProfileProvince] = useState(province);
  const [profileSameDay, setProfileSameDay] = useState(false);
  const [profileTurbo, setProfileTurbo] = useState(false);
  const [profileCustomLabel, setProfileCustomLabel] = useState('');
  const [profileCoverageDrafts, setProfileCoverageDrafts] = useState<CoverageAreaDraft[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (!onFetchProfile) return;
    setLoading(true);
    void onFetchProfile()
      .then((profile) => {
        setProfileWebsite(profile.website ?? '');
        setProfileInstagram(profile.instagram ?? '');
        setProfileCity(profile.city ?? city);
        setProfileProvince(profile.province ?? province);
        setProfileSameDay(profile.shippingServices.some((s) => s.type === 'same_day'));
        setProfileTurbo(profile.shippingServices.some((s) => s.type === 'turbo'));
        const custom = profile.shippingServices.find((s) => s.type === 'custom');
        setProfileCustomLabel(custom?.label ?? '');
        const drafts = coverageAreasToDrafts(profile.coverageAreas ?? []);
        setProfileCoverageDrafts(
          drafts.length > 0
            ? drafts
            : mlZones.length > 0
              ? defaultCoverageDrafts(mlZones, cordonLabels, cordonOrder)
              : []
        );
      })
      .catch(() => {
        setProfileCoverageDrafts(
          mlZones.length > 0 ? defaultCoverageDrafts(mlZones, cordonLabels, cordonOrder) : []
        );
      })
      .finally(() => setLoading(false));
  }, [onFetchProfile, city, province, mlZones, cordonLabels, cordonOrder]);

  const handleSave = async () => {
    setSaving(true);
    setSaveSuccess(false);
    try {
      const services: AgencyShippingService[] = [];
      if (profileSameDay) services.push({ type: 'same_day' });
      if (profileTurbo) services.push({ type: 'turbo' });
      if (profileCustomLabel.trim()) {
        services.push({ type: 'custom', label: profileCustomLabel.trim() });
      }
      await onSaveProfile({
        website: profileWebsite.trim() || null,
        instagram: profileInstagram.trim() || null,
        city: profileCity.trim() || null,
        province: profileProvince.trim() || null,
        shippingServices: services,
        coverageAreas: draftsToCoverageAreas(profileCoverageDrafts, barrios, mlZones),
      });
      onRefreshMarketplaceAgencies?.();
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      onSaved?.();
    } catch {
      alert('No se pudo guardar el perfil');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="w-5 h-5 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
        <span className="ml-2 text-xs text-[var(--color-text-muted)]">Cargando perfil...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] uppercase font-bold tracking-wider text-[var(--color-text-muted)] block mb-1.5">Ciudad</label>
          <input
            type="text"
            value={profileCity}
            onChange={(e) => setProfileCity(e.target.value)}
            placeholder="Ej: Córdoba"
            className="w-full bg-[var(--surface-panel-2)] border border-[var(--surface-border)] rounded-lg px-3 py-2 text-xs text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none transition"
          />
        </div>
        <div>
          <label className="text-[10px] uppercase font-bold tracking-wider text-[var(--color-text-muted)] block mb-1.5">Provincia</label>
          <input
            type="text"
            value={profileProvince}
            onChange={(e) => setProfileProvince(e.target.value)}
            placeholder="Ej: Córdoba"
            className="w-full bg-[var(--surface-panel-2)] border border-[var(--surface-border)] rounded-lg px-3 py-2 text-xs text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none transition"
          />
        </div>
      </div>

      <div>
        <label className="text-[10px] uppercase font-bold tracking-wider text-[var(--color-text-muted)] block mb-1.5">Sitio web</label>
        <input
          type="url"
          value={profileWebsite}
          onChange={(e) => setProfileWebsite(e.target.value)}
          placeholder="https://tuagencia.com"
          className="w-full bg-[var(--surface-panel-2)] border border-[var(--surface-border)] rounded-lg px-3 py-2 text-xs text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none transition"
        />
      </div>

      <div>
        <label className="text-[10px] uppercase font-bold tracking-wider text-[var(--color-text-muted)] block mb-1.5">Instagram</label>
        <input
          type="text"
          value={profileInstagram}
          onChange={(e) => setProfileInstagram(e.target.value)}
          placeholder="@tuagencia"
          className="w-full bg-[var(--surface-panel-2)] border border-[var(--surface-border)] rounded-lg px-3 py-2 text-xs text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none transition"
        />
      </div>

      <div>
        <label className="text-[10px] uppercase font-bold tracking-wider text-[var(--color-text-muted)] block mb-1.5">Servicios de envío</label>
        <div className="flex flex-wrap gap-3 mb-2">
          <label className="flex items-center gap-2 text-xs cursor-pointer select-none px-3 py-2 rounded-lg border border-[var(--surface-border)] bg-[var(--surface-panel-2)] hover:border-[var(--color-accent)]/50 transition">
            <input type="checkbox" checked={profileSameDay} onChange={(e) => setProfileSameDay(e.target.checked)} className="accent-[var(--color-accent)]" />
            Envío en el día
          </label>
          <label className="flex items-center gap-2 text-xs cursor-pointer select-none px-3 py-2 rounded-lg border border-[var(--surface-border)] bg-[var(--surface-panel-2)] hover:border-[var(--color-accent)]/50 transition">
            <input type="checkbox" checked={profileTurbo} onChange={(e) => setProfileTurbo(e.target.checked)} className="accent-[var(--color-accent)]" />
            Envío turbo
          </label>
        </div>
        <input
          type="text"
          value={profileCustomLabel}
          onChange={(e) => setProfileCustomLabel(e.target.value)}
          placeholder="Servicio personalizado (opcional)"
          className="w-full bg-[var(--surface-panel-2)] border border-[var(--surface-border)] rounded-lg px-3 py-2 text-xs text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none transition"
        />
      </div>

      <CoverageAreasEditor
        value={profileCoverageDrafts}
        onChange={setProfileCoverageDrafts}
        barrios={barrios}
        mlZones={mlZones}
        cordonLabels={cordonLabels}
        cordonOrder={cordonOrder}
        disabled={saving}
      />

      <button
        type="button"
        disabled={saving}
        className="w-full py-2.5 rounded-lg bg-[var(--color-accent)] text-white text-xs font-bold hover:bg-[var(--color-accent)]/90 disabled:opacity-50 transition"
        onClick={() => void handleSave()}
      >
        {saving ? 'Guardando...' : saveSuccess ? 'Guardado correctamente' : 'Guardar cambios'}
      </button>
    </div>
  );
}
