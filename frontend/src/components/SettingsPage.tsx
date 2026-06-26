/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { User, UserRole, LocationPoint, PickupPoint, isAgencyAdmin } from '../types.js';
import { geocodeAddress } from '../utils/geocode.js';
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
  onDeletePickupPoint,
  onTriggerSimulatorTick,
}: SettingsPageProps) {
  const userRole = user.role;
  const agency = isAgencyAdmin(userRole);

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

  return (
    <div className="h-full overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-zinc-800">
      <div className="max-w-2xl mx-auto space-y-4 pb-6">
        <div className="border-b border-zinc-800 pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm lg:text-base font-bold text-zinc-100 flex items-center gap-2">
                <Settings className="w-4 h-4 text-zinc-400" />
                Configuración
              </h2>
              <p className="text-[10px] text-zinc-500 font-mono mt-1 uppercase tracking-wider">
                {user.name} · {userRole === UserRole.SUPER_ADMIN ? 'Super Admin' : userRole}
              </p>
            </div>
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-zinc-700 bg-zinc-950 text-zinc-300 hover:text-zinc-100 hover:border-zinc-500 text-[10px] font-bold uppercase shrink-0"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Volver al panel
              </button>
            )}
          </div>
        </div>

        {agency && onUpdateDeparture && (
          <section className="bg-indigo-950/20 border border-indigo-900/30 rounded-lg p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-bold text-indigo-300 flex items-center gap-1.5">
                  <Warehouse className="w-4 h-4" /> Punto de salida de la agencia
                </p>
                <p className="text-[10px] text-zinc-500 font-mono mt-1">
                  {departurePoint
                    ? `📍 ${departurePoint.address}`
                    : 'Definí desde dónde salen los repartidores'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowDepartureForm(!showDepartureForm)}
                className="px-2.5 py-1 rounded bg-indigo-600/20 border border-indigo-500/30 text-indigo-200 text-[10px] font-bold uppercase"
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
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-xs text-zinc-200"
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
                  className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold uppercase rounded disabled:opacity-50"
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
          <section className="bg-purple-950/20 border border-purple-900/30 rounded-lg p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-bold text-purple-300 flex items-center gap-1.5">
                  <UserPlus className="w-4 h-4" /> Vendedores de tu agencia
                </p>
                <p className="text-[10px] text-zinc-500 font-mono mt-1">
                  Creá cuentas para tus vendedores ({sellers.length} registrados)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowSellerForm(!showSellerForm)}
                className="px-2.5 py-1 rounded bg-purple-600/20 border border-purple-500/30 text-purple-200 text-[10px] font-bold uppercase"
              >
                {showSellerForm ? 'Cerrar' : '+ Nuevo'}
              </button>
            </div>
            {sellers.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {sellers.map((s) => (
                  <li
                    key={s.id}
                    className="text-[11px] bg-zinc-950/60 border border-zinc-800 rounded px-3 py-2 text-zinc-300 font-mono"
                  >
                    🛒 {s.name} <span className="text-zinc-500">@{s.username}</span>
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
                <input
                  required
                  value={sellerName}
                  onChange={(e) => setSellerName(e.target.value)}
                  placeholder="Nombre del vendedor / tienda"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-xs text-zinc-200"
                />
                <input
                  required
                  value={sellerUsername}
                  onChange={(e) => setSellerUsername(e.target.value)}
                  placeholder="Usuario (mín. 3 caracteres)"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-xs text-zinc-200"
                />
                <input
                  required
                  type="password"
                  value={sellerPassword}
                  onChange={(e) => setSellerPassword(e.target.value)}
                  placeholder="Contraseña (mín. 6 caracteres)"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-xs text-zinc-200"
                />
                <p className="text-[9px] text-zinc-500 font-mono uppercase">Punto de colecta (opcional)</p>
                <input
                  value={sellerPickupLabel}
                  onChange={(e) => setSellerPickupLabel(e.target.value)}
                  placeholder="Nombre del local / depósito"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-xs text-zinc-200"
                />
                <input
                  value={sellerPickupAddress}
                  onChange={(e) => setSellerPickupAddress(e.target.value)}
                  placeholder="Dirección de colecta"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-xs text-zinc-200"
                />
                <button
                  type="submit"
                  disabled={sellerFormLoading}
                  className="w-full py-2 bg-purple-600 hover:bg-purple-500 text-white text-[10px] font-bold uppercase rounded disabled:opacity-50"
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
          <section className="bg-sky-950/20 border border-sky-900/30 rounded-lg p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-bold text-sky-300 flex items-center gap-1.5">
                  🏍️ Repartidores de tu flota
                </p>
                <p className="text-[10px] text-zinc-500 font-mono mt-1">
                  Creá cuentas para quienes entregan los envíos ({repartidores.length} activos)
                </p>
              </div>
              {onCreateRepartidor && (
                <button
                  type="button"
                  onClick={() => setShowRepartidorForm(!showRepartidorForm)}
                  className="px-2.5 py-1 rounded bg-sky-600/20 border border-sky-500/30 text-sky-200 text-[10px] font-bold uppercase"
                >
                  {showRepartidorForm ? 'Cerrar' : '+ Nuevo'}
                </button>
              )}
            </div>
            {repartidores.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {repartidores.map((rep) => (
                  <li
                    key={rep.id}
                    className="flex items-center justify-between gap-2 text-[11px] bg-zinc-950/60 border border-zinc-800 rounded px-3 py-2 text-zinc-300 font-mono"
                  >
                    <span>
                      🏍️ {rep.name} <span className="text-zinc-500">@{rep.username}</span>
                    </span>
                    {onDeleteRepartidor && (
                      <button
                        type="button"
                        disabled={deletingRepartidorId === rep.id}
                        onClick={async () => {
                          if (
                            !window.confirm(
                              `¿Eliminar a ${rep.name} (@${rep.username})?\n\nLos viajes en curso se marcarán como entregados automáticamente. Esta acción no se puede deshacer.`
                            )
                          ) {
                            return;
                          }
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
                <input
                  required
                  value={repartidorName}
                  onChange={(e) => setRepartidorName(e.target.value)}
                  placeholder="Nombre del repartidor"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-xs text-zinc-200"
                />
                <input
                  required
                  value={repartidorUsername}
                  onChange={(e) => setRepartidorUsername(e.target.value)}
                  placeholder="Usuario (mín. 3 caracteres)"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-xs text-zinc-200"
                />
                <input
                  required
                  type="password"
                  value={repartidorPassword}
                  onChange={(e) => setRepartidorPassword(e.target.value)}
                  placeholder="Contraseña (mín. 6 caracteres)"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-xs text-zinc-200"
                />
                <button
                  type="submit"
                  disabled={repartidorFormLoading}
                  className="w-full py-2 bg-sky-600 hover:bg-sky-500 text-white text-[10px] font-bold uppercase rounded disabled:opacity-50"
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
          <section className="bg-zinc-950 border border-zinc-800 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-zinc-200 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-amber-500" /> Simulador GPS (demo)
                </p>
                <p className="text-[10px] text-zinc-500 font-mono mt-1">Mueve dinámicamente la flota en el mapa</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onTriggerSimulatorTick}
                  className="p-2 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800 transition"
                  title="Avanzar paso manual"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsSimulating(!isSimulating)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded font-bold text-[10px] uppercase tracking-wider transition ${
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
          <section className="bg-emerald-950/20 border border-emerald-900/30 rounded-lg p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                  <MapPin className="w-4 h-4" /> Puntos de colecta
                </p>
                <p className="text-[10px] text-zinc-500 font-mono mt-1">
                  Direcciones donde la logística retira tus envíos
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPickupForm(!showPickupForm)}
                className="px-2.5 py-1 rounded bg-emerald-600/20 border border-emerald-500/30 text-emerald-200 text-[10px] font-bold uppercase"
              >
                {showPickupForm ? 'Cerrar' : '+ Agregar'}
              </button>
            </div>
            {pickupPoints.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {pickupPoints.map((point) => (
                  <li
                    key={point.id}
                    className="flex items-start justify-between gap-2 bg-zinc-950/60 border border-zinc-800 rounded px-3 py-2 text-[11px]"
                  >
                    <div>
                      <span className="font-bold text-emerald-300">{point.label}</span>
                      <p className="text-zinc-400 mt-0.5">📍 {point.address}</p>
                    </div>
                    {onDeletePickupPoint && (
                      <button
                        type="button"
                        onClick={() => onDeletePickupPoint(point.id)}
                        className="text-red-400 hover:text-red-300 shrink-0"
                        title="Eliminar"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {showPickupForm && (
              <form
                className="mt-3 space-y-2"
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
                    alert(message);
                  } finally {
                    setPickupLoading(false);
                  }
                }}
              >
                <input
                  value={pickupLabel}
                  onChange={(e) => setPickupLabel(e.target.value)}
                  placeholder="Nombre (ej: Depósito, Local)"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-xs text-zinc-200"
                />
                <input
                  required
                  value={pickupAddress}
                  onChange={(e) => setPickupAddress(e.target.value)}
                  placeholder="Dirección de colecta"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-xs text-zinc-200"
                />
                <div className="flex flex-wrap gap-1">
                  {DIRECTORY_PRESETS.slice(0, 3).map((preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => applyPickupPreset(preset)}
                      className="text-[9px] px-2 py-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200"
                    >
                      {preset.name.split('(')[0].trim()}
                    </button>
                  ))}
                </div>
                <button
                  type="submit"
                  disabled={pickupLoading}
                  className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold uppercase rounded disabled:opacity-50"
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
