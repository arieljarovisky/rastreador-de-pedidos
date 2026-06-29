/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { User, UserRole, LocationPoint, PickupPoint, isAgencyAdmin, SellerDetail } from '../types.js';
import { geocodeAddress } from '../utils/geocode.js';
import { useModal } from '../context/ModalContext.tsx';
import {
  Warehouse,
  Sparkles,
  RefreshCw,
  Play,
  Pause,
  UserPlus,
  MapPin,
  Trash2,
  Settings,
  ArrowLeft,
  Pencil,
  ChevronRight,
  Key,
  Building2,
} from 'lucide-react';
import MarketplaceIntegrations from './MarketplaceIntegrations.tsx';
import SellerPickupPanel from './SellerPickupPanel.tsx';
import type { MercadoLibreScanImportResult } from './MercadoLibreLabelScanner.tsx';
import { DELIVERY_ZONES, zoneLabel, getDeliveryZone } from '../config/deliveryZones.js';
import type { MarketplaceIntegrationStatus, MarketplaceShipmentPreview } from '../types.js';

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
  onTriggerSimulatorTick?: () => Promise<void>;
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
    options?: { dateFrom?: string; dateTo?: string }
  ) => Promise<{ imported: number; skipped: number; errors?: string[] }>;
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
  onTriggerSimulatorTick,
  integrationStatus = null,
  integrationStatusLoading = false,
  integrationStatusError = null,
  onRefreshIntegrationStatus,
  onConnectMarketplace,
  onDisconnectMarketplace,
  onFetchMarketplaceShipments,
  onImportMarketplaceShipments,
  onScanMercadoLibreLabel,
}: SettingsPageProps) {
  const userRole = user.role;
  const agency = isAgencyAdmin(userRole);
  const { confirm, alert: showAlert } = useModal();

  const [isSimulating, setIsSimulating] = useState(false);
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

  useEffect(() => {
    if (!isSimulating || !onTriggerSimulatorTick) return;
    const interval = window.setInterval(() => onTriggerSimulatorTick(), 3000);
    return () => clearInterval(interval);
  }, [isSimulating, onTriggerSimulatorTick]);

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
  const sectionClass = 'paper-card p-3';
  const listItemClass =
    'bg-[var(--paper)] border border-[var(--surface-border)] rounded-[5px] px-2.5 py-2 text-[11px] text-[var(--ink-soft)]';
  const msgClass = (ok: boolean) =>
    `text-[10px] font-mono ${ok ? 'text-[var(--color-ok)]' : 'text-[var(--color-danger)]'}`;

  return (
    <div className="h-full flex flex-col min-h-0 bg-[var(--surface-bg)]">
      <header className="shrink-0 flex items-center justify-between gap-2 sm:gap-3 pb-2 sm:pb-3 border-b border-[var(--surface-border)] px-0.5">
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

      <div className="flex-1 overflow-y-auto mt-2 sm:mt-3 pr-0.5 sm:pr-1 scrollbar-thin min-h-0">
        <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-2 sm:gap-3 pb-2 auto-rows-min max-w-[1600px]">
        {userRole === UserRole.STORE_ADMIN && (
          <section className={`${sectionClass} lg:col-span-2 2xl:col-span-3`}>
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
              onImport={onImportMarketplaceShipments}
            />
          )}
        {agency && onUpdateDeparture && (
          <section className={`${sectionClass} lg:col-span-2 2xl:col-span-3 ${showDepartureForm ? 'xl:col-span-2' : ''}`}>
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-8 h-8 rounded-[5px] bg-[var(--route)]/10 flex items-center justify-center shrink-0">
                <Warehouse className="w-4 h-4 text-[var(--route)]" />
              </div>
              <div className="flex-1 min-w-[12rem]">
                <p className="text-xs font-display font-semibold text-[var(--color-text)]">Punto de salida</p>
                <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5 truncate">
                  {departurePoint ? departurePoint.address : 'Sin definir — configurá el depósito de la agencia'}
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

        {agency && (onCreateSeller || onCreateRepartidor || onDeleteRepartidor) && (
          <div className="lg:col-span-2 2xl:col-span-3 grid grid-cols-1 lg:grid-cols-2 gap-3 items-start min-w-0">
        {onCreateSeller && (
          <section className={`${sectionClass} flex flex-col min-h-0 min-w-0`}>
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-8 h-8 rounded-[5px] bg-[var(--route)]/10 flex items-center justify-center shrink-0">
                <UserPlus className="w-4 h-4 text-[var(--route)]" />
              </div>
              <div className="flex-1 min-w-[10rem]">
                <p className="text-xs font-display font-semibold text-[var(--color-text)]">Vendedores</p>
                <p className="mono-label">{sellers.length} registrado{sellers.length !== 1 ? 's' : ''}</p>
              </div>
              {!selectedSellerId && (
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
              )}
            </div>

            {sellers.length > 0 && !showSellerForm && !selectedSellerId && (
              <ul className="mt-2.5 space-y-1.5">
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
              <div className="mt-2.5 min-w-0">
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
                className="mt-3 space-y-2"
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
          </section>
        )}

        {(onCreateRepartidor || onDeleteRepartidor) && (
          <section className={`${sectionClass} flex flex-col min-h-0 min-w-0`}>
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-8 h-8 rounded-[5px] bg-[var(--color-accent)]/10 flex items-center justify-center shrink-0 text-lg leading-none">
                🏍️
              </div>
              <div className="flex-1 min-w-[10rem]">
                <p className="text-xs font-display font-semibold text-[var(--color-text)]">Repartidores</p>
                <p className="mono-label">{repartidores.length} activo{repartidores.length !== 1 ? 's' : ''} · asigná una zona por repartidor</p>
              </div>
              {onCreateRepartidor && (
                <button
                  type="button"
                  onClick={() => setShowRepartidorForm(!showRepartidorForm)}
                  className={btnGhost}
                >
                  {showRepartidorForm ? 'Cerrar' : '+ Nuevo'}
                </button>
              )}
            </div>
            {repartidores.length > 0 && !showRepartidorForm && (
              <ul className="mt-2.5 space-y-1.5 max-h-[min(70vh,42rem)] overflow-y-auto pr-1 scrollbar-thin">
                {repartidores.map((rep) => (
                  <li
                    key={rep.id}
                    className={`flex flex-col gap-2 ${listItemClass}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate min-w-0">
                        <span className="font-medium text-[var(--ink-soft)]">{rep.name}</span>
                        <span className="text-[var(--color-text-muted)]"> @{rep.username}</span>
                      </span>
                      {onDeleteRepartidor && (
                        <button
                          type="button"
                          disabled={deletingRepartidorId === rep.id}
                          onClick={async () => {
                            const ok = await confirm({
                              title: 'Eliminar repartidor',
                              message: `¿Eliminar a ${rep.name} (@${rep.username})?\n\nLos viajes en curso se marcarán como entregados automáticamente. Esta acción no se puede deshacer.`,
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
                                  ? ` Se finalizaron ${result.finalizedOrders} viaje(s) en curso.`
                                  : '';
                              setRepartidorFormMessage(`Repartidor eliminado correctamente.${extra}`);
                            } catch (err: unknown) {
                              const message = err instanceof Error ? err.message : 'Error al eliminar repartidor.';
                              setRepartidorFormMessage(message);
                            } finally {
                              setDeletingRepartidorId(null);
                            }
                          }}
                          className="text-[var(--color-danger)] hover:text-red-300 shrink-0 disabled:opacity-50"
                          title="Eliminar repartidor"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    {onUpdateRepartidorZone && (
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-3 h-3 text-[var(--color-accent)] shrink-0" />
                        <select
                          value={rep.deliveryZone ?? ''}
                          disabled={updatingZoneId === rep.id}
                          onChange={async (e) => {
                            const zone = e.target.value || null;
                            setUpdatingZoneId(rep.id);
                            try {
                              await onUpdateRepartidorZone(rep.id, zone);
                            } catch (err: unknown) {
                              const message = err instanceof Error ? err.message : 'No se pudo actualizar la zona.';
                              void showAlert({ title: 'Error', message, variant: 'error' });
                            } finally {
                              setUpdatingZoneId(null);
                            }
                          }}
                          className="flex-1 min-w-0 bg-[var(--paper)] border border-[var(--surface-border)] rounded-[5px] px-1.5 py-1 text-[10px] text-[var(--ink-soft)] focus:outline-none focus:border-[var(--color-accent)]"
                        >
                          <option value="">Sin zona asignada</option>
                          {DELIVERY_ZONES.map((zone) => (
                            <option key={zone.id} value={zone.id}>
                              {zone.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    {rep.deliveryZone && (
                      <span
                        className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded w-fit"
                        style={{
                          color: getDeliveryZone(rep.deliveryZone)?.color ?? '#64748b',
                          backgroundColor: `${getDeliveryZone(rep.deliveryZone)?.color ?? '#64748b'}18`,
                          border: `1px solid ${getDeliveryZone(rep.deliveryZone)?.color ?? '#64748b'}40`,
                        }}
                      >
                        {zoneLabel(rep.deliveryZone)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
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
                className="mt-3 space-y-2"
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
                  {DELIVERY_ZONES.map((zone) => (
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
          </section>
        )}
          </div>
        )}

        {agency && onTriggerSimulatorTick && (
          <section className={`${sectionClass} lg:col-span-2 2xl:col-span-3`}>
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-8 h-8 rounded-[5px] bg-[var(--color-warn)]/10 flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4 text-[var(--color-warn)]" />
              </div>
              <div className="flex-1 min-w-[10rem]">
                <p className="text-xs font-display font-semibold text-[var(--color-text)]">Simulador GPS</p>
                <p className="mono-label">Demo — mueve la flota en el mapa</p>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={onTriggerSimulatorTick}
                  className="p-2 rounded-[5px] bg-[var(--paper-3)] border border-[var(--surface-border)] text-[var(--ink-soft)] hover:bg-[var(--surface-panel-2)] transition"
                  title="Avanzar paso manual"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsSimulating(!isSimulating)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-[5px] font-mono font-bold text-[10px] uppercase tracking-wider transition ${
                    isSimulating
                      ? 'bg-[var(--color-warn)] text-[var(--paper)] hover:brightness-110'
                      : 'btn-secondary'
                  }`}
                >
                  {isSimulating ? (
                    <>
                      <Pause className="w-3.5 h-3.5" /> Pausar
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5" /> Autoplay
                    </>
                  )}
                </button>
              </div>
            </div>
          </section>
        )}

        {userRole === UserRole.STORE_ADMIN && onCreatePickupPoint && (
          <section
            className={`${sectionClass} lg:col-span-2 2xl:col-span-3 ${
              showPickupForm || editingPickupId ? 'xl:col-span-2' : ''
            }`}
          >
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
              <ul className="mt-2.5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-1.5">
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
    </div>
  );
}
