/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Tags,
  Save,
  Loader2,
  Trash2,
  MapPin,
  ArrowLeftRight,
  CircleDollarSign,
  Bike,
} from 'lucide-react';
import {
  sortPricingZones,
  pricingZoneDisplayName,
  zoneShippingRates,
  zoneDriverPayRates,
  DEFAULT_ZONE_SHIPPING_RATES,
  DEFAULT_ZONE_DRIVER_PAY_RATES,
  type DeliveryZone,
} from '../config/deliveryZones.js';
import { apiUrl } from '../api.ts';
import { useModal } from '../context/ModalContext.tsx';
import type { AgencyShippingRates } from '../types.js';

const OUTSIDE_ID = '__outside__';

type RateDraft = {
  flex: string;
  express: string;
  standard: string;
  driverFlex: string;
  driverExpress: string;
  driverStandard: string;
};

interface PriceListsPageProps {
  token: string;
  deliveryZones: DeliveryZone[];
  onUpdateZoneShippingRates: (
    zoneId: string,
    rates: {
      flex: number;
      express: number;
      standard: number;
      driverFlex: number;
      driverExpress: number;
      driverStandard: number;
    }
  ) => Promise<DeliveryZone>;
  onUpdateDefaultShippingRates: (rates: {
    flex: number;
    express: number;
    standard: number;
  }) => Promise<{ flex: number; express: number; standard: number }>;
  onUpdateDefaultDriverPayRates: (rates: {
    flex: number;
    express: number;
    standard: number;
  }) => Promise<{ flex: number; express: number; standard: number }>;
  onDeleteDeliveryZone?: (zoneId: string) => Promise<void>;
}

function formatArs(amount: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(amount);
}

function parseMoney(value: string): number {
  const n = Number(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

function draftFromZone(zone: DeliveryZone): RateDraft {
  const ship = zoneShippingRates(zone);
  const driver = zoneDriverPayRates(zone);
  return {
    flex: String(ship.flex),
    express: String(ship.express),
    standard: String(ship.standard),
    driverFlex: String(driver.flex),
    driverExpress: String(driver.express),
    driverStandard: String(driver.standard),
  };
}

function draftFromDefaults(
  ship: { flex: number; express: number; standard: number },
  driver: { flex: number; express: number; standard: number }
): RateDraft {
  return {
    flex: String(ship.flex),
    express: String(ship.express),
    standard: String(ship.standard),
    driverFlex: String(driver.flex),
    driverExpress: String(driver.express),
    driverStandard: String(driver.standard),
  };
}

const inputClass =
  'w-full rounded-[5px] border border-[var(--surface-border)] bg-[var(--surface-panel)] px-2.5 py-2 text-sm font-mono text-[var(--color-text)] focus:outline-none focus:border-[var(--color-accent)]/50';

export default function PriceListsPage({
  token,
  deliveryZones,
  onUpdateZoneShippingRates,
  onUpdateDefaultShippingRates,
  onUpdateDefaultDriverPayRates,
  onDeleteDeliveryZone,
}: PriceListsPageProps) {
  const { confirm } = useModal();
  const pricingZones = useMemo(() => sortPricingZones(deliveryZones), [deliveryZones]);

  const [selectedId, setSelectedId] = useState<string>(() => pricingZones[0]?.id ?? OUTSIDE_ID);
  const [draft, setDraft] = useState<RateDraft>(() =>
    pricingZones[0]
      ? draftFromZone(pricingZones[0])
      : draftFromDefaults(DEFAULT_ZONE_SHIPPING_RATES, DEFAULT_ZONE_DRIVER_PAY_RATES)
  );
  const [defaultShip, setDefaultShip] = useState(DEFAULT_ZONE_SHIPPING_RATES);
  const [defaultDriver, setDefaultDriver] = useState(DEFAULT_ZONE_DRIVER_PAY_RATES);
  const [loadingDefaults, setLoadingDefaults] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageOk, setMessageOk] = useState(true);

  const loadDefaults = useCallback(async () => {
    setLoadingDefaults(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [shipRes, driverRes] = await Promise.all([
        fetch(apiUrl('/api/billing/rates'), { headers }),
        fetch(apiUrl('/api/driver-settlement/rates'), { headers }),
      ]);
      if (shipRes.ok) {
        const data = (await shipRes.json()) as {
          defaultRates: AgencyShippingRates;
        };
        setDefaultShip({
          flex: data.defaultRates.flex,
          express: data.defaultRates.express,
          standard: data.defaultRates.standard,
        });
      }
      if (driverRes.ok) {
        const data = (await driverRes.json()) as {
          defaultRates: AgencyShippingRates;
        };
        setDefaultDriver({
          flex: data.defaultRates.flex,
          express: data.defaultRates.express,
          standard: data.defaultRates.standard,
        });
      }
    } finally {
      setLoadingDefaults(false);
    }
  }, [token]);

  useEffect(() => {
    void loadDefaults();
  }, [loadDefaults]);

  useEffect(() => {
    if (selectedId === OUTSIDE_ID) {
      setDraft(draftFromDefaults(defaultShip, defaultDriver));
      return;
    }
    const zone = pricingZones.find((z) => z.id === selectedId);
    if (zone) {
      setDraft(draftFromZone(zone));
    } else if (pricingZones[0]) {
      setSelectedId(pricingZones[0].id);
    } else {
      setSelectedId(OUTSIDE_ID);
    }
  }, [selectedId, pricingZones, defaultShip, defaultDriver]);

  const selectedZone =
    selectedId === OUTSIDE_ID ? null : pricingZones.find((z) => z.id === selectedId) ?? null;

  const title =
    selectedId === OUTSIDE_ID
      ? 'Fuera de zona'
      : selectedZone
        ? pricingZoneDisplayName(selectedZone)
        : 'Lista';

  const subtitle =
    selectedId === OUTSIDE_ID
      ? 'Se usa cuando el destino no cae en CABA ni en ningún cordón AMBA.'
      : 'Se aplica automáticamente según la dirección de entrega del pedido.';

  const updateDraft = (patch: Partial<RateDraft>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
    setMessage(null);
  };

  const handleSave = async () => {
    const flex = parseMoney(draft.flex);
    const express = parseMoney(draft.express);
    const standard = parseMoney(draft.standard);
    const driverFlex = parseMoney(draft.driverFlex);
    const driverExpress = parseMoney(draft.driverExpress);
    const driverStandard = parseMoney(draft.driverStandard);
    if ([flex, express, standard, driverFlex, driverExpress, driverStandard].some((n) => !Number.isFinite(n) || n < 0)) {
      setMessageOk(false);
      setMessage('Revisá los montos: tienen que ser números válidos (0 o más).');
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      if (selectedId === OUTSIDE_ID) {
        const [ship, driver] = await Promise.all([
          onUpdateDefaultShippingRates({ flex, express, standard }),
          onUpdateDefaultDriverPayRates({ flex: driverFlex, express: driverExpress, standard: driverStandard }),
        ]);
        setDefaultShip({ flex: ship.flex, express: ship.express, standard: ship.standard });
        setDefaultDriver({ flex: driver.flex, express: driver.express, standard: driver.standard });
        setMessageOk(true);
        setMessage('Lista “Fuera de zona” guardada.');
      } else {
        await onUpdateZoneShippingRates(selectedId, {
          flex,
          express,
          standard,
          driverFlex,
          driverExpress,
          driverStandard,
        });
        setMessageOk(true);
        setMessage(`Lista “${title}” guardada.`);
      }
    } catch (err: unknown) {
      setMessageOk(false);
      setMessage(err instanceof Error ? err.message : 'No se pudo guardar la lista.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedZone || !onDeleteDeliveryZone) return;
    const ok = await confirm({
      title: 'Eliminar lista de precios',
      message: `¿Eliminar “${pricingZoneDisplayName(selectedZone)}”?\n\nLos destinos de esa área pasarán a usar “Fuera de zona”.`,
      variant: 'danger',
      confirmText: 'Eliminar',
      cancelText: 'Cancelar',
    });
    if (!ok) return;
    setDeleting(true);
    setMessage(null);
    try {
      await onDeleteDeliveryZone(selectedZone.id);
      setSelectedId(OUTSIDE_ID);
      setMessageOk(true);
      setMessage(`Lista “${pricingZoneDisplayName(selectedZone)}” eliminada.`);
    } catch (err: unknown) {
      setMessageOk(false);
      setMessage(err instanceof Error ? err.message : 'No se pudo eliminar.');
    } finally {
      setDeleting(false);
    }
  };

  const previewShip = {
    flex: parseMoney(draft.flex) || 0,
    express: parseMoney(draft.express) || 0,
    standard: parseMoney(draft.standard) || 0,
  };
  const previewDriver = {
    flex: parseMoney(draft.driverFlex) || 0,
    express: parseMoney(draft.driverExpress) || 0,
    standard: parseMoney(draft.driverStandard) || 0,
  };

  return (
    <div className="h-full min-h-0 flex flex-col bg-[var(--surface-bg)]">
      <header className="shrink-0 border-b border-[var(--surface-border)] bg-[var(--surface-panel)] px-4 py-3 sm:px-6">
        <div className="flex items-start gap-3 max-w-6xl mx-auto w-full">
          <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-[5px] border border-[var(--surface-border)] bg-[var(--surface-panel-2)] text-[var(--color-accent)]">
            <Tags className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-semibold text-[var(--color-text)] tracking-tight">
              Listas de precios
            </h1>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5 leading-relaxed max-w-2xl">
              Cada lista define cuánto cobrás al vendedor y cuánto le pagás al repartidor según el tipo de
              envío. La lista se elige sola por la zona del destino (CABA / cordones AMBA).
            </p>
          </div>
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-hidden">
        <div className="h-full max-w-6xl mx-auto w-full flex flex-col md:flex-row min-h-0">
          {/* Sidebar listas */}
          <aside className="md:w-64 shrink-0 border-b md:border-b-0 md:border-r border-[var(--surface-border)] bg-[var(--surface-panel)] overflow-y-auto">
            <p className="px-4 pt-3 pb-1.5 text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
              Tus listas
            </p>
            <nav className="px-2 pb-3 space-y-0.5" aria-label="Listas de precios">
              {pricingZones.map((zone) => {
                const active = selectedId === zone.id;
                const ship = zoneShippingRates(zone);
                return (
                  <button
                    key={zone.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(zone.id);
                      setMessage(null);
                    }}
                    className={`w-full text-left rounded-[5px] px-3 py-2.5 transition border ${
                      active
                        ? 'bg-[var(--color-accent)]/10 border-[var(--color-accent)]/35 text-[var(--color-text)]'
                        : 'border-transparent hover:bg-[var(--surface-panel-2)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                    }`}
                    style={active ? { boxShadow: `inset 3px 0 0 ${zone.color}` } : undefined}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ background: zone.color }}
                        aria-hidden
                      />
                      <span className="text-sm font-medium truncate">{pricingZoneDisplayName(zone)}</span>
                    </span>
                    <span className="mt-1 block text-[10px] font-mono text-[var(--color-text-muted)] pl-4">
                      Flex {formatArs(ship.flex)}
                    </span>
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => {
                  setSelectedId(OUTSIDE_ID);
                  setMessage(null);
                }}
                className={`w-full text-left rounded-[5px] px-3 py-2.5 transition border ${
                  selectedId === OUTSIDE_ID
                    ? 'bg-[var(--color-accent)]/10 border-[var(--color-accent)]/35 text-[var(--color-text)]'
                    : 'border-transparent hover:bg-[var(--surface-panel-2)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                }`}
              >
                <span className="flex items-center gap-2">
                  <MapPin className="h-3.5 w-3.5 shrink-0 opacity-70" />
                  <span className="text-sm font-medium">Fuera de zona</span>
                </span>
                <span className="mt-1 block text-[10px] font-mono text-[var(--color-text-muted)] pl-6">
                  {loadingDefaults ? '…' : `Flex ${formatArs(defaultShip.flex)}`}
                </span>
              </button>
            </nav>
          </aside>

          {/* Detalle */}
          <main className="flex-1 min-w-0 overflow-y-auto p-4 sm:p-6">
            <div className="max-w-xl space-y-5">
              <div>
                <div className="flex items-center gap-2">
                  {selectedZone ? (
                    <span
                      className="h-3 w-3 rounded-full shrink-0"
                      style={{ background: selectedZone.color }}
                    />
                  ) : null}
                  <h2 className="text-lg font-semibold text-[var(--color-text)]">{title}</h2>
                </div>
                <p className="text-xs text-[var(--color-text-muted)] mt-1 leading-relaxed">{subtitle}</p>
              </div>

              <section className="rounded-[6px] border border-[var(--surface-border)] bg-[var(--surface-panel)] overflow-hidden">
                <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-[var(--surface-border)] bg-[var(--surface-panel-2)]/50">
                  <CircleDollarSign className="h-3.5 w-3.5 text-[var(--color-accent)]" />
                  <h3 className="text-[11px] font-mono font-bold uppercase tracking-wider text-[var(--color-text)]">
                    Cobro al vendedor
                  </h3>
                </div>
                <div className="p-3.5 grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {(
                    [
                      ['flex', 'Flex', 'Mercado Libre Flex'],
                      ['express', 'Express', 'Tienda Nube Express'],
                      ['standard', 'Estándar', 'Carga manual'],
                    ] as const
                  ).map(([key, label, hint]) => (
                    <label key={key} className="flex flex-col gap-1">
                      <span className="text-[11px] font-medium text-[var(--color-text)]">{label}</span>
                      <span className="text-[9px] text-[var(--color-text-muted)] -mt-0.5">{hint}</span>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] font-mono text-[var(--color-text-muted)]">
                          $
                        </span>
                        <input
                          className={`${inputClass} pl-6`}
                          inputMode="decimal"
                          value={draft[key]}
                          onChange={(e) => updateDraft({ [key]: e.target.value })}
                        />
                      </div>
                    </label>
                  ))}
                </div>
              </section>

              <section className="rounded-[6px] border border-[var(--surface-border)] bg-[var(--surface-panel)] overflow-hidden">
                <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-[var(--surface-border)] bg-[var(--surface-panel-2)]/50">
                  <Bike className="h-3.5 w-3.5 text-[var(--stamp)]" />
                  <h3 className="text-[11px] font-mono font-bold uppercase tracking-wider text-[var(--color-text)]">
                    Pago al repartidor
                  </h3>
                </div>
                <div className="p-3.5 grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {(
                    [
                      ['driverFlex', 'Flex'],
                      ['driverExpress', 'Express'],
                      ['driverStandard', 'Estándar'],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="flex flex-col gap-1">
                      <span className="text-[11px] font-medium text-[var(--color-text)]">{label}</span>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] font-mono text-[var(--color-text-muted)]">
                          $
                        </span>
                        <input
                          className={`${inputClass} pl-6`}
                          inputMode="decimal"
                          value={draft[key]}
                          onChange={(e) => updateDraft({ [key]: e.target.value })}
                        />
                      </div>
                    </label>
                  ))}
                </div>
              </section>

              <div className="rounded-[6px] border border-dashed border-[var(--surface-border)] bg-[var(--surface-panel-2)]/30 px-3.5 py-3">
                <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-2 flex items-center gap-1.5">
                  <ArrowLeftRight className="h-3 w-3" />
                  Resumen
                </p>
                <div className="grid grid-cols-3 gap-2 text-[11px]">
                  {(['flex', 'express', 'standard'] as const).map((k) => (
                    <div key={k} className="space-y-0.5">
                      <p className="font-mono text-[9px] uppercase text-[var(--color-text-muted)]">
                        {k === 'flex' ? 'Flex' : k === 'express' ? 'Express' : 'Estándar'}
                      </p>
                      <p className="text-[var(--color-text)]">
                        Cobra {formatArs(previewShip[k])}
                      </p>
                      <p className="text-[var(--color-text-muted)]">
                        Paga {formatArs(previewDriver[k])}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={saving || loadingDefaults}
                  onClick={() => void handleSave()}
                  className="inline-flex items-center gap-1.5 rounded-[5px] bg-[var(--stamp)] text-[#F6F0E4] px-3.5 py-2 text-xs font-bold uppercase tracking-wide hover:opacity-90 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Guardar lista
                </button>
                {selectedZone && onDeleteDeliveryZone ? (
                  <button
                    type="button"
                    disabled={deleting || saving}
                    onClick={() => void handleDelete()}
                    className="inline-flex items-center gap-1.5 rounded-[5px] px-3 py-2 text-xs font-medium text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 disabled:opacity-40"
                  >
                    {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    Eliminar
                  </button>
                ) : null}
              </div>

              {message ? (
                <p
                  className={`text-xs font-mono ${
                    messageOk ? 'text-[var(--color-ok)]' : 'text-[var(--color-danger)]'
                  }`}
                  role="status"
                >
                  {message}
                </p>
              ) : null}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
