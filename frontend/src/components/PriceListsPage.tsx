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
  MapPin,
  CircleDollarSign,
  Bike,
  Users,
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

interface PriceListsPageProps {
  token: string;
}

const OUTSIDE_KEY = '__outside__';

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

const inputClass =
  'w-full rounded-[5px] border border-[var(--surface-border)] bg-[var(--surface-panel)] px-2.5 py-2 text-sm font-mono text-[var(--color-text)] focus:outline-none focus:border-[var(--color-accent)]/50';

export default function PriceListsPage({ token }: PriceListsPageProps) {
  const { confirm } = useModal();
  const [tab, setTab] = useState<'lists' | 'sellers'>('lists');
  const [summaries, setSummaries] = useState<PriceListSummary[]>([]);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [list, setList] = useState<PriceList | null>(null);
  const [selectedZoneKey, setSelectedZoneKey] = useState<string>(OUTSIDE_KEY);
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
    if (selectedZoneKey === OUTSIDE_KEY) {
      setShipDraft(trioToDraft(list.outsideShipping));
      setDriverDraft(trioToDraft(list.outsideDriverPay));
      return;
    }
    const zr = list.zoneRates.find((z) => z.zoneKey === selectedZoneKey);
    if (zr) {
      setShipDraft(trioToDraft(zr.shipping));
      setDriverDraft(trioToDraft(zr.driverPay));
    }
  }, [list, selectedZoneKey]);

  const zoneOptions = useMemo(() => {
    if (!list) return [];
    return [
      { key: OUTSIDE_KEY, name: 'Fuera de zona', color: '#888' },
      ...list.zoneRates.map((z) => ({
        key: z.zoneKey,
        name: z.zoneName,
        color:
          z.zoneKey === 'zona_caba'
            ? '#F9E04B'
            : z.zoneKey === 'zona_cordon_1'
              ? '#6BCB9A'
              : z.zoneKey === 'zona_cordon_2'
                ? '#6BA4E8'
                : '#B5E48C',
      })),
    ];
  }, [list]);

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
      const body: Record<string, unknown> = { name: listName.trim() || list.name };
      if (selectedZoneKey === OUTSIDE_KEY) {
        body.outsideShipping = shipping;
        body.outsideDriverPay = driverPay;
      } else {
        body.zoneRates = [
          {
            zoneKey: selectedZoneKey,
            shipping,
            driverPay,
          },
        ];
      }
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
        Cargando listas…
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 flex flex-col bg-[var(--surface-bg)]">
      <header className="shrink-0 border-b border-[var(--surface-border)] bg-[var(--surface-panel)] px-4 py-3 sm:px-6">
        <div className="flex flex-col gap-3 max-w-6xl mx-auto w-full">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-[5px] border border-[var(--surface-border)] bg-[var(--surface-panel-2)] text-[var(--color-accent)]">
              <Tags className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="text-base sm:text-lg font-semibold text-[var(--color-text)] tracking-tight">
                Listas de precios
              </h1>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5 leading-relaxed max-w-2xl">
                Creá distintas listas (cobro al vendedor + pago al repartidor por zona) y asigná cada
                vendedor a la que corresponda. Si un vendedor no tiene lista, usa la{' '}
                <strong className="text-[var(--color-text)]">Lista general</strong>.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1 p-1 rounded-[5px] border border-[var(--surface-border)] bg-[var(--surface-panel-2)]/40">
              <button
                type="button"
                onClick={() => setTab('lists')}
                className={`px-3 py-1.5 rounded-[4px] text-[10px] font-mono font-bold uppercase tracking-wide transition ${
                  tab === 'lists'
                    ? 'bg-[var(--color-accent)]/15 text-[var(--color-accent)]'
                    : 'text-[var(--color-text-muted)]'
                }`}
              >
                Editar listas
              </button>
              <button
                type="button"
                onClick={() => setTab('sellers')}
                className={`px-3 py-1.5 rounded-[4px] text-[10px] font-mono font-bold uppercase tracking-wide transition ${
                  tab === 'sellers'
                    ? 'bg-[var(--color-accent)]/15 text-[var(--color-accent)]'
                    : 'text-[var(--color-text-muted)]'
                }`}
              >
                Asignar vendedores
              </button>
            </div>

            {tab === 'lists' && (
              <div className="flex flex-wrap items-center gap-1.5 ml-auto">
                <input
                  className={`${inputClass} !w-40 !py-1.5 text-xs`}
                  placeholder="Nombre de lista nueva"
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                />
                <button
                  type="button"
                  disabled={creating}
                  onClick={() => void handleCreate()}
                  className="inline-flex items-center gap-1 rounded-[5px] border border-[var(--surface-border)] bg-[var(--surface-panel-2)] px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-[var(--color-text)] hover:border-[var(--color-accent)]/40 disabled:opacity-50"
                >
                  {creating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                  Nueva lista
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {message ? (
        <p
          className={`px-4 sm:px-6 pt-2 text-xs font-mono max-w-6xl mx-auto w-full ${
            messageOk ? 'text-[var(--color-ok)]' : 'text-[var(--color-danger)]'
          }`}
        >
          {message}
        </p>
      ) : null}

      {tab === 'sellers' ? (
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="max-w-3xl mx-auto space-y-3">
            <div className="flex items-center gap-2 text-[var(--color-text)]">
              <Users className="h-4 w-4 text-[var(--color-accent)]" />
              <h2 className="text-sm font-semibold">Qué lista usa cada vendedor</h2>
            </div>
            {assignments.length === 0 ? (
              <p className="text-xs text-[var(--color-text-muted)]">Todavía no hay vendedores.</p>
            ) : (
              <div className="rounded-[6px] border border-[var(--surface-border)] bg-[var(--surface-panel)] divide-y divide-[var(--surface-border)]">
                {assignments.map((a) => (
                  <div
                    key={a.sellerId}
                    className="flex flex-col sm:flex-row sm:items-center gap-2 px-3.5 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[var(--color-text)] truncate">
                        {a.sellerName}
                      </p>
                      <p className="text-[10px] text-[var(--color-text-muted)]">
                        Actual: {a.priceListName ?? 'Lista general (default)'}
                      </p>
                    </div>
                    <select
                      className={`${inputClass} sm:!w-56 !py-1.5 text-xs`}
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
          <div className="h-full max-w-6xl mx-auto w-full flex flex-col md:flex-row min-h-0">
            <aside className="md:w-56 shrink-0 border-b md:border-b-0 md:border-r border-[var(--surface-border)] bg-[var(--surface-panel)] overflow-y-auto">
              <p className="px-4 pt-3 pb-1.5 text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
                Listas
              </p>
              <nav className="px-2 pb-3 space-y-0.5">
                {summaries.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      void loadList(s.id);
                      setMessage(null);
                    }}
                    className={`w-full text-left rounded-[5px] px-3 py-2.5 transition border ${
                      selectedListId === s.id
                        ? 'bg-[var(--color-accent)]/10 border-[var(--color-accent)]/35 text-[var(--color-text)]'
                        : 'border-transparent hover:bg-[var(--surface-panel-2)] text-[var(--color-text-muted)]'
                    }`}
                  >
                    <span className="text-sm font-medium block truncate">{s.name}</span>
                    <span className="text-[10px] font-mono text-[var(--color-text-muted)]">
                      {s.isDefault ? 'Default · ' : ''}
                      {s.sellerCount} vendedor{s.sellerCount === 1 ? '' : 'es'}
                    </span>
                  </button>
                ))}
              </nav>
            </aside>

            <div className="flex-1 min-w-0 flex flex-col md:flex-row min-h-0">
              <aside className="md:w-44 shrink-0 border-b md:border-b-0 md:border-r border-[var(--surface-border)] overflow-y-auto bg-[var(--surface-panel-2)]/20">
                <p className="px-3 pt-3 pb-1 text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
                  Zonas
                </p>
                <div className="px-2 pb-3 space-y-0.5">
                  {zoneOptions.map((z) => (
                    <button
                      key={z.key}
                      type="button"
                      onClick={() => setSelectedZoneKey(z.key)}
                      className={`w-full text-left rounded-[5px] px-2.5 py-2 text-xs transition ${
                        selectedZoneKey === z.key
                          ? 'bg-[var(--surface-panel)] text-[var(--color-text)] border border-[var(--surface-border)]'
                          : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                      }`}
                    >
                      <span className="inline-flex items-center gap-1.5">
                        {z.key === OUTSIDE_KEY ? (
                          <MapPin className="h-3 w-3" />
                        ) : (
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ background: z.color }}
                          />
                        )}
                        {z.name}
                      </span>
                    </button>
                  ))}
                </div>
              </aside>

              <main className="flex-1 min-w-0 overflow-y-auto p-4 sm:p-5">
                {!list ? (
                  <p className="text-xs text-[var(--color-text-muted)]">Seleccioná una lista.</p>
                ) : (
                  <div className="max-w-xl space-y-4">
                    <div>
                      <label className="text-[10px] font-mono uppercase text-[var(--color-text-muted)]">
                        Nombre de la lista
                      </label>
                      <input
                        className={`${inputClass} mt-1`}
                        value={listName}
                        disabled={list.isDefault}
                        onChange={(e) => setListName(e.target.value)}
                      />
                      {list.isDefault ? (
                        <p className="text-[10px] text-[var(--color-text-muted)] mt-1">
                          Lista general: la usan los vendedores sin asignación propia.
                        </p>
                      ) : null}
                    </div>

                    <p className="text-sm font-medium text-[var(--color-text)]">
                      {selectedZoneKey === OUTSIDE_KEY
                        ? 'Fuera de zona'
                        : zoneOptions.find((z) => z.key === selectedZoneKey)?.name}
                    </p>

                    <section className="rounded-[6px] border border-[var(--surface-border)] bg-[var(--surface-panel)] overflow-hidden">
                      <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-[var(--surface-border)] bg-[var(--surface-panel-2)]/50">
                        <CircleDollarSign className="h-3.5 w-3.5 text-[var(--color-accent)]" />
                        <h3 className="text-[11px] font-mono font-bold uppercase tracking-wider">
                          Cobro al vendedor
                        </h3>
                      </div>
                      <div className="p-3.5 grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {(
                          [
                            ['flex', 'Flex'],
                            ['express', 'Express'],
                            ['standard', 'Estándar'],
                          ] as const
                        ).map(([key, label]) => (
                          <label key={key} className="flex flex-col gap-1">
                            <span className="text-[11px] font-medium">{label}</span>
                            <div className="relative">
                              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] font-mono text-[var(--color-text-muted)]">
                                $
                              </span>
                              <input
                                className={`${inputClass} pl-6`}
                                inputMode="decimal"
                                value={shipDraft[key]}
                                onChange={(e) =>
                                  setShipDraft((prev) => ({ ...prev, [key]: e.target.value }))
                                }
                              />
                            </div>
                          </label>
                        ))}
                      </div>
                    </section>

                    <section className="rounded-[6px] border border-[var(--surface-border)] bg-[var(--surface-panel)] overflow-hidden">
                      <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-[var(--surface-border)] bg-[var(--surface-panel-2)]/50">
                        <Bike className="h-3.5 w-3.5 text-[var(--stamp)]" />
                        <h3 className="text-[11px] font-mono font-bold uppercase tracking-wider">
                          Pago al repartidor
                        </h3>
                      </div>
                      <div className="p-3.5 grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {(
                          [
                            ['flex', 'Flex'],
                            ['express', 'Express'],
                            ['standard', 'Estándar'],
                          ] as const
                        ).map(([key, label]) => (
                          <label key={key} className="flex flex-col gap-1">
                            <span className="text-[11px] font-medium">{label}</span>
                            <div className="relative">
                              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] font-mono text-[var(--color-text-muted)]">
                                $
                              </span>
                              <input
                                className={`${inputClass} pl-6`}
                                inputMode="decimal"
                                value={driverDraft[key]}
                                onChange={(e) =>
                                  setDriverDraft((prev) => ({ ...prev, [key]: e.target.value }))
                                }
                              />
                            </div>
                          </label>
                        ))}
                      </div>
                    </section>

                    <div className="text-[11px] text-[var(--color-text-muted)] font-mono">
                      Vista: cobra {formatArs(Number(shipDraft.flex) || 0)} / paga{' '}
                      {formatArs(Number(driverDraft.flex) || 0)} (Flex)
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void handleSave()}
                        className="inline-flex items-center gap-1.5 rounded-[5px] bg-[var(--stamp)] text-[#F6F0E4] px-3.5 py-2 text-xs font-bold uppercase tracking-wide disabled:opacity-50"
                      >
                        {saving ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Save className="h-3.5 w-3.5" />
                        )}
                        Guardar
                      </button>
                      {!list.isDefault ? (
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void handleDelete()}
                          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs text-[var(--color-danger)]"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Eliminar lista
                        </button>
                      ) : null}
                    </div>
                  </div>
                )}
              </main>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
