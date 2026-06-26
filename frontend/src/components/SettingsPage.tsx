/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { User, UserRole, LocationPoint, PickupPoint, isAgencyAdmin } from '../types.js';
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
} from 'lucide-react';

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
  }) => Promise<void>;
  onCreateRepartidor?: (data: { username: string; password: string; name: string }) => Promise<void>;
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
  onCreateRepartidor,
  onDeleteRepartidor,
  onCreatePickupPoint,
  onUpdatePickupPoint,
  onDeletePickupPoint,
  onTriggerSimulatorTick,
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

  const [showRepartidorForm, setShowRepartidorForm] = useState(false);
  const [repartidorName, setRepartidorName] = useState('');
  const [repartidorUsername, setRepartidorUsername] = useState('');
  const [repartidorPassword, setRepartidorPassword] = useState('');
  const [repartidorFormLoading, setRepartidorFormLoading] = useState(false);
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

  const inputClass =
    'w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-blue-500/50';
  const btnPrimary = (color: 'indigo' | 'purple' | 'sky' | 'emerald') => {
    const map = {
      indigo: 'bg-indigo-600 hover:bg-indigo-500',
      purple: 'bg-purple-600 hover:bg-purple-500',
      sky: 'bg-sky-600 hover:bg-sky-500',
      emerald: 'bg-emerald-600 hover:bg-emerald-500',
    };
    return `py-2 px-3 rounded-lg text-white text-[10px] font-bold uppercase disabled:opacity-50 ${map[color]}`;
  };
  const btnGhost =
    'px-2.5 py-1 rounded-lg border text-[10px] font-bold uppercase shrink-0 transition';

  return (
    <div className="h-full flex flex-col min-h-0">
      <header className="shrink-0 flex items-center justify-between gap-3 pb-3 border-b border-zinc-800">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
            <Settings className="w-4 h-4 text-zinc-400 shrink-0" />
            Configuración
          </h2>
          <p className="text-[10px] text-zinc-500 mt-0.5 truncate">
            {user.name} · {userRole === UserRole.SUPER_ADMIN ? 'Super Admin' : userRole}
          </p>
        </div>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className={`${btnGhost} flex items-center gap-1.5 border-zinc-700 bg-zinc-950 text-zinc-300 hover:text-zinc-100 hover:border-zinc-500`}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Volver
          </button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto mt-3 pr-1 scrollbar-thin scrollbar-thumb-zinc-800">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 pb-2 auto-rows-min">
        {agency && onUpdateDeparture && (
          <section className={`bg-indigo-950/20 border border-indigo-900/30 rounded-xl p-3 lg:col-span-2 ${showDepartureForm ? 'xl:col-span-2' : ''}`}>
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/15 flex items-center justify-center shrink-0">
                <Warehouse className="w-4 h-4 text-indigo-300" />
              </div>
              <div className="flex-1 min-w-[12rem]">
                <p className="text-xs font-bold text-indigo-200">Punto de salida</p>
                <p className="text-[10px] text-zinc-400 mt-0.5 truncate">
                  {departurePoint ? departurePoint.address : 'Sin definir — configurá el depósito de la agencia'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowDepartureForm(!showDepartureForm)}
                className={`${btnGhost} border-indigo-500/30 bg-indigo-600/15 text-indigo-200 hover:bg-indigo-600/25`}
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
                      className="text-[9px] px-2 py-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200"
                    >
                      {preset.name.split('(')[0].trim()}
                    </button>
                  ))}
                </div>
                <button
                  type="submit"
                  disabled={departureLoading}
                  className={`w-full sm:w-auto ${btnPrimary('indigo')}`}
                >
                  {departureLoading ? 'Guardando...' : 'Guardar punto de salida'}
                </button>
                {departureMessage && (
                  <p
                    className={`text-[10px] font-mono ${
                      departureMessage.includes('actualizado') ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    {departureMessage}
                  </p>
                )}
              </form>
            )}
          </section>
        )}

        {agency && onCreateSeller && (
          <section
            className={`bg-purple-950/20 border border-purple-900/30 rounded-xl p-3 flex flex-col min-h-0 ${
              showSellerForm ? 'lg:col-span-2' : ''
            }`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-purple-500/15 flex items-center justify-center shrink-0">
                <UserPlus className="w-4 h-4 text-purple-300" />
              </div>
              <div className="flex-1 min-w-[10rem]">
                <p className="text-xs font-bold text-purple-200">Vendedores</p>
                <p className="text-[10px] text-zinc-500">{sellers.length} registrado{sellers.length !== 1 ? 's' : ''}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowSellerForm(!showSellerForm)}
                className={`${btnGhost} border-purple-500/30 bg-purple-600/15 text-purple-200 hover:bg-purple-600/25`}
              >
                {showSellerForm ? 'Cerrar' : '+ Nuevo'}
              </button>
            </div>
            {sellers.length > 0 && !showSellerForm && (
              <ul className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {sellers.map((s) => (
                  <li
                    key={s.id}
                    className="text-[11px] bg-zinc-950/60 border border-zinc-800 rounded-lg px-2.5 py-2 text-zinc-300 truncate"
                  >
                    <span className="font-medium text-zinc-200">{s.name}</span>
                    <span className="text-zinc-500"> @{s.username}</span>
                  </li>
                ))}
              </ul>
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

                    await onCreateSeller({
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
                <p className="text-[9px] text-zinc-500 uppercase tracking-wide pt-1">Punto de colecta (opcional)</p>
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
                  className={btnPrimary('purple')}
                >
                  {sellerFormLoading ? 'Creando...' : 'Crear vendedor'}
                </button>
                {sellerFormMessage && (
                  <p
                    className={`text-[10px] font-mono ${
                      sellerFormMessage.includes('correctamente') ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    {sellerFormMessage}
                  </p>
                )}
              </form>
            )}
          </section>
        )}

        {agency && (onCreateRepartidor || onDeleteRepartidor) && (
          <section
            className={`bg-sky-950/20 border border-sky-900/30 rounded-xl p-3 flex flex-col min-h-0 ${
              showRepartidorForm ? 'lg:col-span-2' : ''
            }`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-sky-500/15 flex items-center justify-center shrink-0 text-lg leading-none">
                🏍️
              </div>
              <div className="flex-1 min-w-[10rem]">
                <p className="text-xs font-bold text-sky-200">Repartidores</p>
                <p className="text-[10px] text-zinc-500">{repartidores.length} activo{repartidores.length !== 1 ? 's' : ''}</p>
              </div>
              {onCreateRepartidor && (
                <button
                  type="button"
                  onClick={() => setShowRepartidorForm(!showRepartidorForm)}
                  className={`${btnGhost} border-sky-500/30 bg-sky-600/15 text-sky-200 hover:bg-sky-600/25`}
                >
                  {showRepartidorForm ? 'Cerrar' : '+ Nuevo'}
                </button>
              )}
            </div>
            {repartidores.length > 0 && !showRepartidorForm && (
              <ul className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {repartidores.map((rep) => (
                  <li
                    key={rep.id}
                    className="flex items-center justify-between gap-2 text-[11px] bg-zinc-950/60 border border-zinc-800 rounded-lg px-2.5 py-2 text-zinc-300"
                  >
                    <span className="truncate min-w-0">
                      <span className="font-medium text-zinc-200">{rep.name}</span>
                      <span className="text-zinc-500"> @{rep.username}</span>
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
                        className="text-red-400 hover:text-red-300 shrink-0 disabled:opacity-50"
                        title="Eliminar repartidor"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {repartidorFormMessage && !showRepartidorForm && (
              <p
                className={`mt-3 text-[10px] font-mono ${
                  repartidorFormMessage.includes('correctamente') ? 'text-emerald-400' : 'text-red-400'
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
                    });
                    setRepartidorFormMessage('Repartidor creado correctamente.');
                    setRepartidorName('');
                    setRepartidorUsername('');
                    setRepartidorPassword('');
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
                <button
                  type="submit"
                  disabled={repartidorFormLoading}
                  className={btnPrimary('sky')}
                >
                  {repartidorFormLoading ? 'Creando...' : 'Crear repartidor'}
                </button>
                {repartidorFormMessage && (
                  <p
                    className={`text-[10px] font-mono ${
                      repartidorFormMessage.includes('correctamente') ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    {repartidorFormMessage}
                  </p>
                )}
              </form>
            )}
          </section>
        )}

        {agency && onTriggerSimulatorTick && (
          <section className="bg-zinc-950/80 border border-zinc-800 rounded-xl p-3 lg:col-span-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4 text-amber-500" />
              </div>
              <div className="flex-1 min-w-[10rem]">
                <p className="text-xs font-bold text-zinc-200">Simulador GPS</p>
                <p className="text-[10px] text-zinc-500">Demo — mueve la flota en el mapa</p>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={onTriggerSimulatorTick}
                  className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800 transition"
                  title="Avanzar paso manual"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsSimulating(!isSimulating)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg font-bold text-[10px] uppercase tracking-wider transition ${
                    isSimulating
                      ? 'bg-amber-500 text-zinc-950 hover:bg-amber-400'
                      : 'bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800'
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
            className={`bg-emerald-950/20 border border-emerald-900/30 rounded-xl p-3 lg:col-span-2 ${
              showPickupForm || editingPickupId ? 'xl:col-span-2' : ''
            }`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center shrink-0">
                <MapPin className="w-4 h-4 text-emerald-300" />
              </div>
              <div className="flex-1 min-w-[10rem]">
                <p className="text-xs font-bold text-emerald-200">Puntos de colecta</p>
                <p className="text-[10px] text-zinc-500">{pickupPoints.length} punto{pickupPoints.length !== 1 ? 's' : ''}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowPickupForm(!showPickupForm)}
                className={`${btnGhost} border-emerald-500/30 bg-emerald-600/15 text-emerald-200 hover:bg-emerald-600/25`}
              >
                {showPickupForm ? 'Cerrar' : '+ Agregar'}
              </button>
            </div>
            {pickupPoints.length > 0 && (
              <ul className="mt-2.5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-1.5">
                {pickupPoints.map((point) => (
                  <li
                    key={point.id}
                    className="bg-zinc-950/60 border border-zinc-800 rounded-lg px-2.5 py-2 text-[11px]"
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
                        <p className="text-[9px] font-bold uppercase text-emerald-400 tracking-wider">
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
                              className="text-[9px] px-2 py-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200"
                            >
                              {preset.name.split('(')[0].trim()}
                            </button>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={cancelEditPickup}
                            className={`flex-1 py-2 border border-zinc-700 text-zinc-400 text-[10px] font-bold uppercase rounded-lg hover:bg-zinc-900`}
                          >
                            Cancelar
                          </button>
                          <button
                            type="submit"
                            disabled={editPickupLoading}
                            className={`flex-1 ${btnPrimary('emerald')}`}
                          >
                            {editPickupLoading ? 'Guardando...' : 'Guardar cambios'}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="font-bold text-emerald-300">{point.label}</span>
                          <p className="text-zinc-400 mt-0.5">📍 {point.address}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {onUpdatePickupPoint && (
                            <button
                              type="button"
                              onClick={() => startEditPickup(point)}
                              className="text-zinc-400 hover:text-emerald-300 p-1"
                              title="Editar"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                          )}
                          {onDeletePickupPoint && (
                            <button
                              type="button"
                              onClick={() => onDeletePickupPoint(point.id)}
                              className="text-red-400 hover:text-red-300 p-1"
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
                      className="text-[9px] px-2 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200"
                    >
                      {preset.name.split('(')[0].trim()}
                    </button>
                  ))}
                </div>
                <button
                  type="submit"
                  disabled={pickupLoading}
                  className={`sm:col-span-2 w-full sm:w-auto ${btnPrimary('emerald')}`}
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
