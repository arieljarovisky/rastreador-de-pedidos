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
  Plus,
  CircleDollarSign,
  Bike,
  Users,
  Search,
  ArrowRight,
  Check,
} from 'lucide-react';
import { apiUrl } from '../api.ts';
import { useModal } from '../context/ModalContext.tsx';

interface RateTrio {
  flex: number;
  express: number;
  standard: number;
}

interface ZoneRates {
  zoneKey: string;
  zoneName: string;
  shipping: RateTrio;
  driverPay: RateTrio;
}

interface PriceList {
  id: string;
  name: string;
  isDefault: boolean;
  outsideShipping: RateTrio;
  outsideDriverPay: RateTrio;
  zoneRates: ZoneRates[];
  sellerCount: number;
}

interface PriceListSummary {
  id: string;
  name: string;
  isDefault: boolean;
  sellerCount: number;
}

interface SellerAssignment {
  sellerId: string;
  sellerName: string;
  priceListId: string | null;
  priceListName: string | null;
}

type DraftTrio = { flex: string; express: string; standard: string };
type RateKey = keyof DraftTrio;

interface PriceListsPageProps {
  token: string;
}

const RATE_ROWS: { key: RateKey; label: string; hint: string }[] = [
  { key: 'flex', label: 'Flex', hint: 'Mercado Libre Flex' },
  { key: 'express', label: 'Express', hint: 'Tienda Nube Express' },
  { key: 'standard', label: 'Estándar', hint: 'Carga manual' },
];

function formatArs(amount: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(amount);
}

function trioToDraft(t: RateTrio): DraftTrio {
  return { flex: String(t.flex), express: String(t.express), standard: String(t.standard) };
}

function draftToTrio(d: DraftTrio): RateTrio | null {
  const flex = Number(String(d.flex).replace(',', '.'));
  const express = Number(String(d.express).replace(',', '.'));
  const standard = Number(String(d.standard).replace(',', '.'));
  if (![flex, express, standard].every((n) => Number.isFinite(n) && n >= 0)) return null;
  return { flex, express, standard };
}

function parseDraftAmount(value: string): number {
  const n = Number(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function zoneColor(zoneKey: string): string {
  if (zoneKey === 'zona_caba') return '#F9E04B';
  if (zoneKey === 'zona_cordon_1') return '#6BCB9A';
  if (zoneKey === 'zona_cordon_2') return '#6BA4E8';
  return '#B5E48C';
}

export default function PriceListsPage({ token }: PriceListsPageProps) {
  const { confirm } = useModal();
  const [tab, setTab] = useState<'lists' | 'sellers'>('lists');
  const [summaries, setSummaries] = useState<PriceListSummary[]>([]);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [list, setList] = useState<PriceList | null>(null);
  const [selectedZoneKey, setSelectedZoneKey] = useState<string>('zona_caba');

  const [shipDraft, setShipDraft] = useState<DraftTrio>(trioToDraft({ flex: 0, express: 0, standard: 0 }));
  const [driverDraft, setDriverDraft] = useState<DraftTrio>(trioToDraft({ flex: 0, express: 0, standard: 0 }));
  const [listName, setListName] = useState('');
  const [assignments, setAssignments] = useState<SellerAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageOk, setMessageOk] = useState(true);
  const [newListName, setNewListName] = useState('');
  const [listQuery, setListQuery] = useState('');
  const [sellerQuery, setSellerQuery] = useState('');
  const [baseline, setBaseline] = useState<{
    name: string;
    ship: DraftTrio;
    driver: DraftTrio;
  } | null>(null);

  const headers = useMemo(
    () => ({
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    }),
    [token]
  );

  const loadSummaries = useCallback(async () => {
    const res = await fetch(apiUrl('/api/price-lists'), { headers });
    if (!res.ok) throw new Error('No se pudieron cargar las listas.');
    const data = (await res.json()) as { lists: PriceListSummary[] };
    setSummaries(data.lists);
    return data.lists;
  }, [headers]);

  const loadList = useCallback(
    async (id: string) => {
      const res = await fetch(apiUrl(`/api/price-lists/${id}`), { headers });
      if (!res.ok) throw new Error('No se pudo cargar la lista.');
      const data = (await res.json()) as PriceList;
      setList(data);
      setListName(data.name);
      setSelectedListId(data.id);
      return data;
    },
    [headers]
  );

  const loadAssignments = useCallback(async () => {
    const res = await fetch(apiUrl('/api/price-lists/sellers'), { headers });
    if (!res.ok) throw new Error('No se pudieron cargar los vendedores.');
    const data = (await res.json()) as { assignments: SellerAssignment[] };
    setAssignments(data.assignments);
  }, [headers]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const lists = await loadSummaries();
        if (cancelled) return;
        const first = lists.find((l) => l.isDefault) ?? lists[0];
        if (first) await loadList(first.id);
        await loadAssignments();
      } catch (err) {
        if (!cancelled) {
          setMessageOk(false);
          setMessage(err instanceof Error ? err.message : 'Error al cargar.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadSummaries, loadList, loadAssignments]);

  useEffect(() => {
    if (!list) return;
    const zr = list.zoneRates.find((z) => z.zoneKey === selectedZoneKey);
    if (!zr) {
      const first = list.zoneRates[0];
      if (first && selectedZoneKey !== first.zoneKey) {
        setSelectedZoneKey(first.zoneKey);
      }
      return;
    }
    const ship = trioToDraft(zr.shipping);
    const driver = trioToDraft(zr.driverPay);
    setShipDraft(ship);
    setDriverDraft(driver);
    setBaseline({ name: list.name, ship, driver });
  }, [list, selectedZoneKey]);

  const zoneOptions = useMemo(() => {
    if (!list) return [];
    return list.zoneRates.map((z) => ({
      key: z.zoneKey,
      name: z.zoneName,
      color: zoneColor(z.zoneKey),
    }));
  }, [list]);

  const selectedZone = zoneOptions.find((z) => z.key === selectedZoneKey) ?? zoneOptions[0];

  const filteredSummaries = useMemo(() => {
    const q = listQuery.trim().toLowerCase();
    if (!q) return summaries;
    return summaries.filter((s) => s.name.toLowerCase().includes(q));
  }, [summaries, listQuery]);

  const filteredAssignments = useMemo(() => {
    const q = sellerQuery.trim().toLowerCase();
    if (!q) return assignments;
    return assignments.filter(
      (a) =>
        a.sellerName.toLowerCase().includes(q) ||
        (a.priceListName ?? 'lista general').toLowerCase().includes(q)
    );
  }, [assignments, sellerQuery]);

  const isDirty = useMemo(() => {
    if (!baseline || !list) return false;
    const nameChanged = !list.isDefault && listName.trim() !== baseline.name.trim();
    const shipChanged =
      shipDraft.flex !== baseline.ship.flex ||
      shipDraft.express !== baseline.ship.express ||
      shipDraft.standard !== baseline.ship.standard;
    const driverChanged =
      driverDraft.flex !== baseline.driver.flex ||
      driverDraft.express !== baseline.driver.express ||
      driverDraft.standard !== baseline.driver.standard;
    return nameChanged || shipChanged || driverChanged;
  }, [baseline, list, listName, shipDraft, driverDraft]);

  const margins = useMemo(
    () =>
      RATE_ROWS.map(({ key }) => {
        const ship = parseDraftAmount(shipDraft[key]);
        const driver = parseDraftAmount(driverDraft[key]);
        return { key, ship, driver, margin: ship - driver };
      }),
    [shipDraft, driverDraft]
  );

  const handleCreate = async () => {
    const name = newListName.trim() || `Lista ${summaries.length + 1}`;
    setCreating(true);
    setMessage(null);
    try {
      const res = await fetch(apiUrl('/api/price-lists'), {
        method: 'POST',
        headers,
        body: JSON.stringify({ name, cloneFromId: selectedListId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'No se pudo crear la lista.');
      setNewListName('');
      await loadSummaries();
      await loadList((data as PriceList).id);
      setMessageOk(true);
      setMessage(`Lista “${(data as PriceList).name}” creada. Asignala a tus vendedores.`);
      setTab('lists');
    } catch (err) {
      setMessageOk(false);
      setMessage(err instanceof Error ? err.message : 'No se pudo crear.');
    } finally {
      setCreating(false);
    }
  };

  const handleSave = async () => {
    if (!list) return;
    const shipping = draftToTrio(shipDraft);
    const driverPay = draftToTrio(driverDraft);
    if (!shipping || !driverPay) {
      setMessageOk(false);
      setMessage('Revisá los montos: tienen que ser números válidos (0 o más).');
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const body: Record<string, unknown> = {
        name: listName.trim() || list.name,
        zoneRates: [
          {
            zoneKey: selectedZoneKey,
            shipping,
            driverPay,
          },
        ],
      };
      const res = await fetch(apiUrl(`/api/price-lists/${list.id}`), {
        method: 'PUT',
        headers,
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar.');
      setList(data as PriceList);
      setListName((data as PriceList).name);
      await loadSummaries();
      setMessageOk(true);
      setMessage('Lista guardada.');
    } catch (err) {
      setMessageOk(false);
      setMessage(err instanceof Error ? err.message : 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!list || list.isDefault) return;
    const ok = await confirm({
      title: 'Eliminar lista',
      message: `¿Eliminar “${list.name}”? Los vendedores que la usaban pasan a la lista general.`,
      variant: 'danger',
      confirmText: 'Eliminar',
      cancelText: 'Cancelar',
    });
    if (!ok) return;
    setSaving(true);
    try {
      const res = await fetch(apiUrl(`/api/price-lists/${list.id}`), {
        method: 'DELETE',
        headers,
      });
      if (!res.ok && res.status !== 204) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'No se pudo eliminar.');
      }
      const lists = await loadSummaries();
      const next = lists.find((l) => l.isDefault) ?? lists[0];
      if (next) await loadList(next.id);
      else setList(null);
      await loadAssignments();
      setMessageOk(true);
      setMessage('Lista eliminada.');
    } catch (err) {
      setMessageOk(false);
      setMessage(err instanceof Error ? err.message : 'No se pudo eliminar.');
    } finally {
      setSaving(false);
    }
  };

  const handleAssign = async (sellerId: string, priceListId: string | null) => {
    setMessage(null);
    try {
      const res = await fetch(apiUrl(`/api/price-lists/sellers/${sellerId}`), {
        method: 'PUT',
        headers,
        body: JSON.stringify({ priceListId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'No se pudo asignar.');
      await loadAssignments();
      await loadSummaries();
      setMessageOk(true);
      setMessage('Asignación actualizada.');
    } catch (err) {
      setMessageOk(false);
      setMessage(err instanceof Error ? err.message : 'No se pudo asignar.');
    }
  };

  if (loading) {
    return (
      <div className="flex h-full min-h-[40vh] items-center justify-center text-[var(--color-text-muted)]">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        <span className="text-xs font-mono">Cargando listas…</span>
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 flex flex-col overflow-hidden bg-[var(--surface-bg)]" id="price-lists-page">
      <header className="shrink-0 border-b border-[var(--surface-border)] bg-[var(--surface-panel)] px-3 sm:px-4 py-3 space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
              Posta · Precios
            </p>
            <h1 className="text-lg sm:text-xl font-display font-bold text-[var(--ink-soft)] mt-0.5 flex items-center gap-2">
              <Tags className="w-5 h-5 text-[var(--color-accent)] shrink-0" />
              Listas de precios
            </h1>
            <p className="text-[11px] text-[var(--color-text-muted)] mt-1 max-w-2xl leading-relaxed">
              Definí cobro al vendedor y pago al repartidor por zona. Los vendedores sin asignación usan la{' '}
              <span className="text-[var(--ink-soft)] font-medium">Lista general</span>.
            </p>
          </div>

          {tab === 'lists' && (
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <input
                className="posta-input px-2.5 py-2 text-xs font-mono w-[10.5rem] sm:w-44"
                placeholder="Nombre de lista nueva"
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleCreate();
                }}
              />
              <button
                type="button"
                disabled={creating}
                onClick={() => void handleCreate()}
                className="btn-secondary px-3 py-2 disabled:opacity-50"
                title="Clona la lista seleccionada"
              >
                {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Nueva lista
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex p-1 rounded-[var(--radius-posta)] border border-[var(--surface-border)] bg-[var(--surface-panel-2)]/50">
            <button
              type="button"
              onClick={() => setTab('lists')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] text-[10px] font-mono font-bold uppercase tracking-wider transition ${
                tab === 'lists'
                  ? 'bg-[var(--color-accent)]/15 text-[var(--color-accent)]'
                  : 'text-[var(--color-text-muted)] hover:text-[var(--ink-soft)]'
              }`}
            >
              <CircleDollarSign className="h-3 w-3" />
              Editar listas
            </button>
            <button
              type="button"
              onClick={() => setTab('sellers')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] text-[10px] font-mono font-bold uppercase tracking-wider transition ${
                tab === 'sellers'
                  ? 'bg-[var(--color-accent)]/15 text-[var(--color-accent)]'
                  : 'text-[var(--color-text-muted)] hover:text-[var(--ink-soft)]'
              }`}
            >
              <Users className="h-3 w-3" />
              Asignar vendedores
              {assignments.length > 0 ? (
                <span className="ml-0.5 tabular-nums opacity-80">{assignments.length}</span>
              ) : null}
            </button>
          </div>

          {message ? (
            <p
              className={`text-[10px] font-mono sm:ml-auto ${
                messageOk ? 'text-[var(--color-ok)]' : 'text-[var(--color-danger)]'
              }`}
            >
              {message}
            </p>
          ) : null}
        </div>
      </header>

      {tab === 'sellers' ? (
        <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4">
          <div className="max-w-3xl mx-auto space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-end gap-3 justify-between">
              <div>
                <h2 className="text-sm font-display font-semibold text-[var(--ink-soft)] flex items-center gap-2">
                  <Users className="h-4 w-4 text-[var(--color-accent)]" />
                  Qué lista usa cada vendedor
                </h2>
                <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
                  Cambiá la asignación y se aplica al instante.
                </p>
              </div>
              <label className="relative block w-full sm:w-56">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--color-text-faint)]" />
                <input
                  className="posta-input pl-8 pr-2.5 py-2 text-xs"
                  placeholder="Buscar vendedor…"
                  value={sellerQuery}
                  onChange={(e) => setSellerQuery(e.target.value)}
                />
              </label>
            </div>

            {assignments.length === 0 ? (
              <div className="posta-empty">Todavía no hay vendedores.</div>
            ) : filteredAssignments.length === 0 ? (
              <div className="posta-empty">Ningún vendedor coincide con la búsqueda.</div>
            ) : (
              <div className="rounded-[var(--radius-posta)] border border-[var(--surface-border)] bg-[var(--surface-panel)] divide-y divide-[var(--surface-border)] overflow-hidden">
                {filteredAssignments.map((a) => (
                  <div
                    key={a.sellerId}
                    className="flex flex-col sm:flex-row sm:items-center gap-2.5 px-3.5 py-3 hover:bg-[var(--surface-panel-2)]/40 transition"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[var(--ink-soft)] truncate">{a.sellerName}</p>
                      <p className="text-[10px] font-mono text-[var(--color-text-muted)] mt-0.5">
                        Actual · {a.priceListName ?? 'Lista general'}
                      </p>
                    </div>
                    <select
                      className="posta-input px-2.5 py-2 text-xs sm:w-56"
                      value={a.priceListId ?? ''}
                      onChange={(e) =>
                        void handleAssign(a.sellerId, e.target.value ? e.target.value : null)
                      }
                    >
                      <option value="">Lista general (default)</option>
                      {summaries
                        .filter((l) => !l.isDefault)
                        .map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.name}
                          </option>
                        ))}
                    </select>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-hidden">
          <div className="h-full w-full flex flex-col lg:flex-row min-h-0">
            {/* Listas */}
            <aside className="lg:w-60 xl:w-64 shrink-0 border-b lg:border-b-0 lg:border-r border-[var(--surface-border)] bg-[var(--surface-panel)] flex flex-col min-h-0 max-h-[38vh] lg:max-h-none">
              <div className="px-3 pt-3 pb-2 space-y-2 shrink-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="mono-label">Listas</p>
                  <span className="text-[10px] font-mono text-[var(--color-text-faint)] tabular-nums">
                    {summaries.length}
                  </span>
                </div>
                <label className="relative block">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--color-text-faint)]" />
                  <input
                    className="posta-input pl-8 pr-2.5 py-1.5 text-xs"
                    placeholder="Filtrar…"
                    value={listQuery}
                    onChange={(e) => setListQuery(e.target.value)}
                  />
                </label>
              </div>
              <nav className="flex-1 overflow-y-auto px-2 pb-3 space-y-1 scrollbar-thin">
                {filteredSummaries.length === 0 ? (
                  <p className="px-2 py-4 text-[11px] text-[var(--color-text-muted)] text-center">
                    Sin resultados
                  </p>
                ) : (
                  filteredSummaries.map((s) => {
                    const active = selectedListId === s.id;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          void loadList(s.id);
                          setMessage(null);
                        }}
                        className={`w-full text-left rounded-[var(--radius-posta)] px-3 py-2.5 transition border ${
                          active
                            ? 'bg-[var(--color-accent)]/10 border-[var(--color-accent)]/40 text-[var(--ink-soft)] shadow-[inset_3px_0_0_var(--color-accent)]'
                            : 'border-transparent hover:bg-[var(--surface-panel-2)] text-[var(--color-text-muted)]'
                        }`}
                      >
                        <span className="text-sm font-display font-semibold block truncate">
                          {s.name}
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-1.5">
                          {s.isDefault ? (
                            <span className="status-badge" data-status="assigned">
                              Default
                            </span>
                          ) : null}
                          <span className="text-[10px] font-mono text-[var(--color-text-faint)]">
                            {s.sellerCount} vend.
                          </span>
                        </span>
                      </button>
                    );
                  })
                )}
              </nav>
            </aside>

            {/* Zonas + editor */}
            <div className="flex-1 min-w-0 flex flex-col min-h-0">
              {/* Zone strip */}
              <div className="shrink-0 border-b border-[var(--surface-border)] bg-[var(--surface-panel-2)]/30 px-3 py-2.5">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <p className="mono-label">Zona a editar</p>
                  {selectedZone ? (
                    <span className="inline-flex items-center gap-1.5 text-[10px] font-mono text-[var(--color-text-muted)]">
                      <span
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ background: selectedZone.color }}
                      />
                      {selectedZone.name}
                    </span>
                  ) : null}
                </div>
                <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-thin">
                  {zoneOptions.map((z) => {
                    const active = selectedZoneKey === z.key;
                    return (
                      <button
                        key={z.key}
                        type="button"
                        onClick={() => setSelectedZoneKey(z.key)}
                        className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-posta)] border text-xs font-medium transition ${
                          active
                            ? 'bg-[var(--surface-panel)] border-[var(--surface-border)] text-[var(--ink-soft)] ring-1 ring-[var(--color-accent)]/30'
                            : 'border-transparent text-[var(--color-text-muted)] hover:bg-[var(--surface-panel)]/70 hover:text-[var(--ink-soft)]'
                        }`}
                      >
                        <span
                            className="h-2 w-2 rounded-full shrink-0"
                            style={{ background: z.color }}
                          />
                        {z.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              <main className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4">
                {!list ? (
                  <div className="posta-empty">Seleccioná una lista.</div>
                ) : (
                  <div className="max-w-3xl mx-auto space-y-4 pb-24">
                    {/* List identity */}
                    <section className="rounded-[var(--radius-posta)] border border-[var(--surface-border)] bg-[var(--surface-panel)] p-3.5 sm:p-4">
                      <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                        <div className="flex-1 min-w-0 space-y-1.5">
                          <label className="mono-label block">Nombre de la lista</label>
                          <input
                            className="posta-input px-3 py-2.5 text-sm font-display font-semibold disabled:opacity-70"
                            value={listName}
                            disabled={list.isDefault}
                            onChange={(e) => setListName(e.target.value)}
                          />
                          <p className="text-[11px] text-[var(--color-text-muted)]">
                            {list.isDefault
                              ? 'Lista general: la usan los vendedores sin asignación propia.'
                              : `Cloná precios desde otra lista al crear. ${list.sellerCount} vendedor${list.sellerCount === 1 ? '' : 'es'} asignado${list.sellerCount === 1 ? '' : 's'}.`}
                          </p>
                        </div>
                        <div className="flex sm:flex-col gap-2 sm:items-end shrink-0">
                          {list.isDefault ? (
                            <span className="status-badge" data-status="assigned">
                              Lista general
                            </span>
                          ) : (
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => void handleDelete()}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 rounded-[var(--radius-posta)] transition disabled:opacity-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Eliminar
                            </button>
                          )}
                        </div>
                      </div>
                    </section>

                    {/* Zone rates matrix */}
                    <section className="rounded-[var(--radius-posta)] border border-[var(--surface-border)] bg-[var(--surface-panel)] overflow-hidden">
                      <div className="flex items-center gap-3 px-3.5 sm:px-4 py-3 border-b border-[var(--surface-border)] bg-[var(--surface-panel-2)]/50">
                        <span
                          className="h-8 w-1 rounded-full shrink-0"
                          style={{ background: selectedZone?.color ?? '#888' }}
                          aria-hidden
                        />
                        <div className="min-w-0 flex-1">
                          <h2 className="text-sm font-display font-bold text-[var(--ink-soft)] truncate">
                            {selectedZone?.name ?? 'Zona'}
                          </h2>
                          <p className="text-[10px] font-mono text-[var(--color-text-muted)] mt-0.5">
                            Cobro al vendedor · pago al repartidor · margen
                          </p>
                        </div>
                      </div>

                      {/* Desktop header */}
                      <div className="hidden sm:grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.85fr)] gap-3 px-4 py-2 border-b border-[var(--surface-border)]/70 bg-[var(--surface-bg)]/40">
                        <span className="mono-label">Tipo</span>
                        <span className="mono-label inline-flex items-center gap-1">
                          <CircleDollarSign className="h-3 w-3 text-[var(--color-accent)]" />
                          Cobro vendedor
                        </span>
                        <span className="mono-label inline-flex items-center gap-1">
                          <Bike className="h-3 w-3 text-[var(--stamp)]" />
                          Pago repartidor
                        </span>
                        <span className="mono-label text-right">Margen</span>
                      </div>

                      <div className="divide-y divide-[var(--surface-border)]/60">
                        {RATE_ROWS.map(({ key, label, hint }) => {
                          const ship = parseDraftAmount(shipDraft[key]);
                          const driver = parseDraftAmount(driverDraft[key]);
                          const margin = ship - driver;
                          return (
                            <div
                              key={key}
                              className="grid grid-cols-1 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.85fr)] gap-3 px-3.5 sm:px-4 py-3.5 items-center"
                            >
                              <div className="min-w-0">
                                <p className="text-sm font-display font-semibold text-[var(--ink-soft)]">
                                  {label}
                                </p>
                                <p className="text-[10px] text-[var(--color-text-faint)]">{hint}</p>
                              </div>

                              <label className="flex flex-col gap-1 min-w-0">
                                <span className="sm:hidden mono-label inline-flex items-center gap-1">
                                  <CircleDollarSign className="h-3 w-3 text-[var(--color-accent)]" />
                                  Cobro
                                </span>
                                <div className="relative">
                                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] font-mono text-[var(--color-text-faint)]">
                                    $
                                  </span>
                                  <input
                                    className="posta-input pl-6 pr-2.5 py-2.5 text-sm font-mono tabular-nums"
                                    inputMode="decimal"
                                    value={shipDraft[key]}
                                    onChange={(e) =>
                                      setShipDraft((prev) => ({ ...prev, [key]: e.target.value }))
                                    }
                                  />
                                </div>
                              </label>

                              <label className="flex flex-col gap-1 min-w-0">
                                <span className="sm:hidden mono-label inline-flex items-center gap-1">
                                  <Bike className="h-3 w-3 text-[var(--stamp)]" />
                                  Pago
                                </span>
                                <div className="relative">
                                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] font-mono text-[var(--color-text-faint)]">
                                    $
                                  </span>
                                  <input
                                    className="posta-input pl-6 pr-2.5 py-2.5 text-sm font-mono tabular-nums"
                                    inputMode="decimal"
                                    value={driverDraft[key]}
                                    onChange={(e) =>
                                      setDriverDraft((prev) => ({ ...prev, [key]: e.target.value }))
                                    }
                                  />
                                </div>
                              </label>

                              <div className="flex sm:block items-center justify-between sm:text-right">
                                <span className="sm:hidden mono-label">Margen</span>
                                <p
                                  className={`text-sm font-mono font-bold tabular-nums ${
                                    margin >= 0
                                      ? 'text-[var(--color-ok)]'
                                      : 'text-[var(--color-danger)]'
                                  }`}
                                >
                                  {formatArs(margin)}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </section>

                    {/* Preview strip */}
                    <div className="rounded-[var(--radius-posta)] border border-[var(--surface-border)] bg-[var(--surface-panel-2)]/40 px-3.5 py-3">
                      <p className="mono-label mb-2">Vista rápida</p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                        {margins.map(({ key, ship, driver, margin }) => {
                          const row = RATE_ROWS.find((r) => r.key === key)!;
                          return (
                            <div
                              key={key}
                              className="inline-flex items-center gap-1.5 text-[11px] font-mono text-[var(--color-text-muted)]"
                            >
                              <span className="text-[var(--ink-soft)] font-bold">{row.label}</span>
                              <span>{formatArs(ship)}</span>
                              <ArrowRight className="h-3 w-3 opacity-50" />
                              <span>{formatArs(driver)}</span>
                              <span
                                className={
                                  margin >= 0 ? 'text-[var(--color-ok)]' : 'text-[var(--color-danger)]'
                                }
                              >
                                ({formatArs(margin)})
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </main>

              {/* Sticky save bar */}
              {list ? (
                <div className="shrink-0 border-t border-[var(--surface-border)] bg-[var(--surface-panel)]/95 backdrop-blur-sm px-3 sm:px-4 py-3">
                  <div className="max-w-3xl mx-auto flex flex-wrap items-center gap-2 justify-between">
                    <p className="text-[10px] font-mono text-[var(--color-text-muted)]">
                      {isDirty ? (
                        <span className="text-[var(--color-warn)]">Cambios sin guardar</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[var(--color-ok)]">
                          <Check className="h-3 w-3" />
                          Al día
                        </span>
                      )}
                      <span className="mx-1.5 text-[var(--color-text-faint)]">·</span>
                      {selectedZone?.name}
                    </p>
                    <button
                      type="button"
                      disabled={saving || !isDirty}
                      onClick={() => void handleSave()}
                      className="btn-primary px-4 py-2.5 disabled:opacity-40"
                    >
                      {saving ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Save className="h-3.5 w-3.5" />
                      )}
                      Guardar zona
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
