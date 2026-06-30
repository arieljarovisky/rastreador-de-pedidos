/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo, type ReactNode } from 'react';
import { User, UserRole, LocationPoint, PickupPoint, isAgencyAdmin, SellerDetail, AgencyIntegrationsStatus, type MlFlexMode, type MarketplaceAgency, type AgencyMarketplaceProfile, type AgencyShippingService } from '../types.js';
import { geocodeAddress } from '../utils/geocode.js';
import { useModal } from '../context/ModalContext.tsx';
import {
  Warehouse,
  UserPlus,
  MapPin,
  Trash2,
  Settings,
  ArrowLeft,
  Pencil,
  ChevronRight,
  Key,
  Building2,
  Layers,
  Search,
  ChevronDown,
} from 'lucide-react';
import MarketplaceIntegrations from './MarketplaceIntegrations.tsx';
import AgencyMarketplacePanel from './AgencyMarketplacePanel.tsx';
import SellerPickupPanel from './SellerPickupPanel.tsx';
import type { MercadoLibreScanImportResult } from './MercadoLibreLabelScanner.tsx';
import { zoneLabel, getDeliveryZone, ZONE_COLOR_PRESETS, barrioNames, type DeliveryZone, type Barrio } from '../config/deliveryZones.js';
import type { MarketplaceIntegrationStatus, MarketplaceShipmentPreview } from '../types.js';

const REPARTIDORES_PAGE_SIZE = 8;

function SettingsSectionHeader({
  icon,
  emoji,
  title,
  meta,
  action,
  accentClass = 'bg-[var(--color-accent)]/10',
}: {
  icon?: ReactNode;
  emoji?: string;
  title: string;
  meta?: string;
  action?: ReactNode;
  accentClass?: string;
}) {
  return (
    <div className="flex items-center gap-2 shrink-0 pb-2 mb-2 border-b border-[var(--surface-border)]">
      <div
        className={`w-7 h-7 rounded-[5px] flex items-center justify-center shrink-0 text-sm ${accentClass}`}
      >
        {icon ?? (emoji ? <span className="leading-none">{emoji}</span> : null)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-display font-semibold text-[var(--color-text)] leading-tight">{title}</p>
        {meta ? <p className="mono-label mt-0.5 truncate normal-case tracking-normal">{meta}</p> : null}
      </div>
      {action}
    </div>
  );
}

function SettingsFleetColumn({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col min-w-0 w-full p-3 ${className}`}>{children}</div>
  );
}

const DIRECTORY_PRESETS = [
  { name: 'Palermo Chico (Av. del Libertador 2400)', lat: -34.5802, lng: -58.4035 },
  { name: 'San Telmo (Defensa 800)', lat: -34.6186, lng: -58.3732 },
  { name: 'Flores (Av. Rivadavia 6500)', lat: -34.6305, lng: -58.4632 },
  { name: 'Chacarita (Av. Corrientes 6200)', lat: -34.5872, lng: -58.4445 },
  { name: 'Recoleta (Av. Las Heras 2100)', lat: -34.5877, lng: -58.3972 },
];

interface SettingsPageProps {
  user: User;
  onBack?: () => void;
  departurePoint?: LocationPoint | null;
  repartidores: User[];
  sellers?: User[];
  pickupPoints?: PickupPoint[];
  deliveryZones?: DeliveryZone[];
  barrios?: Barrio[];
  onCreateDeliveryZone?: (data: {
    name?: string;
    color?: string;
    barrios: string[];
  }) => Promise<DeliveryZone>;
  onUpdateDeliveryZone?: (
    zoneId: string,
    data: {
      name?: string;
      color?: string;
      barrios?: string[];
    }
  ) => Promise<DeliveryZone>;
  onDeleteDeliveryZone?: (zoneId: string) => Promise<void>;
  onUpdateDeparture?: (data: LocationPoint) => Promise<void>;
  onCreateSeller?: (data: {
    username: string;
    password: string;
    name: string;
    pickupLabel?: string;
    pickupAddress?: string;
    pickupLat?: number;
    pickupLng?: number;
  }) => Promise<User>;
  onFetchSellerDetail?: (sellerId: string) => Promise<SellerDetail>;
  onUpdateSeller?: (sellerId: string, data: { name: string; username: string }) => Promise<User>;
  onUpdateSellerPassword?: (sellerId: string, password: string) => Promise<void>;
  onDeleteSeller?: (sellerId: string) => Promise<{ unlinkedOrders: number }>;
  onCreateRepartidor?: (data: { username: string; password: string; name: string; deliveryZone?: string | null }) => Promise<void>;
  onUpdateRepartidorZone?: (repartidorId: string, deliveryZone: string | null) => Promise<void>;
  onDeleteRepartidor?: (id: string) => Promise<{ finalizedOrders: number }>;
  onCreatePickupPoint?: (data: {
    label?: string;
    address: string;
    lat: number;
    lng: number;
  }) => Promise<void>;
  onUpdatePickupPoint?: (
    id: string,
    data: { label?: string; address: string; lat: number; lng: number }
  ) => Promise<void>;
  onDeletePickupPoint?: (id: string) => Promise<void>;
  integrationStatus?: MarketplaceIntegrationStatus | null;
  integrationStatusLoading?: boolean;
  integrationStatusError?: string | null;
  onRefreshIntegrationStatus?: () => Promise<void>;
  onConnectMarketplace?: (platform: 'mercadolibre' | 'tiendanube') => Promise<void>;
  onDisconnectMarketplace?: (platform: 'mercadolibre' | 'tiendanube') => Promise<void>;
  onFetchMarketplaceShipments?: (
    platform: 'mercadolibre' | 'tiendanube',
    options?: { dateFrom?: string; dateTo?: string }
  ) => Promise<MarketplaceShipmentPreview[]>;
  onImportMarketplaceShipments?: (
    platform: 'mercadolibre' | 'tiendanube',
    externalIds?: string[],
    options?: { dateFrom?: string; dateTo?: string; agencyId?: string }
  ) => Promise<{ imported: number; skipped: number; errors?: string[] }>;
  agencyIntegrationsStatus?: AgencyIntegrationsStatus | null;
  agencyCourierStatusLoading?: boolean;
  onRefreshAgencyCourierStatus?: () => Promise<void>;
  onUpdateAgencyMlFlexMode?: (mode: MlFlexMode) => Promise<void>;
  onUpdateAgencyMarketplaceProfile?: (profile: AgencyMarketplaceProfile) => Promise<AgencyMarketplaceProfile>;
  marketplaceAgencies?: MarketplaceAgency[];
  marketplaceAgenciesLoading?: boolean;
  onUpdateSellerPreferredAgency?: (agencyId: string) => Promise<void>;
  onRefreshMarketplaceAgencies?: () => Promise<void>;
  onConnectMercadoLibreCourier?: () => Promise<void>;
  onDisconnectMercadoLibreCourier?: () => Promise<void>;
  onScanMercadoLibreLabel?: (
    code: string,
    sellerId?: string,
    scanLocation?: { lat: number; lng: number } | null
  ) => Promise<MercadoLibreScanImportResult>;
}

export default function SettingsPage({
  user,
  onBack,
  departurePoint = null,
  repartidores,
  sellers = [],
  pickupPoints = [],
  deliveryZones = [],
  barrios = [],
  onCreateDeliveryZone,
  onUpdateDeliveryZone,
  onDeleteDeliveryZone,
  onUpdateDeparture,
  onCreateSeller,
  onFetchSellerDetail,
  onUpdateSeller,
  onUpdateSellerPassword,
  onDeleteSeller,
  onCreateRepartidor,
  onUpdateRepartidorZone,
  onDeleteRepartidor,
  onCreatePickupPoint,
  onUpdatePickupPoint,
  onDeletePickupPoint,
  integrationStatus = null,
  integrationStatusLoading = false,
  integrationStatusError = null,
  onRefreshIntegrationStatus,
  onConnectMarketplace,
  onDisconnectMarketplace,
  onFetchMarketplaceShipments,
  onImportMarketplaceShipments,
  agencyIntegrationsStatus = null,
  agencyCourierStatusLoading = false,
  onRefreshAgencyCourierStatus,
  onUpdateAgencyMlFlexMode,
  onUpdateAgencyMarketplaceProfile,
  marketplaceAgencies = [],
  marketplaceAgenciesLoading = false,
  onUpdateSellerPreferredAgency,
  onRefreshMarketplaceAgencies,
  onConnectMercadoLibreCourier,
  onDisconnectMercadoLibreCourier,
  onScanMercadoLibreLabel,
}: SettingsPageProps) {
  const userRole = user.role;
  const agency = isAgencyAdmin(userRole);
  const { confirm, alert: showAlert } = useModal();
  const [mlFlexModeSaving, setMlFlexModeSaving] = useState(false);
  const mlFlexMode = agencyIntegrationsStatus?.mlFlexMode ?? user.agencyMlFlexMode ?? 'agency';
  const agencyCourierStatus = agencyIntegrationsStatus?.mercadolibreCourier ?? null;
  const isMarketplaceSeller = Boolean(user.isMarketplaceSeller || (userRole === UserRole.STORE_ADMIN && !user.agencyId));

  const [profileWebsite, setProfileWebsite] = useState('');
  const [profileInstagram, setProfileInstagram] = useState('');
  const [profileCity, setProfileCity] = useState(user.city ?? '');
  const [profileProvince, setProfileProvince] = useState(user.province ?? '');
  const [profileSameDay, setProfileSameDay] = useState(false);
  const [profileTurbo, setProfileTurbo] = useState(false);
  const [profileCustomLabel, setProfileCustomLabel] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);

  const [showDepartureForm, setShowDepartureForm] = useState(false);
  const [departureAddress, setDepartureAddress] = useState(departurePoint?.address ?? '');
  const [departureLat, setDepartureLat] = useState(departurePoint?.lat ?? -34.5885);
  const [departureLng, setDepartureLng] = useState(departurePoint?.lng ?? -58.4306);
  const [departureLoading, setDepartureLoading] = useState(false);
  const [departureMessage, setDepartureMessage] = useState<string | null>(null);

  const [showSellerForm, setShowSellerForm] = useState(false);
  const [sellerName, setSellerName] = useState('');
  const [sellerUsername, setSellerUsername] = useState('');
  const [sellerPassword, setSellerPassword] = useState('');
  const [sellerPickupLabel, setSellerPickupLabel] = useState('');
  const [sellerPickupAddress, setSellerPickupAddress] = useState('');
  const [sellerPickupLat, setSellerPickupLat] = useState(-34.58);
  const [sellerPickupLng, setSellerPickupLng] = useState(-58.4);
  const [sellerFormLoading, setSellerFormLoading] = useState(false);
  const [sellerFormMessage, setSellerFormMessage] = useState<string | null>(null);
  const [selectedSellerId, setSelectedSellerId] = useState<string | null>(null);
  const [sellerDetail, setSellerDetail] = useState<SellerDetail | null>(null);
  const [sellerDetailLoading, setSellerDetailLoading] = useState(false);
  const [sellerDetailError, setSellerDetailError] = useState<string | null>(null);
  const [newSellerPassword, setNewSellerPassword] = useState('');
  const [confirmSellerPassword, setConfirmSellerPassword] = useState('');
  const [passwordUpdateLoading, setPasswordUpdateLoading] = useState(false);
  const [passwordUpdateMessage, setPasswordUpdateMessage] = useState<string | null>(null);
  const [editingSeller, setEditingSeller] = useState(false);
  const [editSellerName, setEditSellerName] = useState('');
  const [editSellerUsername, setEditSellerUsername] = useState('');
  const [sellerUpdateLoading, setSellerUpdateLoading] = useState(false);
  const [sellerUpdateMessage, setSellerUpdateMessage] = useState<string | null>(null);
  const [deletingSellerId, setDeletingSellerId] = useState<string | null>(null);

  const [showRepartidorForm, setShowRepartidorForm] = useState(false);
  const [repartidorName, setRepartidorName] = useState('');
  const [repartidorUsername, setRepartidorUsername] = useState('');
  const [repartidorPassword, setRepartidorPassword] = useState('');
  const [repartidorZone, setRepartidorZone] = useState('');
  const [repartidorFormLoading, setRepartidorFormLoading] = useState(false);
  const [updatingZoneId, setUpdatingZoneId] = useState<string | null>(null);
  const [repartidorFormMessage, setRepartidorFormMessage] = useState<string | null>(null);
  const [deletingRepartidorId, setDeletingRepartidorId] = useState<string | null>(null);

  const [showZoneForm, setShowZoneForm] = useState(false);
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  const [zoneName, setZoneName] = useState('');
  const [zoneColor, setZoneColor] = useState(ZONE_COLOR_PRESETS[0]);
  const [selectedBarrios, setSelectedBarrios] = useState<string[]>([]);
  const [barrioSearch, setBarrioSearch] = useState('');
  const [zoneFormLoading, setZoneFormLoading] = useState(false);
  const [zoneFormMessage, setZoneFormMessage] = useState<string | null>(null);
  const [deletingZoneId, setDeletingZoneId] = useState<string | null>(null);
  const [repartidorSearch, setRepartidorSearch] = useState('');
  const [repartidoresLimit, setRepartidoresLimit] = useState(REPARTIDORES_PAGE_SIZE);

  const [showPickupForm, setShowPickupForm] = useState(false);
  const [pickupLabel, setPickupLabel] = useState('');
  const [pickupAddress, setPickupAddress] = useState('');
  const [pickupLat, setPickupLat] = useState(-34.58);
  const [pickupLng, setPickupLng] = useState(-58.4);
  const [pickupLoading, setPickupLoading] = useState(false);
  const [editingPickupId, setEditingPickupId] = useState<string | null>(null);
  const [editPickupLabel, setEditPickupLabel] = useState('');
  const [editPickupAddress, setEditPickupAddress] = useState('');
  const [editPickupLoading, setEditPickupLoading] = useState(false);

  useEffect(() => {
    if (departurePoint) {
      setDepartureAddress(departurePoint.address);
      setDepartureLat(departurePoint.lat);
      setDepartureLng(departurePoint.lng);
    }
  }, [departurePoint]);

  const applyDeparturePreset = (preset: (typeof DIRECTORY_PRESETS)[0]) => {
    setDepartureAddress(preset.name);
    setDepartureLat(preset.lat);
    setDepartureLng(preset.lng);
  };

  const applyPickupPreset = (preset: (typeof DIRECTORY_PRESETS)[0]) => {
    setPickupAddress(preset.name);
    setPickupLat(preset.lat);
    setPickupLng(preset.lng);
  };

  const applyEditPickupPreset = (preset: (typeof DIRECTORY_PRESETS)[0]) => {
    setEditPickupAddress(preset.name);
  };

  const startEditPickup = (point: PickupPoint) => {
    setEditingPickupId(point.id);
    setEditPickupLabel(point.label);
    setEditPickupAddress(point.address);
    setShowPickupForm(false);
  };

  const cancelEditPickup = () => {
    setEditingPickupId(null);
    setEditPickupLabel('');
    setEditPickupAddress('');
  };

  const loadSellerDetail = async (sellerId: string) => {
    if (!onFetchSellerDetail) return;
    setSelectedSellerId(sellerId);
    setSellerDetail(null);
    setSellerDetailError(null);
    setNewSellerPassword('');
    setConfirmSellerPassword('');
    setPasswordUpdateMessage(null);
    setShowSellerForm(false);
    setSellerDetailLoading(true);
    try {
      const detail = await onFetchSellerDetail(sellerId);
      setSellerDetail(detail);
      setEditSellerName(detail.user.name);
      setEditSellerUsername(detail.user.username);
      setEditingSeller(false);
      setSellerUpdateMessage(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al cargar el vendedor';
      setSellerDetailError(message);
    } finally {
      setSellerDetailLoading(false);
    }
  };

  const closeSellerDetail = () => {
    setSelectedSellerId(null);
    setSellerDetail(null);
    setSellerDetailError(null);
    setNewSellerPassword('');
    setConfirmSellerPassword('');
    setPasswordUpdateMessage(null);
    setEditingSeller(false);
    setSellerUpdateMessage(null);
  };

  const inputClass =
    'w-full bg-[var(--paper)] border border-[var(--surface-border)] rounded-[5px] px-3 py-2 text-xs text-[var(--color-text)] placeholder:text-[var(--color-text-faint)] focus:outline-none focus:border-[var(--color-accent)]';
  const btnPrimary = 'btn-primary py-2 px-3 disabled:opacity-50 w-full sm:w-auto';
  const btnGhost = 'btn-secondary px-2.5 py-1 shrink-0';
  const sectionClass = 'paper-card p-3 w-full';
  const listItemClass =
    'bg-[var(--paper)] border border-[var(--surface-border)] rounded-[5px] px-2.5 py-2 text-[11px] text-[var(--ink-soft)]';
  const msgClass = (ok: boolean) =>
    `text-[10px] font-mono ${ok ? 'text-[var(--color-ok)]' : 'text-[var(--color-danger)]'}`;

  const filteredRepartidores = useMemo(() => {
    const q = repartidorSearch.trim().toLowerCase();
    if (!q) return repartidores;
    return repartidores.filter(
      (r) => r.name.toLowerCase().includes(q) || r.username.toLowerCase().includes(q)
    );
  }, [repartidores, repartidorSearch]);

  useEffect(() => {
    setRepartidoresLimit(REPARTIDORES_PAGE_SIZE);
  }, [repartidorSearch]);

  const visibleRepartidores = useMemo(
    () => filteredRepartidores.slice(0, repartidoresLimit),
    [filteredRepartidores, repartidoresLimit]
  );

  const hasMoreRepartidores = visibleRepartidores.length < filteredRepartidores.length;
  const canCollapseRepartidores = repartidoresLimit > REPARTIDORES_PAGE_SIZE;

  const repsWithZone = useMemo(
    () => repartidores.filter((r) => r.deliveryZone).length,
    [repartidores]
  );

  return (
    <div className="w-full bg-[var(--surface-bg)] pb-6">
      <header className="sticky top-0 z-20 shrink-0 flex items-center justify-between gap-3 py-2 border-b border-[var(--surface-border)] bg-[var(--surface-bg)]">
        <div className="min-w-0">
          <h2 className="text-sm font-display font-bold tracking-[-0.02em] text-[var(--color-text)] flex items-center gap-2">
            <Settings className="w-4 h-4 text-[var(--color-accent)] shrink-0" />
            Configuración
          </h2>
          <p className="mono-label mt-0.5 truncate">
            {user.name} · {userRole === UserRole.SUPER_ADMIN ? 'Super Admin' : userRole}
          </p>
        </div>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className={`${btnGhost} flex items-center gap-1.5`}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Volver
          </button>
        )}
      </header>

      {agency && onUpdateDeparture && (
        <section className={`${sectionClass} !p-2.5 mt-3`}>
          <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-[5px] bg-[var(--route)]/10 flex items-center justify-center shrink-0">
                <Warehouse className="w-3.5 h-3.5 text-[var(--route)]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-display font-semibold text-[var(--color-text)]">Punto de salida</p>
                <p className="text-[10px] text-[var(--color-text-muted)] truncate">
                  {departurePoint ? departurePoint.address : 'Sin definir'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowDepartureForm(!showDepartureForm)}
                className={btnGhost}
              >
                {showDepartureForm ? 'Cerrar' : 'Editar'}
              </button>
            </div>
            {showDepartureForm && (
              <form
                className="mt-3 space-y-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setDepartureLoading(true);
                  setDepartureMessage(null);
                  try {
                    const located = await geocodeAddress(departureAddress);
                    await onUpdateDeparture({
                      address: departureAddress,
                      lat: located.lat,
                      lng: located.lng,
                    });
                    setDepartureLat(located.lat);
                    setDepartureLng(located.lng);
                    setDepartureMessage('Punto de salida actualizado.');
                    setShowDepartureForm(false);
                  } catch (err: unknown) {
                    const message = err instanceof Error ? err.message : 'Error al guardar.';
                    setDepartureMessage(message);
                  } finally {
                    setDepartureLoading(false);
                  }
                }}
              >
                <input
                  required
                  value={departureAddress}
                  onChange={(e) => setDepartureAddress(e.target.value)}
                  placeholder="Dirección del depósito / hub"
                  className={inputClass}
                />
                <div className="flex flex-wrap gap-1">
                  {DIRECTORY_PRESETS.slice(0, 3).map((preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => applyDeparturePreset(preset)}
                      className="text-[9px] px-2 py-1 rounded-[5px] bg-[var(--paper-3)] border border-[var(--surface-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                    >
                      {preset.name.split('(')[0].trim()}
                    </button>
                  ))}
                </div>
                <button
                  type="submit"
                  disabled={departureLoading}
                  className={`w-full sm:w-auto ${btnPrimary}`}
                >
                  {departureLoading ? 'Guardando...' : 'Guardar punto de salida'}
                </button>
                {departureMessage && (
                  <p
                    className={`text-[10px] font-mono ${
                      departureMessage.includes('actualizado') ? 'text-[var(--color-ok)]' : 'text-[var(--color-danger)]'
                    }`}
                  >
                    {departureMessage}
                  </p>
                )}
              </form>
            )}
        </section>
      )}


      {agency && (onCreateSeller || onCreateRepartidor || onDeleteRepartidor || onCreateDeliveryZone) && (
        <section className="paper-card p-0 flex flex-col mt-3 w-full">
            <div className="shrink-0 px-3 py-2 border-b border-[var(--surface-border)] bg-[var(--paper)]/40 flex flex-wrap items-center justify-between gap-2">
              <span className="mono-label">Flota y cobertura</span>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] font-mono text-[var(--color-text-muted)]">
                <span>{sellers.length} vendedor{sellers.length !== 1 ? 'es' : ''}</span>
                <span>{deliveryZones.length} zonas</span>
                <span>{repartidores.length} repartidores</span>
                <span className="text-[var(--color-accent)]">{repsWithZone} con zona</span>
              </div>
            </div>
            <div className="flex flex-col divide-y divide-[var(--surface-border)] w-full">
        {onCreateSeller && (
          <SettingsFleetColumn>
            <SettingsSectionHeader
              icon={<UserPlus className="w-3.5 h-3.5 text-[var(--route)]" />}
              accentClass="bg-[var(--route)]/10"
              title="Vendedores"
              meta={`${sellers.length} registrado${sellers.length !== 1 ? 's' : ''}`}
              action={
                !selectedSellerId ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (showSellerForm) {
                        setShowSellerForm(false);
                      } else {
                        closeSellerDetail();
                        setShowSellerForm(true);
                      }
                    }}
                    className={btnGhost}
                  >
                    {showSellerForm ? 'Cerrar' : '+ Nuevo'}
                  </button>
                ) : undefined
              }
            />

            {sellers.length > 0 && !showSellerForm && !selectedSellerId && (
              <ul className="space-y-1">
                {sellers.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => void loadSellerDetail(s.id)}
                      className={`w-full text-left text-[11px] rounded-[5px] px-2.5 py-2 border transition flex items-center justify-between gap-2 ${listItemClass} hover:border-[var(--route)]/30 hover:bg-[var(--route)]/5`}
                    >
                      <span className="min-w-0 truncate">
                        <span className="font-medium text-[var(--ink-soft)]">{s.name}</span>
                        <span className="text-[var(--color-text-muted)]"> @{s.username}</span>
                      </span>
                      <ChevronRight className="w-3.5 h-3.5 shrink-0 text-[var(--color-text-faint)]" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {selectedSellerId && !showSellerForm && (
              <div className="min-w-0">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <button
                    type="button"
                    onClick={closeSellerDetail}
                    className="flex items-center gap-1.5 text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition min-w-0"
                  >
                    <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">
                      {sellerDetail ? (
                        <>
                          <span className="font-medium text-[var(--ink-soft)]">{sellerDetail.user.name}</span>
                          <span className="text-[var(--color-text-muted)]"> @{sellerDetail.user.username}</span>
                        </>
                      ) : (
                        'Volver a vendedores'
                      )}
                    </span>
                  </button>
                  <div className="flex items-center gap-1 shrink-0">
                    {onUpdateSeller && sellerDetail && !editingSeller && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditSellerName(sellerDetail.user.name);
                          setEditSellerUsername(sellerDetail.user.username);
                          setEditingSeller(true);
                          setSellerUpdateMessage(null);
                        }}
                        className="p-1 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--ink-soft)] hover:bg-[var(--surface-panel-2)]/50"
                        title="Editar vendedor"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                    )}
                    {onDeleteSeller && sellerDetail && (
                      <button
                        type="button"
                        disabled={deletingSellerId === selectedSellerId}
                        onClick={async () => {
                          if (!selectedSellerId || !sellerDetail) return;
                          const ok = await confirm({
                            title: 'Eliminar vendedor',
                            message: `¿Eliminar a ${sellerDetail.user.name} (@${sellerDetail.user.username})?\n\nLos pedidos históricos se conservan pero quedarán sin vendedor asignado. No se puede eliminar si tiene envíos en ruta.`,
                            variant: 'danger',
                            confirmText: 'Eliminar',
                            cancelText: 'Cancelar',
                          });
                          if (!ok) return;
                          setDeletingSellerId(selectedSellerId);
                          try {
                            const result = await onDeleteSeller(selectedSellerId);
                            const extra =
                              result.unlinkedOrders > 0
                                ? ` Se desvincularon ${result.unlinkedOrders} pedido(s).`
                                : '';
                            closeSellerDetail();
                            setSellerFormMessage(`Vendedor eliminado correctamente.${extra}`);
                          } catch (err: unknown) {
                            const message = err instanceof Error ? err.message : 'Error al eliminar vendedor.';
                            setSellerUpdateMessage(message);
                          } finally {
                            setDeletingSellerId(null);
                          }
                        }}
                        className="p-1 rounded-lg text-[var(--color-danger)] hover:text-red-300 hover:bg-red-500/10 disabled:opacity-50"
                        title="Eliminar vendedor"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {sellerDetailLoading && (
                  <p className="text-[11px] text-[var(--color-text-muted)]">Cargando datos…</p>
                )}
                {sellerDetailError && (
                  <p className="text-[11px] text-[var(--color-danger)]">{sellerDetailError}</p>
                )}
                {sellerDetail && (
                  <div className="space-y-3 min-w-0">
                    {onScanMercadoLibreLabel && selectedSellerId && (
                      <SellerPickupPanel
                        compact
                        lockSellerSelection
                        sellers={sellers}
                        pickupPoints={pickupPoints}
                        initialSellerId={selectedSellerId}
                        onScanImport={onScanMercadoLibreLabel}
                      />
                    )}
                    <div className="bg-[var(--paper)] border border-[var(--surface-border)] rounded-lg p-3 space-y-2">
                      {editingSeller && onUpdateSeller ? (
                        <form
                          className="space-y-2"
                          onSubmit={async (e) => {
                            e.preventDefault();
                            if (!selectedSellerId) return;
                            setSellerUpdateLoading(true);
                            setSellerUpdateMessage(null);
                            try {
                              const updated = await onUpdateSeller(selectedSellerId, {
                                name: editSellerName,
                                username: editSellerUsername,
                              });
                              setSellerDetail((prev) =>
                                prev ? { ...prev, user: { ...prev.user, ...updated } } : prev
                              );
                              setEditingSeller(false);
                              setSellerUpdateMessage('Vendedor actualizado correctamente.');
                            } catch (err: unknown) {
                              const message =
                                err instanceof Error ? err.message : 'No se pudo actualizar el vendedor.';
                              setSellerUpdateMessage(message);
                            } finally {
                              setSellerUpdateLoading(false);
                            }
                          }}
                        >
                          <p className="text-xs font-bold text-[var(--ink-soft)] flex items-center gap-1.5">
                            <Pencil className="w-3.5 h-3.5 text-[var(--route)]" />
                            Editar vendedor
                          </p>
                          <input
                            required
                            value={editSellerName}
                            onChange={(e) => setEditSellerName(e.target.value)}
                            placeholder="Nombre del vendedor / tienda"
                            className={inputClass}
                          />
                          <input
                            required
                            value={editSellerUsername}
                            onChange={(e) => setEditSellerUsername(e.target.value)}
                            placeholder="Usuario de acceso"
                            className={inputClass}
                            autoComplete="off"
                          />
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="submit"
                              disabled={sellerUpdateLoading}
                              className={btnPrimary}
                            >
                              {sellerUpdateLoading ? 'Guardando…' : 'Guardar cambios'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingSeller(false);
                                setSellerUpdateMessage(null);
                                if (sellerDetail) {
                                  setEditSellerName(sellerDetail.user.name);
                                  setEditSellerUsername(sellerDetail.user.username);
                                }
                              }}
                              className={btnGhost}
                            >
                              Cancelar
                            </button>
                          </div>
                          {sellerUpdateMessage && (
                            <p className={msgClass(sellerUpdateMessage.includes('correctamente'))}>
                              {sellerUpdateMessage}
                            </p>
                          )}
                        </form>
                      ) : (
                        <>
                      <div>
                        <p className="mono-label">Nombre / tienda</p>
                        <p className="text-sm font-semibold text-[var(--color-text)]">{sellerDetail.user.name}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                        <div>
                          <p className="mono-label">Usuario</p>
                          <p className="text-[var(--ink-soft)]">@{sellerDetail.user.username}</p>
                        </div>
                        <div>
                          <p className="mono-label">ID</p>
                          <p className="text-[var(--color-text-muted)] font-mono truncate">{sellerDetail.user.id}</p>
                        </div>
                      </div>
                        </>
                      )}
                      <div className="grid grid-cols-4 gap-1.5 pt-1">
                        <div className="text-center rounded-lg bg-[var(--paper-3)] border border-[var(--surface-border)] py-1.5">
                          <p className="text-sm font-bold text-[var(--ink-soft)]">{sellerDetail.stats.totalOrders}</p>
                          <p className="text-[8px] text-[var(--color-text-muted)] uppercase">Total</p>
                        </div>
                        <div className="text-center rounded-lg bg-[var(--paper-3)] border border-[var(--surface-border)] py-1.5">
                          <p className="text-sm font-bold text-[var(--color-warn)]">{sellerDetail.stats.pendingOrders}</p>
                          <p className="text-[8px] text-[var(--color-text-muted)] uppercase">Pend.</p>
                        </div>
                        <div className="text-center rounded-lg bg-[var(--paper-3)] border border-[var(--surface-border)] py-1.5">
                          <p className="text-sm font-bold text-[var(--color-accent)]">{sellerDetail.stats.activeOrders}</p>
                          <p className="text-[8px] text-[var(--color-text-muted)] uppercase">Activos</p>
                        </div>
                        <div className="text-center rounded-lg bg-[var(--paper-3)] border border-[var(--surface-border)] py-1.5">
                          <p className="text-sm font-bold text-[var(--color-ok)]">{sellerDetail.stats.deliveredOrders}</p>
                          <p className="text-[8px] text-[var(--color-text-muted)] uppercase">Listos</p>
                        </div>
                      </div>
                      {sellerDetail.user.pickupPoints && sellerDetail.user.pickupPoints.length > 0 && (
                        <div className="pt-1">
                          <p className="mono-label mb-1">Puntos de colecta</p>
                          <ul className="space-y-1">
                            {sellerDetail.user.pickupPoints.map((point) => (
                              <li
                                key={point.id}
                                className="text-[10px] bg-[var(--paper-3)] border border-[var(--surface-border)] rounded-lg px-2 py-1.5"
                              >
                                <span className="font-medium text-[var(--color-ok)]">{point.label}</span>
                                <p className="text-[var(--color-text-muted)] truncate">{point.address}</p>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>

                    {onUpdateSellerPassword && (
                      <form
                        className="bg-[var(--paper)] border border-[var(--surface-border)] rounded-lg p-3 space-y-2"
                        onSubmit={async (e) => {
                          e.preventDefault();
                          if (!selectedSellerId) return;
                          if (newSellerPassword.length < 6) {
                            setPasswordUpdateMessage('La contraseña debe tener al menos 6 caracteres.');
                            return;
                          }
                          if (newSellerPassword !== confirmSellerPassword) {
                            setPasswordUpdateMessage('Las contraseñas no coinciden.');
                            return;
                          }
                          setPasswordUpdateLoading(true);
                          setPasswordUpdateMessage(null);
                          try {
                            await onUpdateSellerPassword(selectedSellerId, newSellerPassword);
                            setNewSellerPassword('');
                            setConfirmSellerPassword('');
                            setPasswordUpdateMessage('Contraseña actualizada correctamente.');
                          } catch (err: unknown) {
                            const message =
                              err instanceof Error ? err.message : 'No se pudo actualizar la contraseña.';
                            setPasswordUpdateMessage(message);
                          } finally {
                            setPasswordUpdateLoading(false);
                          }
                        }}
                      >
                        <p className="text-xs font-bold text-[var(--ink-soft)] flex items-center gap-1.5">
                          <Key className="w-3.5 h-3.5 text-[var(--route)]" />
                          Cambiar contraseña
                        </p>
                        <p className="text-[10px] text-[var(--color-text-muted)]">
                          La nueva contraseña reemplaza la actual del vendedor.
                        </p>
                        <input
                          type="password"
                          value={newSellerPassword}
                          onChange={(e) => setNewSellerPassword(e.target.value)}
                          placeholder="Nueva contraseña (mín. 6 caracteres)"
                          className={inputClass}
                          autoComplete="new-password"
                        />
                        <input
                          type="password"
                          value={confirmSellerPassword}
                          onChange={(e) => setConfirmSellerPassword(e.target.value)}
                          placeholder="Confirmar contraseña"
                          className={inputClass}
                          autoComplete="new-password"
                        />
                        <button
                          type="submit"
                          disabled={passwordUpdateLoading || !newSellerPassword || !confirmSellerPassword}
                          className={btnPrimary}
                        >
                          {passwordUpdateLoading ? 'Guardando…' : 'Actualizar contraseña'}
                        </button>
                        {passwordUpdateMessage && (
                          <p
                            className={`text-[10px] ${
                              passwordUpdateMessage.includes('correctamente')
                                ? 'text-[var(--color-ok)]'
                                : 'text-[var(--color-danger)]'
                            }`}
                          >
                            {passwordUpdateMessage}
                          </p>
                        )}
                      </form>
                    )}
                  </div>
                )}
              </div>
            )}
            {showSellerForm && (
              <form
                className="space-y-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setSellerFormLoading(true);
                  setSellerFormMessage(null);
                  try {
                    let pickupPayload: {
                      pickupLabel?: string;
                      pickupAddress?: string;
                      pickupLat?: number;
                      pickupLng?: number;
                    } = {};

                    if (sellerPickupAddress.trim()) {
                      const located = await geocodeAddress(sellerPickupAddress);
                      pickupPayload = {
                        pickupLabel: sellerPickupLabel || 'Punto de colecta',
                        pickupAddress: sellerPickupAddress,
                        pickupLat: located.lat,
                        pickupLng: located.lng,
                      };
                    }

                    const created = await onCreateSeller({
                      name: sellerName,
                      username: sellerUsername,
                      password: sellerPassword,
                      ...pickupPayload,
                    });
                    setSellerFormMessage('Vendedor creado correctamente.');
                    setSellerName('');
                    setSellerUsername('');
                    setSellerPassword('');
                    setSellerPickupLabel('');
                    setSellerPickupAddress('');
                    setShowSellerForm(false);
                    if (onFetchSellerDetail && created?.id) {
                      void loadSellerDetail(created.id);
                    }
                  } catch (err: any) {
                    setSellerFormMessage(err.message || 'Error al crear vendedor.');
                  } finally {
                    setSellerFormLoading(false);
                  }
                }}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                <input
                  required
                  value={sellerName}
                  onChange={(e) => setSellerName(e.target.value)}
                  placeholder="Nombre del vendedor / tienda"
                  className={inputClass}
                />
                <input
                  required
                  value={sellerUsername}
                  onChange={(e) => setSellerUsername(e.target.value)}
                  placeholder="Usuario (mín. 3 caracteres)"
                  className={inputClass}
                />
                <input
                  required
                  type="password"
                  value={sellerPassword}
                  onChange={(e) => setSellerPassword(e.target.value)}
                  placeholder="Contraseña (mín. 6 caracteres)"
                  className={inputClass}
                />
                </div>
                <p className="mono-label pt-1">Punto de colecta (opcional)</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  value={sellerPickupLabel}
                  onChange={(e) => setSellerPickupLabel(e.target.value)}
                  placeholder="Nombre del local / depósito"
                  className={inputClass}
                />
                <input
                  value={sellerPickupAddress}
                  onChange={(e) => setSellerPickupAddress(e.target.value)}
                  placeholder="Dirección de colecta"
                  className={inputClass}
                />
                </div>
                <button
                  type="submit"
                  disabled={sellerFormLoading}
                  className={btnPrimary}
                >
                  {sellerFormLoading ? 'Creando...' : 'Crear vendedor'}
                </button>
                {sellerFormMessage && (
                  <p
                    className={`text-[10px] font-mono ${
                      sellerFormMessage.includes('correctamente') ? 'text-[var(--color-ok)]' : 'text-[var(--color-danger)]'
                    }`}
                  >
                    {sellerFormMessage}
                  </p>
                )}
              </form>
            )}
          </SettingsFleetColumn>
        )}

        {agency && onCreateDeliveryZone && (
          <SettingsFleetColumn>
            <SettingsSectionHeader
              icon={<Layers className="w-3.5 h-3.5 text-[var(--color-accent)]" />}
              title="Zonas de entrega"
              meta={`${deliveryZones.length} zona${deliveryZones.length !== 1 ? 's' : ''} · por barrio`}
              action={
                <button
                  type="button"
                  onClick={() => {
                    setShowZoneForm(!showZoneForm);
                    setEditingZoneId(null);
                    setZoneName('');
                    setSelectedBarrios([]);
                    setBarrioSearch('');
                    setZoneColor(ZONE_COLOR_PRESETS[deliveryZones.length % ZONE_COLOR_PRESETS.length]);
                    setZoneFormMessage(null);
                  }}
                  className={btnGhost}
                >
                  {showZoneForm ? 'Cerrar' : '+ Nueva'}
                </button>
              }
            />

            {deliveryZones.length > 0 && !showZoneForm && (
              <ul className="space-y-1">
                {deliveryZones.map((zone) => (
                  <li
                    key={zone.id}
                    className="group flex items-center gap-2 rounded-[5px] border border-[var(--surface-border)] bg-[var(--paper)] px-2 py-1.5 hover:border-[var(--color-accent)]/25 transition-colors"
                    style={{ boxShadow: `inset 3px 0 0 ${zone.color}` }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-medium text-[var(--ink-soft)] truncate">{zone.name}</p>
                      {zone.barrios?.length ? (
                        <p className="text-[9px] text-[var(--color-text-muted)] truncate">
                          {barrioNames(barrios, zone.barrios)}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                        {onUpdateDeliveryZone && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingZoneId(zone.id);
                              setZoneName(zone.name);
                              setZoneColor(zone.color);
                              setSelectedBarrios(zone.barrios ?? []);
                              setBarrioSearch('');
                              setShowZoneForm(true);
                              setZoneFormMessage(null);
                            }}
                            className="text-[var(--color-accent)] hover:opacity-80"
                            title="Editar zona"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {onDeleteDeliveryZone && (
                          <button
                            type="button"
                            disabled={deletingZoneId === zone.id}
                            onClick={async () => {
                              const ok = await confirm({
                                title: 'Eliminar zona',
                                message: `¿Eliminar la zona "${zone.name}"?\n\nLos repartidores asignados deben reasignarse antes.`,
                                variant: 'danger',
                                confirmText: 'Eliminar',
                                cancelText: 'Cancelar',
                              });
                              if (!ok) return;
                              setDeletingZoneId(zone.id);
                              setZoneFormMessage(null);
                              try {
                                await onDeleteDeliveryZone(zone.id);
                                setZoneFormMessage('Zona eliminada correctamente.');
                              } catch (err: unknown) {
                                const message = err instanceof Error ? err.message : 'Error al eliminar zona.';
                                setZoneFormMessage(message);
                              } finally {
                                setDeletingZoneId(null);
                              }
                            }}
                            className="text-[var(--color-danger)] hover:text-red-300 disabled:opacity-50"
                            title="Eliminar zona"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {zoneFormMessage && !showZoneForm && (
              <p
                className={`mt-3 text-[10px] font-mono ${
                  zoneFormMessage.includes('correctamente') ? 'text-[var(--color-ok)]' : 'text-[var(--color-danger)]'
                }`}
              >
                {zoneFormMessage}
              </p>
            )}

            {showZoneForm && (
              <form
                className="space-y-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (selectedBarrios.length === 0) {
                    setZoneFormMessage('Seleccioná al menos un barrio.');
                    return;
                  }
                  setZoneFormLoading(true);
                  setZoneFormMessage(null);
                  const payload = {
                    name: zoneName.trim() || undefined,
                    color: zoneColor,
                    barrios: selectedBarrios,
                  };
                  try {
                    if (editingZoneId && onUpdateDeliveryZone) {
                      await onUpdateDeliveryZone(editingZoneId, payload);
                      setZoneFormMessage('Zona actualizada correctamente.');
                    } else {
                      await onCreateDeliveryZone(payload);
                      setZoneFormMessage('Zona creada correctamente.');
                    }
                    setShowZoneForm(false);
                    setEditingZoneId(null);
                    setZoneName('');
                    setSelectedBarrios([]);
                    setBarrioSearch('');
                  } catch (err: unknown) {
                    const message = err instanceof Error ? err.message : 'Error al guardar la zona.';
                    setZoneFormMessage(message);
                  } finally {
                    setZoneFormLoading(false);
                  }
                }}
              >
                <input
                  value={zoneName}
                  onChange={(e) => setZoneName(e.target.value)}
                  placeholder="Nombre de la zona (opcional, se arma con los barrios)"
                  className={inputClass}
                />
                <div className="flex flex-wrap gap-1.5">
                  {ZONE_COLOR_PRESETS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setZoneColor(color)}
                      className={`w-6 h-6 rounded-full border-2 ${zoneColor === color ? 'border-white scale-110' : 'border-transparent'}`}
                      style={{ backgroundColor: color }}
                      title={color}
                    />
                  ))}
                </div>
                <p className="mono-label pt-0.5">Barrios incluidos</p>
                {selectedBarrios.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {selectedBarrios.map((id) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setSelectedBarrios((prev) => prev.filter((b) => b !== id))}
                        className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[var(--color-accent)]/15 text-[var(--color-accent)] border border-[var(--color-accent)]/30"
                      >
                        {barrioNames(barrios, [id])} ×
                      </button>
                    ))}
                  </div>
                )}
                <input
                  value={barrioSearch}
                  onChange={(e) => setBarrioSearch(e.target.value)}
                  placeholder="Buscar barrio..."
                  className={inputClass}
                />
                <div className="max-h-48 xl:max-h-56 overflow-y-auto border border-[var(--surface-border)] rounded-[5px] p-1.5 grid grid-cols-1 sm:grid-cols-2 gap-0.5 scrollbar-thin">
                  {barrios
                    .filter((b) => {
                      const q = barrioSearch.trim().toLowerCase();
                      if (!q) return true;
                      return b.name.toLowerCase().includes(q) || b.area.toLowerCase().includes(q);
                    })
                    .map((barrio) => {
                      const checked = selectedBarrios.includes(barrio.id);
                      return (
                        <label
                          key={barrio.id}
                          className={`flex items-center gap-2 px-1.5 py-1 rounded cursor-pointer text-[11px] ${
                            checked ? 'bg-[var(--color-accent)]/10' : 'hover:bg-[var(--paper)]'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setSelectedBarrios((prev) =>
                                checked ? prev.filter((id) => id !== barrio.id) : [...prev, barrio.id]
                              );
                            }}
                            className="accent-[var(--color-accent)]"
                          />
                          <span className="text-[var(--ink-soft)]">{barrio.name}</span>
                          <span className="text-[var(--color-text-muted)] text-[9px] font-mono ml-auto">{barrio.area}</span>
                        </label>
                      );
                    })}
                </div>
                <p className="text-[9px] text-[var(--color-text-muted)] leading-normal">
                  Elegí uno o más barrios. Las coordenadas del área se calculan automáticamente.
                </p>
                <button
                  type="submit"
                  disabled={zoneFormLoading || selectedBarrios.length === 0}
                  className={btnPrimary}
                >
                  {zoneFormLoading ? 'Guardando...' : editingZoneId ? 'Guardar cambios' : 'Crear zona'}
                </button>
                {zoneFormMessage && (
                  <p
                    className={`text-[10px] font-mono ${
                      zoneFormMessage.includes('correctamente') ? 'text-[var(--color-ok)]' : 'text-[var(--color-danger)]'
                    }`}
                  >
                    {zoneFormMessage}
                  </p>
                )}
              </form>
            )}
          </SettingsFleetColumn>
        )}

        {(onCreateRepartidor || onDeleteRepartidor) && (
          <SettingsFleetColumn>
            <SettingsSectionHeader
              emoji="🏍️"
              title="Repartidores"
              meta={`${repartidores.length} activos · ${repsWithZone} con zona`}
              action={
                onCreateRepartidor ? (
                  <button
                    type="button"
                    onClick={() => setShowRepartidorForm(!showRepartidorForm)}
                    className={btnGhost}
                  >
                    {showRepartidorForm ? 'Cerrar' : '+ Nuevo'}
                  </button>
                ) : undefined
              }
            />
            {repartidores.length > 0 && !showRepartidorForm && (
              <>
                <div className="relative shrink-0 mb-2">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[var(--color-text-faint)]" />
                  <input
                    value={repartidorSearch}
                    onChange={(e) => setRepartidorSearch(e.target.value)}
                    placeholder="Buscar por nombre o usuario…"
                    className={`${inputClass} !pl-7 !py-1.5`}
                  />
                </div>
                <div className="rounded-[5px] border border-[var(--surface-border)]">
                  <table className="settings-fleet-table w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-[var(--surface-border)]">
                        <th className="mono-label px-2.5 py-1.5 font-normal text-left">Repartidor</th>
                        <th className="mono-label px-2 py-1.5 font-normal text-left w-[10rem]">Zona</th>
                        <th className="w-9" />
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRepartidores.map((rep) => {
                        const zone = getDeliveryZone(deliveryZones, rep.deliveryZone);
                        return (
                          <tr
                            key={rep.id}
                            className="border-b border-[var(--surface-border)]/50 hover:bg-[var(--paper)]/60 transition-colors"
                          >
                            <td className="px-2.5 py-1.5">
                              <p className="text-[11px] font-medium text-[var(--ink-soft)] truncate">
                                {rep.name}
                              </p>
                              <p className="text-[9px] text-[var(--color-text-muted)] font-mono truncate">
                                @{rep.username}
                              </p>
                            </td>
                            <td className="px-2 py-1.5">
                              {onUpdateRepartidorZone ? (
                                <select
                                  value={rep.deliveryZone ?? ''}
                                  disabled={updatingZoneId === rep.id}
                                  onChange={async (e) => {
                                    const z = e.target.value || null;
                                    setUpdatingZoneId(rep.id);
                                    try {
                                      await onUpdateRepartidorZone(rep.id, z);
                                    } catch (err: unknown) {
                                      const message =
                                        err instanceof Error ? err.message : 'No se pudo actualizar la zona.';
                                      void showAlert({ title: 'Error', message, variant: 'error' });
                                    } finally {
                                      setUpdatingZoneId(null);
                                    }
                                  }}
                                  className="w-full bg-[var(--paper)] border rounded-[5px] px-1.5 py-1 text-[10px] text-[var(--ink-soft)] focus:outline-none focus:border-[var(--color-accent)]"
                                  style={{
                                    borderColor: zone ? `${zone.color}66` : 'var(--surface-border)',
                                  }}
                                >
                                  <option value="">Sin zona</option>
                                  {deliveryZones.map((z) => (
                                    <option key={z.id} value={z.id}>
                                      {z.name}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <span className="text-[10px] text-[var(--color-text-muted)]">
                                  {zoneLabel(deliveryZones, rep.deliveryZone)}
                                </span>
                              )}
                            </td>
                            <td className="px-1 py-1.5 text-center">
                              {onDeleteRepartidor && (
                                <button
                                  type="button"
                                  disabled={deletingRepartidorId === rep.id}
                                  onClick={async () => {
                                    const ok = await confirm({
                                      title: 'Eliminar repartidor',
                                      message: `¿Eliminar a ${rep.name} (@${rep.username})?\n\nLos viajes en curso se marcarán como entregados automáticamente.`,
                                      variant: 'danger',
                                      confirmText: 'Eliminar',
                                      cancelText: 'Cancelar',
                                    });
                                    if (!ok) return;
                                    setDeletingRepartidorId(rep.id);
                                    setRepartidorFormMessage(null);
                                    try {
                                      const result = await onDeleteRepartidor(rep.id);
                                      const extra =
                                        result.finalizedOrders > 0
                                          ? ` Se finalizaron ${result.finalizedOrders} viaje(s).`
                                          : '';
                                      setRepartidorFormMessage(`Repartidor eliminado correctamente.${extra}`);
                                    } catch (err: unknown) {
                                      const message =
                                        err instanceof Error ? err.message : 'Error al eliminar repartidor.';
                                      setRepartidorFormMessage(message);
                                    } finally {
                                      setDeletingRepartidorId(null);
                                    }
                                  }}
                                  className="text-[var(--color-danger)] hover:text-red-300 disabled:opacity-50 p-1"
                                  title="Eliminar"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {filteredRepartidores.length === 0 && (
                    <p className="text-[10px] text-[var(--color-text-muted)] text-center py-4 font-mono">
                      Sin resultados para &quot;{repartidorSearch}&quot;
                    </p>
                  )}
                </div>
                {(hasMoreRepartidores || canCollapseRepartidores) && (
                  <div className="flex flex-wrap justify-center gap-2 mt-2">
                    {hasMoreRepartidores && (
                      <button
                        type="button"
                        onClick={() =>
                          setRepartidoresLimit((prev) =>
                            Math.min(prev + REPARTIDORES_PAGE_SIZE, filteredRepartidores.length)
                          )
                        }
                        className={`${btnGhost} flex items-center gap-1`}
                      >
                        <ChevronDown className="w-3.5 h-3.5" />
                        Ver más ({filteredRepartidores.length - visibleRepartidores.length} restantes)
                      </button>
                    )}
                    {canCollapseRepartidores && (
                      <button
                        type="button"
                        onClick={() => setRepartidoresLimit(REPARTIDORES_PAGE_SIZE)}
                        className={btnGhost}
                      >
                        Ver menos
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
            {repartidorFormMessage && !showRepartidorForm && (
              <p
                className={`mt-3 text-[10px] font-mono ${
                  repartidorFormMessage.includes('correctamente') ? 'text-[var(--color-ok)]' : 'text-[var(--color-danger)]'
                }`}
              >
                {repartidorFormMessage}
              </p>
            )}
            {showRepartidorForm && onCreateRepartidor && (
              <form
                className="space-y-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setRepartidorFormLoading(true);
                  setRepartidorFormMessage(null);
                  try {
                    await onCreateRepartidor({
                      name: repartidorName,
                      username: repartidorUsername,
                      password: repartidorPassword,
                      deliveryZone: repartidorZone || null,
                    });
                    setRepartidorFormMessage('Repartidor creado correctamente.');
                    setRepartidorName('');
                    setRepartidorUsername('');
                    setRepartidorPassword('');
                    setRepartidorZone('');
                  } catch (err: any) {
                    setRepartidorFormMessage(err.message || 'Error al crear repartidor.');
                  } finally {
                    setRepartidorFormLoading(false);
                  }
                }}
              >
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  required
                  value={repartidorName}
                  onChange={(e) => setRepartidorName(e.target.value)}
                  placeholder="Nombre del repartidor"
                  className={inputClass}
                />
                <input
                  required
                  value={repartidorUsername}
                  onChange={(e) => setRepartidorUsername(e.target.value)}
                  placeholder="Usuario (mín. 3 caracteres)"
                  className={inputClass}
                />
                <input
                  required
                  type="password"
                  value={repartidorPassword}
                  onChange={(e) => setRepartidorPassword(e.target.value)}
                  placeholder="Contraseña (mín. 6 caracteres)"
                  className={inputClass}
                />
                </div>
                <select
                  value={repartidorZone}
                  onChange={(e) => setRepartidorZone(e.target.value)}
                  className={inputClass}
                >
                  <option value="">Zona de entrega (opcional)</option>
                  {deliveryZones.map((zone) => (
                    <option key={zone.id} value={zone.id}>
                      {zone.name}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  disabled={repartidorFormLoading}
                  className={btnPrimary}
                >
                  {repartidorFormLoading ? 'Creando...' : 'Crear repartidor'}
                </button>
                {repartidorFormMessage && (
                  <p
                    className={`text-[10px] font-mono ${
                      repartidorFormMessage.includes('correctamente') ? 'text-[var(--color-ok)]' : 'text-[var(--color-danger)]'
                    }`}
                  >
                    {repartidorFormMessage}
                  </p>
                )}
              </form>
            )}
          </SettingsFleetColumn>
        )}
            </div>
        </section>
      )}


      <div className="flex flex-col gap-3 w-full mt-3">
        {agency && onUpdateAgencyMarketplaceProfile && (
          <section className={sectionClass}>
            <SettingsSectionHeader
              emoji="🌐"
              title="Perfil marketplace"
              meta="Servicios y presencia online para vendedores"
            />
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="mono-label block mb-1">Ciudad</label>
                  <input
                    type="text"
                    value={profileCity}
                    onChange={(e) => setProfileCity(e.target.value)}
                    placeholder="Ej: Córdoba"
                    className="w-full bg-[var(--paper)] border border-[var(--surface-border)] rounded px-2.5 py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label className="mono-label block mb-1">Provincia</label>
                  <input
                    type="text"
                    value={profileProvince}
                    onChange={(e) => setProfileProvince(e.target.value)}
                    placeholder="Ej: Córdoba"
                    className="w-full bg-[var(--paper)] border border-[var(--surface-border)] rounded px-2.5 py-1.5 text-xs"
                  />
                </div>
              </div>
              <div>
                <label className="mono-label block mb-1">Sitio web</label>
                <input
                  type="url"
                  value={profileWebsite}
                  onChange={(e) => setProfileWebsite(e.target.value)}
                  placeholder="https://tuagencia.com"
                  className="w-full bg-[var(--paper)] border border-[var(--surface-border)] rounded px-2.5 py-1.5 text-xs"
                />
              </div>
              <div>
                <label className="mono-label block mb-1">Instagram</label>
                <input
                  type="text"
                  value={profileInstagram}
                  onChange={(e) => setProfileInstagram(e.target.value)}
                  placeholder="@tuagencia"
                  className="w-full bg-[var(--paper)] border border-[var(--surface-border)] rounded px-2.5 py-1.5 text-xs"
                />
              </div>
              <div>
                <p className="mono-label mb-2">Servicios de envío</p>
                <div className="flex flex-wrap gap-3">
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input type="checkbox" checked={profileSameDay} onChange={(e) => setProfileSameDay(e.target.checked)} />
                    Envío en el día
                  </label>
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input type="checkbox" checked={profileTurbo} onChange={(e) => setProfileTurbo(e.target.checked)} />
                    Envío turbo
                  </label>
                </div>
                <input
                  type="text"
                  value={profileCustomLabel}
                  onChange={(e) => setProfileCustomLabel(e.target.value)}
                  placeholder="Servicio personalizado (opcional)"
                  className="w-full mt-2 bg-[var(--paper)] border border-[var(--surface-border)] rounded px-2.5 py-1.5 text-xs"
                />
              </div>
              <button
                type="button"
                disabled={profileSaving}
                className={btnPrimary}
                onClick={() => {
                  void (async () => {
                    setProfileSaving(true);
                    try {
                      const services: AgencyShippingService[] = [];
                      if (profileSameDay) services.push({ type: 'same_day' });
                      if (profileTurbo) services.push({ type: 'turbo' });
                      if (profileCustomLabel.trim()) {
                        services.push({ type: 'custom', label: profileCustomLabel.trim() });
                      }
                      await onUpdateAgencyMarketplaceProfile({
                        website: profileWebsite.trim() || null,
                        instagram: profileInstagram.trim() || null,
                        city: profileCity.trim() || null,
                        province: profileProvince.trim() || null,
                        shippingServices: services,
                      });
                      void onRefreshMarketplaceAgencies?.();
                      void showAlert({
                        title: 'Perfil guardado',
                        message: 'Tu agencia ya aparece en el marketplace.',
                        variant: 'success',
                      });
                    } catch (err: unknown) {
                      void showAlert({
                        title: 'Error',
                        message: err instanceof Error ? err.message : 'No se pudo guardar',
                        variant: 'error',
                      });
                    } finally {
                      setProfileSaving(false);
                    }
                  })();
                }}
              >
                {profileSaving ? 'Guardando…' : 'Guardar perfil marketplace'}
              </button>
            </div>
          </section>
        )}
        {agency && onConnectMercadoLibreCourier && (
          <section className={sectionClass}>
            <SettingsSectionHeader
              emoji="📦"
              title="Mercado Libre Flex"
              meta="Modo de operación y conexión con ML"
            />
            {onUpdateAgencyMlFlexMode && (
              <div className="space-y-2 mb-4">
                <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed">
                  Elegí cómo se registran los escaneos en Mercado Libre Flex:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {(
                    [
                      {
                        id: 'agency' as MlFlexMode,
                        title: 'Mensajería en ML',
                        desc: 'Una cuenta de mensajería para toda la agencia.',
                      },
                      {
                        id: 'repartidor' as MlFlexMode,
                        title: 'Repartidores independientes',
                        desc: 'Cada repartidor conecta su cuenta ML en su perfil.',
                      },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      disabled={mlFlexModeSaving}
                      onClick={() => {
                        if (opt.id === mlFlexMode) return;
                        void (async () => {
                          setMlFlexModeSaving(true);
                          try {
                            await onUpdateAgencyMlFlexMode(opt.id);
                          } catch (err: unknown) {
                            void showAlert({
                              title: 'Error',
                              message: err instanceof Error ? err.message : 'No se pudo guardar',
                              variant: 'error',
                            });
                          } finally {
                            setMlFlexModeSaving(false);
                          }
                        })();
                      }}
                      className={`text-left p-3 rounded-lg border transition ${
                        mlFlexMode === opt.id
                          ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/10'
                          : 'border-[var(--surface-border)] bg-[var(--paper)] hover:border-[var(--color-text-faint)]'
                      }`}
                    >
                      <p className="text-[11px] font-bold text-[var(--color-text)]">{opt.title}</p>
                      <p className="text-[10px] text-[var(--color-text-muted)] mt-1 leading-relaxed">{opt.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {mlFlexMode === 'repartidor' ? (
              <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed">
                Cada repartidor debe conectar su cuenta de Mercado Libre Flex desde su perfil en la app o web.
              </p>
            ) : agencyCourierStatusLoading ? (
              <p className="text-[11px] text-[var(--color-text-muted)]">Consultando conexión…</p>
            ) : !agencyCourierStatus?.configured ? (
              <p className="text-[11px] text-[var(--color-warn)]">
                Mercado Libre no está configurado en el servidor (ML_APP_ID / ML_APP_SECRET).
              </p>
            ) : agencyCourierStatus.connected ? (
              <div className="space-y-2">
                <p className="text-[11px] text-[var(--color-ok)]">
                  Conectado como{' '}
                  <span className="font-mono">
                    {agencyCourierStatus.account?.nickname ?? 'mensajería ML'}
                  </span>
                </p>
                <p className="text-[10px] text-[var(--color-text-faint)] leading-relaxed">
                  Usá la cuenta de negocio de tu mensajería registrada en Mercado Libre Flex.
                </p>
                {onDisconnectMercadoLibreCourier && (
                  <button
                    type="button"
                    className={btnGhost}
                    onClick={() => {
                      void (async () => {
                        try {
                          await onDisconnectMercadoLibreCourier();
                          await onRefreshAgencyCourierStatus?.();
                        } catch (err: unknown) {
                          void showAlert({
                            title: 'Error',
                            message: err instanceof Error ? err.message : 'No se pudo desconectar',
                            variant: 'error',
                          });
                        }
                      })();
                    }}
                  >
                    Desconectar
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed">
                  Conectá la cuenta de mensajería de tu agencia para que cada escaneo se informe a
                  Mercado Libre Flex automáticamente.
                </p>
                <button
                  type="button"
                  className={btnPrimary}
                  onClick={() => {
                    void (async () => {
                      try {
                        await onConnectMercadoLibreCourier();
                      } catch (err: unknown) {
                        void showAlert({
                          title: 'Error',
                          message: err instanceof Error ? err.message : 'No se pudo conectar',
                          variant: 'error',
                        });
                      }
                    })();
                  }}
                >
                  Conectar mensajería ML
                </button>
              </div>
            )}
          </section>
        )}
        {userRole === UserRole.STORE_ADMIN && isMarketplaceSeller && onUpdateSellerPreferredAgency && (
          <section className={sectionClass}>
            <SettingsSectionHeader
              icon={<Building2 className="w-4 h-4 text-[var(--color-accent)]" />}
              title="Elegir agencia de logística"
              meta={
                user.preferredAgencyName
                  ? `Agencia actual: ${user.preferredAgencyName}`
                  : 'Seleccioná quién enviará tus pedidos'
              }
            />
            <AgencyMarketplacePanel
              agencies={marketplaceAgencies}
              selectedAgencyId={user.preferredAgencyId}
              loading={marketplaceAgenciesLoading}
              onSelectAgency={onUpdateSellerPreferredAgency}
            />
          </section>
        )}
        {userRole === UserRole.STORE_ADMIN && !isMarketplaceSeller && (
          <section className={sectionClass}>
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-8 h-8 rounded-[5px] bg-[var(--color-accent)]/10 flex items-center justify-center shrink-0">
                <Building2 className="w-4 h-4 text-[var(--color-accent)]" />
              </div>
              <div className="flex-1 min-w-[12rem]">
                <p className="text-xs font-display font-semibold text-[var(--color-text)]">Agencia de logística</p>
                <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                  {user.agencyName ?? (user.agencyId ? 'Agencia asociada' : 'Sin agencia asociada')}
                </p>
              </div>
            </div>
            <p className="text-[10px] text-[var(--color-text-faint)] font-mono mt-2 leading-relaxed">
              Tus envíos y puntos de colecta se sincronizan con esta agencia.
            </p>
          </section>
        )}
        {userRole === UserRole.STORE_ADMIN &&
          onRefreshIntegrationStatus &&
          onConnectMarketplace &&
          onDisconnectMarketplace &&
          onFetchMarketplaceShipments &&
          onImportMarketplaceShipments && (
            <MarketplaceIntegrations
              status={integrationStatus}
              statusLoading={integrationStatusLoading}
              statusError={integrationStatusError}
              onRefreshStatus={onRefreshIntegrationStatus}
              onConnect={onConnectMarketplace}
              onDisconnect={onDisconnectMarketplace}
              onFetchShipments={onFetchMarketplaceShipments}
              onImport={(platform, externalIds, options) =>
                onImportMarketplaceShipments(platform, externalIds, {
                  ...options,
                  agencyId: user.preferredAgencyId ?? undefined,
                })
              }
              importRequiresAgency={isMarketplaceSeller}
              selectedAgencyName={user.preferredAgencyName}
            />
          )}
        {userRole === UserRole.STORE_ADMIN && onCreatePickupPoint && (
          <section className={sectionClass}>
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-8 h-8 rounded-[5px] bg-[var(--color-ok)]/10 flex items-center justify-center shrink-0">
                <MapPin className="w-4 h-4 text-[var(--color-ok)]" />
              </div>
              <div className="flex-1 min-w-[10rem]">
                <p className="text-xs font-display font-semibold text-[var(--color-text)]">Puntos de colecta</p>
                <p className="mono-label">{pickupPoints.length} punto{pickupPoints.length !== 1 ? 's' : ''}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowPickupForm(!showPickupForm)}
                className={btnGhost}
              >
                {showPickupForm ? 'Cerrar' : '+ Agregar'}
              </button>
            </div>
            {pickupPoints.length > 0 && (
              <ul className="mt-2.5 grid grid-cols-1 gap-1.5 w-full">
                {pickupPoints.map((point) => (
                  <li
                    key={point.id}
                    className="bg-[var(--paper)] border border-[var(--surface-border)] rounded-lg px-2.5 py-2 text-[11px]"
                  >
                    {editingPickupId === point.id && onUpdatePickupPoint ? (
                      <form
                        className="space-y-2"
                        onSubmit={async (e) => {
                          e.preventDefault();
                          setEditPickupLoading(true);
                          try {
                            const located = await geocodeAddress(editPickupAddress);
                            await onUpdatePickupPoint(point.id, {
                              label: editPickupLabel || 'Punto de colecta',
                              address: editPickupAddress,
                              lat: located.lat,
                              lng: located.lng,
                            });
                            cancelEditPickup();
                          } catch (err: unknown) {
                            const message =
                              err instanceof Error ? err.message : 'No se pudo actualizar el punto';
                            void showAlert({ title: 'Error', message, variant: 'error' });
                          } finally {
                            setEditPickupLoading(false);
                          }
                        }}
                      >
                        <p className="text-[9px] font-bold uppercase text-[var(--color-ok)] tracking-wider">
                          Editando punto de colecta
                        </p>
                        <input
                          value={editPickupLabel}
                          onChange={(e) => setEditPickupLabel(e.target.value)}
                          placeholder="Nombre (ej: Depósito, Local)"
                          className={inputClass}
                        />
                        <input
                          required
                          value={editPickupAddress}
                          onChange={(e) => setEditPickupAddress(e.target.value)}
                          placeholder="Dirección de colecta"
                          className={inputClass}
                        />
                        <div className="flex flex-wrap gap-1">
                          {DIRECTORY_PRESETS.slice(0, 3).map((preset) => (
                            <button
                              key={preset.name}
                              type="button"
                              onClick={() => applyEditPickupPreset(preset)}
                              className="text-[9px] px-2 py-1 rounded-[5px] bg-[var(--paper-3)] border border-[var(--surface-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                            >
                              {preset.name.split('(')[0].trim()}
                            </button>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={cancelEditPickup}
                            className="flex-1 btn-secondary py-2"
                          >
                            Cancelar
                          </button>
                          <button
                            type="submit"
                            disabled={editPickupLoading}
                            className={`${btnPrimary}`}
                          >
                            {editPickupLoading ? 'Guardando...' : 'Guardar cambios'}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="font-bold text-[var(--color-ok)]">{point.label}</span>
                          <p className="text-[var(--color-text-muted)] mt-0.5">📍 {point.address}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {onUpdatePickupPoint && (
                            <button
                              type="button"
                              onClick={() => startEditPickup(point)}
                              className="text-[var(--color-text-muted)] hover:text-[var(--color-ok)] p-1"
                              title="Editar"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                          )}
                          {onDeletePickupPoint && (
                            <button
                              type="button"
                              onClick={() => onDeletePickupPoint(point.id)}
                              className="text-[var(--color-danger)] hover:text-red-300 p-1"
                              title="Eliminar"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {showPickupForm && (
              <form
                className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setPickupLoading(true);
                  try {
                    const located = await geocodeAddress(pickupAddress);
                    await onCreatePickupPoint({
                      label: pickupLabel || 'Punto de colecta',
                      address: pickupAddress,
                      lat: located.lat,
                      lng: located.lng,
                    });
                    setPickupLabel('');
                    setPickupAddress('');
                    setPickupLat(-34.58);
                    setPickupLng(-58.4);
                    setShowPickupForm(false);
                  } catch (err: unknown) {
                    const message = err instanceof Error ? err.message : 'No se pudo crear el punto de colecta';
                    void showAlert({ title: 'Error', message, variant: 'error' });
                  } finally {
                    setPickupLoading(false);
                  }
                }}
              >
                <input
                  value={pickupLabel}
                  onChange={(e) => setPickupLabel(e.target.value)}
                  placeholder="Nombre (ej: Depósito, Local)"
                  className={inputClass}
                />
                <input
                  required
                  value={pickupAddress}
                  onChange={(e) => setPickupAddress(e.target.value)}
                  placeholder="Dirección de colecta"
                  className={inputClass}
                />
                <div className="sm:col-span-2 flex flex-wrap gap-1">
                  {DIRECTORY_PRESETS.slice(0, 3).map((preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => applyPickupPreset(preset)}
                      className="text-[9px] px-2 py-1 rounded-lg bg-[var(--paper-3)] border border-[var(--surface-border)] text-[var(--color-text-muted)] hover:text-[var(--ink-soft)]"
                    >
                      {preset.name.split('(')[0].trim()}
                    </button>
                  ))}
                </div>
                <button
                  type="submit"
                  disabled={pickupLoading}
                  className={`sm:col-span-2 ${btnPrimary}`}
                >
                  {pickupLoading ? 'Guardando...' : 'Guardar punto de colecta'}
                </button>
              </form>
            )}
          </section>
        )}
        </div>
    </div>
  );
}
