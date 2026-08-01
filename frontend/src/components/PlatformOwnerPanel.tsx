/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useState, memo } from 'react';
import {
  ArrowLeft,
  Building2,
  Crown,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Shield,
} from 'lucide-react';
import {
  Order,
  OrderStatus,
  PlatformAgencyDetail,
  PlatformAgencyListItem,
  PlatformAuditEntry,
  PlatformMetrics,
  SubscriptionPlan,
  User,
  UserRole,
} from '../types.js';
import { apiUrl } from '../api.ts';

interface PlatformOwnerPanelProps {
  token: string;
}

type DetailTab = 'resumen' | 'suscripcion' | 'usuarios' | 'pedidos' | 'zonas' | 'precios' | 'auditoria';

interface ConfirmModalState {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
}

interface PromptModalState {
  title: string;
  message?: string;
  label: string;
  type?: 'text' | 'password';
  placeholder?: string;
  initialValue?: string;
  confirmLabel: string;
  danger?: boolean;
  validate?: (value: string) => string | null;
  onSubmit: (value: string) => void | Promise<void>;
}

async function platformFetch<T>(
  token: string,
  path: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(apiUrl(path), {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    let message = `Error ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function roleLabel(role: UserRole): string {
  if (role === UserRole.SUPER_ADMIN) return 'Dueño agencia';
  if (role === UserRole.LOGISTICS_ADMIN) return 'Logística';
  if (role === UserRole.STORE_ADMIN) return 'Vendedor';
  return 'Repartidor';
}

const PlatformStatusBadge = memo(function PlatformStatusBadge({
  status,
  ok,
}: {
  status: string;
  ok?: boolean;
}) {
  const tone =
    ok === true
      ? 'text-[var(--color-ok)] border-[var(--color-ok)]/30 bg-[var(--color-ok)]/10'
      : ok === false
        ? 'text-[var(--color-danger)] border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10'
        : 'text-[var(--ink-soft)] border-[var(--surface-border)] bg-[var(--surface-panel-2)]';
  return (
    <span className={`text-[9px] font-mono font-bold uppercase px-1.5 py-0.5 rounded border ${tone}`}>
      {status}
    </span>
  );
});

const PlatformAgencyListItemRow = memo(function PlatformAgencyListItemRow({
  agency,
  selected,
  onSelect,
}: {
  agency: PlatformAgencyListItem;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(agency.id)}
        className={`w-full text-left px-3 py-2.5 hover:bg-[var(--surface-panel-2)] transition ${
          selected ? 'bg-[var(--color-accent)]/8' : ''
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-[var(--ink-soft)] truncate flex items-center gap-1.5">
              <Building2 className="w-3 h-3 text-[var(--color-accent)] shrink-0" />
              {agency.name}
            </p>
            <p className="text-[10px] font-mono text-[var(--color-text-muted)] truncate">
              {agency.city || '—'} · {agency.ownerEmail || 'sin dueño'}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <PlatformStatusBadge status={agency.status} ok={agency.status === 'active'} />
            <PlatformStatusBadge
              status={agency.subscriptionStatus ?? '—'}
              ok={agency.subscriptionActive}
            />
          </div>
        </div>
        <p className="mt-1 text-[9px] font-mono text-[var(--color-text-muted)]">
          {agency.sellers} vend. · {agency.repartidores} rep. · {agency.openOrders} abiertos
          {agency.daysRemaining != null ? ` · ${agency.daysRemaining}d` : ''}
        </p>
      </button>
    </li>
  );
});

export default function PlatformOwnerPanel({ token }: PlatformOwnerPanelProps) {
  const [metrics, setMetrics] = useState<PlatformMetrics | null>(null);
  const [agencies, setAgencies] = useState<PlatformAgencyListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended'>('all');
  const [subFilter, setSubFilter] = useState<'all' | 'trial' | 'active' | 'past_due' | 'cancelled'>(
    'all'
  );
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PlatformAgencyDetail | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>('resumen');
  const [detailLoading, setDetailLoading] = useState(false);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [busy, setBusy] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const [confirmState, setConfirmState] = useState<ConfirmModalState | null>(null);
  const [promptState, setPromptState] = useState<PromptModalState | null>(null);
  const [promptValue, setPromptValue] = useState('');
  const [promptError, setPromptError] = useState<string | null>(null);

  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersTotal, setOrdersTotal] = useState(0);
  const [audit, setAudit] = useState<PlatformAuditEntry[]>([]);
  const [zones, setZones] = useState<
    Array<{
      id: string;
      name: string;
      shippingRates?: { flex: number; express: number; standard: number };
    }>
  >([]);
  const [priceLists, setPriceLists] = useState<
    Array<{ id: string; name: string; isDefault: boolean; sellerCount: number }>
  >([]);

  const [createForm, setCreateForm] = useState({
    name: '',
    city: '',
    contactEmail: '',
    ownerName: '',
    ownerEmail: '',
    ownerPassword: '',
  });

  const [editForm, setEditForm] = useState({
    name: '',
    city: '',
    contactEmail: '',
    contactPhone: '',
    cuit: '',
    deliveryDeadlineHour: 13,
  });

  const [subForm, setSubForm] = useState({
    status: 'trial' as AgencySubscriptionStatusLike,
    planId: '',
    extendTrialDays: '7',
  });

  const [userForm, setUserForm] = useState({
    name: '',
    username: '',
    password: '',
    role: UserRole.STORE_ADMIN as UserRole,
  });

  type AgencySubscriptionStatusLike = 'trial' | 'active' | 'past_due' | 'cancelled';

  const limit = 25;

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
        status: statusFilter,
        subscription: subFilter,
      });
      if (q.trim()) params.set('q', q.trim());
      const [metricsRes, listRes, plansRes] = await Promise.all([
        platformFetch<PlatformMetrics>(token, '/api/platform/metrics'),
        platformFetch<{ items: PlatformAgencyListItem[]; total: number }>(
          token,
          `/api/platform/agencies?${params}`
        ),
        platformFetch<SubscriptionPlan[]>(token, '/api/platform/plans'),
      ]);
      setMetrics(metricsRes);
      setAgencies(listRes.items);
      setTotal(listRes.total);
      setPlans(plansRes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar');
    } finally {
      setLoading(false);
    }
  }, [token, offset, statusFilter, subFilter, q]);

  const loadDetail = useCallback(
    async (agencyId: string) => {
      setDetailLoading(true);
      setError(null);
      try {
        const d = await platformFetch<PlatformAgencyDetail>(
          token,
          `/api/platform/agencies/${agencyId}`
        );
        setDetail(d);
        setEditForm({
          name: d.agency.name,
          city: d.agency.city ?? '',
          contactEmail: d.agency.contactEmail ?? '',
          contactPhone: d.agency.contactPhone ?? '',
          cuit: d.agency.cuit ?? '',
          deliveryDeadlineHour: d.agency.deliveryDeadlineHour,
        });
        setSubForm({
          status: d.subscription.status,
          planId: d.subscription.plan?.id ?? '',
          extendTrialDays: '7',
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al cargar detalle');
      } finally {
        setDetailLoading(false);
      }
    },
    [token]
  );

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
    else setDetail(null);
  }, [selectedId, loadDetail]);

  useEffect(() => {
    if (!selectedId || detailTab !== 'pedidos') return;
    void platformFetch<{ items: Order[]; total: number }>(
      token,
      `/api/platform/orders?agencyId=${encodeURIComponent(selectedId)}&archived=false&limit=50`
    )
      .then((res) => {
        setOrders(res.items);
        setOrdersTotal(res.total);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Error pedidos'));
  }, [selectedId, detailTab, token]);

  useEffect(() => {
    if (!selectedId || detailTab !== 'auditoria') return;
    void platformFetch<{ items: PlatformAuditEntry[]; total: number }>(
      token,
      `/api/platform/audit?agencyId=${encodeURIComponent(selectedId)}&limit=50`
    )
      .then((res) => setAudit(res.items))
      .catch((err) => setError(err instanceof Error ? err.message : 'Error auditoría'));
  }, [selectedId, detailTab, token]);

  useEffect(() => {
    if (!selectedId || detailTab !== 'zonas') return;
    void platformFetch<typeof zones>(token, `/api/platform/agencies/${selectedId}/zones`)
      .then(setZones)
      .catch((err) => setError(err instanceof Error ? err.message : 'Error zonas'));
  }, [selectedId, detailTab, token]);

  useEffect(() => {
    if (!selectedId || detailTab !== 'precios') return;
    void platformFetch<typeof priceLists>(
      token,
      `/api/platform/agencies/${selectedId}/price-lists`
    )
      .then(setPriceLists)
      .catch((err) => setError(err instanceof Error ? err.message : 'Error precios'));
  }, [selectedId, detailTab, token]);

  const allUsers = useMemo(() => {
    if (!detail) return [] as User[];
    return [...detail.owners, ...detail.logisticsAdmins, ...detail.sellers, ...detail.repartidores];
  }, [detail]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setBusy(false);
    }
  };

  const createAgency = () =>
    run(async () => {
      const res = await platformFetch<{ agency: { id: string } }>(token, '/api/platform/agencies', {
        method: 'POST',
        body: JSON.stringify(createForm),
      });
      setShowCreate(false);
      setCreateForm({
        name: '',
        city: '',
        contactEmail: '',
        ownerName: '',
        ownerEmail: '',
        ownerPassword: '',
      });
      await loadList();
      setSelectedId(res.agency.id);
    });

  const saveAgency = () =>
    run(async () => {
      if (!selectedId) return;
      await platformFetch(token, `/api/platform/agencies/${selectedId}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: editForm.name,
          city: editForm.city || null,
          contactEmail: editForm.contactEmail || null,
          contactPhone: editForm.contactPhone || null,
          cuit: editForm.cuit || null,
          deliveryDeadlineHour: Number(editForm.deliveryDeadlineHour),
        }),
      });
      await loadDetail(selectedId);
      await loadList();
    });

  const doToggleAgencyStatus = () =>
    run(async () => {
      if (!detail || !selectedId) return;
      const next = detail.agency.status === 'active' ? 'suspended' : 'active';
      await platformFetch(token, `/api/platform/agencies/${selectedId}/status`, {
        method: 'POST',
        body: JSON.stringify({ status: next }),
      });
      await loadDetail(selectedId);
      await loadList();
    });

  const toggleAgencyStatus = () => {
    if (!detail || !selectedId) return;
    if (detail.agency.status !== 'active') {
      void doToggleAgencyStatus();
      return;
    }
    setConfirmState({
      title: 'Suspender agencia',
      message: `¿Suspender la agencia "${detail.agency.name}"? No podrá operar hasta que la reactives.`,
      confirmLabel: 'Suspender',
      danger: true,
      onConfirm: () => doToggleAgencyStatus(),
    });
  };

  const deleteAgency = () => {
    if (!detail || !selectedId) return;
    const name = detail.agency.name;
    openPrompt({
      title: 'Eliminar agencia',
      message: `Vas a eliminar la agencia "${name}" y TODOS sus datos (usuarios, pedidos, zonas, precios, suscripción). Esta acción NO se puede deshacer. Para confirmar, escribí el nombre exacto de la agencia.`,
      label: 'Nombre de la agencia',
      placeholder: name,
      confirmLabel: 'Eliminar definitivamente',
      danger: true,
      validate: (v) => (v.trim() === name ? null : 'El nombre no coincide.'),
      onSubmit: (v) =>
        run(async () => {
          await platformFetch(token, `/api/platform/agencies/${selectedId}`, {
            method: 'DELETE',
            body: JSON.stringify({ confirmName: v.trim() }),
          });
          setSelectedId(null);
          setDetail(null);
          await loadList();
        }),
    });
  };

  const saveSubscription = (extra?: { extendTrialDays?: number }) =>
    run(async () => {
      if (!selectedId) return;
      await platformFetch(token, `/api/platform/agencies/${selectedId}/subscription`, {
        method: 'PUT',
        body: JSON.stringify({
          status: subForm.status,
          planId: subForm.planId || null,
          ...(extra ?? {}),
        }),
      });
      await loadDetail(selectedId);
      await loadList();
    });

  const createUser = () =>
    run(async () => {
      if (!selectedId) return;
      await platformFetch(token, `/api/platform/agencies/${selectedId}/users`, {
        method: 'POST',
        body: JSON.stringify(userForm),
      });
      setUserForm({
        name: '',
        username: '',
        password: '',
        role: UserRole.STORE_ADMIN,
      });
      await loadDetail(selectedId);
    });

  const resetPassword = (user: User) =>
    openPrompt({
      title: `Nueva contraseña · ${user.name}`,
      label: 'Contraseña',
      type: 'password',
      placeholder: 'Mín. 6 caracteres',
      confirmLabel: 'Guardar',
      validate: (v) => (v.length >= 6 ? null : 'La contraseña debe tener al menos 6 caracteres.'),
      onSubmit: (password) =>
        run(async () => {
          if (!selectedId) return;
          await platformFetch(
            token,
            `/api/platform/agencies/${selectedId}/users/${user.id}/password`,
            {
              method: 'POST',
              body: JSON.stringify({ password }),
            }
          );
        }),
    });

  const doToggleUserDisabled = (user: User) =>
    run(async () => {
      if (!selectedId) return;
      const disabled = !user.disabledAt;
      await platformFetch(
        token,
        `/api/platform/agencies/${selectedId}/users/${user.id}/disabled`,
        {
          method: 'POST',
          body: JSON.stringify({ disabled }),
        }
      );
      await loadDetail(selectedId);
    });

  const toggleUserDisabled = (user: User) => {
    if (user.disabledAt) {
      void doToggleUserDisabled(user);
      return;
    }
    setConfirmState({
      title: 'Deshabilitar usuario',
      message: `¿Deshabilitar a ${user.name}? No podrá iniciar sesión hasta que lo habilites de nuevo.`,
      confirmLabel: 'Deshabilitar',
      danger: true,
      onConfirm: () => doToggleUserDisabled(user),
    });
  };

  const doSetOrderStatus = (orderId: string, status: OrderStatus) =>
    run(async () => {
      await platformFetch(token, `/api/platform/orders/${orderId}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      });
      if (selectedId) {
        const res = await platformFetch<{ items: Order[]; total: number }>(
          token,
          `/api/platform/orders?agencyId=${encodeURIComponent(selectedId)}&archived=false&limit=50`
        );
        setOrders(res.items);
        setOrdersTotal(res.total);
        await loadDetail(selectedId);
      }
    });

  const setOrderStatus = (orderId: string, status: OrderStatus) => {
    if (status !== OrderStatus.CANCELLED) {
      void doSetOrderStatus(orderId, status);
      return;
    }
    setConfirmState({
      title: 'Cancelar pedido',
      message: '¿Cancelar este pedido? Se cambiará su estado a cancelado.',
      confirmLabel: 'Cancelar pedido',
      danger: true,
      onConfirm: () => doSetOrderStatus(orderId, status),
    });
  };

  const createPriceList = () =>
    openPrompt({
      title: 'Nueva lista de precios',
      label: 'Nombre de la lista',
      placeholder: 'Ej: Mayoristas',
      confirmLabel: 'Crear',
      validate: (v) => (v.trim() ? null : 'Ingresá un nombre.'),
      onSubmit: (name) =>
        run(async () => {
          if (!selectedId) return;
          await platformFetch(token, `/api/platform/agencies/${selectedId}/price-lists`, {
            method: 'POST',
            body: JSON.stringify({ name: name.trim() }),
          });
          const lists = await platformFetch<typeof priceLists>(
            token,
            `/api/platform/agencies/${selectedId}/price-lists`
          );
          setPriceLists(lists);
        }),
    });

  const deletePriceList = (listId: string) =>
    setConfirmState({
      title: 'Eliminar lista de precios',
      message: '¿Eliminar esta lista de precios? Los vendedores asignados quedarán sin lista.',
      confirmLabel: 'Eliminar',
      danger: true,
      onConfirm: () =>
        run(async () => {
          if (!selectedId) return;
          await platformFetch(
            token,
            `/api/platform/agencies/${selectedId}/price-lists/${listId}`,
            { method: 'DELETE' }
          );
          setPriceLists((prev) => prev.filter((p) => p.id !== listId));
        }),
    });

  const openPrompt = (state: PromptModalState) => {
    setPromptValue(state.initialValue ?? '');
    setPromptError(null);
    setPromptState(state);
  };

  const closePrompt = () => {
    setPromptState(null);
    setPromptValue('');
    setPromptError(null);
  };

  const submitPrompt = async () => {
    if (!promptState) return;
    const validationError = promptState.validate?.(promptValue) ?? null;
    if (validationError) {
      setPromptError(validationError);
      return;
    }
    const { onSubmit } = promptState;
    const value = promptValue;
    closePrompt();
    await onSubmit(value);
  };

  const detailTabs: Array<{ id: DetailTab; label: string }> = [
    { id: 'resumen', label: 'Resumen' },
    { id: 'suscripcion', label: 'Suscripción' },
    { id: 'usuarios', label: 'Usuarios' },
    { id: 'pedidos', label: 'Pedidos' },
    { id: 'zonas', label: 'Zonas' },
    { id: 'precios', label: 'Precios' },
    { id: 'auditoria', label: 'Auditoría' },
  ];

  return (
    <div className="flex flex-col h-full min-h-0 posta-surface">
      <div className="p-3 sm:p-4 border-b border-[var(--surface-border)] space-y-3 shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--color-text-muted)] flex items-center gap-1.5">
              <Crown className="w-3.5 h-3.5 text-[var(--color-accent)]" />
              Dueño de Posta
            </p>
            <h1 className="text-lg sm:text-xl font-display font-bold text-[var(--ink-soft)] mt-0.5">
              Panel de plataforma
            </h1>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => void loadList()}
              className="p-2 rounded border border-[var(--surface-border)] text-[var(--color-text-muted)] hover:text-[var(--ink-soft)]"
              title="Actualizar"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded border border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10 text-[var(--color-accent)] text-[10px] font-mono font-bold uppercase"
            >
              <Plus className="w-3.5 h-3.5" />
              Agencia
            </button>
          </div>
        </div>

        {metrics && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            {[
              ['Agencias', metrics.agenciesTotal],
              ['Activas', metrics.agenciesActive],
              ['Suspendidas', metrics.agenciesSuspended],
              ['Trials OK', metrics.trialsActive],
              ['Trials venc.', metrics.trialsExpired],
              ['Suscrip. activas', metrics.subscriptionsActive],
              ['Usuarios', metrics.usersTotal],
            ].map(([label, value]) => (
              <div
                key={String(label)}
                className="rounded-[5px] border border-[var(--surface-border)] p-2 bg-[var(--surface-panel-2)]"
              >
                <p className="text-[9px] font-mono uppercase text-[var(--color-text-muted)]">
                  {label}
                </p>
                <p className="text-sm font-display font-bold text-[var(--ink-soft)]">{value}</p>
              </div>
            ))}
          </div>
        )}

        {error && (
          <p className="text-[11px] font-mono text-[var(--color-danger)] border border-[var(--color-danger)]/30 rounded px-2 py-1.5 bg-[var(--color-danger)]/10">
            {error}
          </p>
        )}
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="border-b xl:border-b-0 xl:border-r border-[var(--surface-border)] flex flex-col min-h-0">
          <div className="p-3 space-y-2 border-b border-[var(--surface-border)] shrink-0">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
              <input
                value={q}
                onChange={(e) => {
                  setOffset(0);
                  setQ(e.target.value);
                }}
                placeholder="Buscar agencia, ciudad, email…"
                className="w-full pl-7 pr-2 py-1.5 text-xs rounded border border-[var(--surface-border)] bg-[var(--surface-panel-2)] text-[var(--ink-soft)]"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <select
                value={statusFilter}
                onChange={(e) => {
                  setOffset(0);
                  setStatusFilter(e.target.value as typeof statusFilter);
                }}
                className="text-[10px] font-mono rounded border border-[var(--surface-border)] bg-[var(--surface-panel-2)] px-2 py-1"
              >
                <option value="all">Todas</option>
                <option value="active">Activas</option>
                <option value="suspended">Suspendidas</option>
              </select>
              <select
                value={subFilter}
                onChange={(e) => {
                  setOffset(0);
                  setSubFilter(e.target.value as typeof subFilter);
                }}
                className="text-[10px] font-mono rounded border border-[var(--surface-border)] bg-[var(--surface-panel-2)] px-2 py-1"
              >
                <option value="all">Cualquier sub.</option>
                <option value="trial">Trial</option>
                <option value="active">Active</option>
                <option value="past_due">Past due</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto min-h-0">
            {loading ? (
              <div className="p-6 flex items-center gap-2 text-[var(--color-text-muted)] text-xs">
                <Loader2 className="w-4 h-4 animate-spin" /> Cargando agencias…
              </div>
            ) : agencies.length === 0 ? (
              <p className="p-4 text-xs text-[var(--color-text-muted)]">Sin resultados.</p>
            ) : (
              <ul className="divide-y divide-[var(--surface-border)]/60">
                {agencies.map((a) => (
                  <PlatformAgencyListItemRow
                    key={a.id}
                    agency={a}
                    selected={selectedId === a.id}
                    onSelect={(id) => {
                      setDetailTab('resumen');
                      setSelectedId(id);
                    }}
                  />
                ))}
              </ul>
            )}
          </div>

          <div className="p-2 border-t border-[var(--surface-border)] flex items-center justify-between text-[10px] font-mono text-[var(--color-text-muted)] shrink-0">
            <span>
              {total} agencia{total === 1 ? '' : 's'}
            </span>
            <div className="flex gap-1">
              <button
                type="button"
                disabled={offset <= 0}
                onClick={() => setOffset((o) => Math.max(0, o - limit))}
                className="px-2 py-1 rounded border border-[var(--surface-border)] disabled:opacity-40"
              >
                Ant.
              </button>
              <button
                type="button"
                disabled={offset + limit >= total}
                onClick={() => setOffset((o) => o + limit)}
                className="px-2 py-1 rounded border border-[var(--surface-border)] disabled:opacity-40"
              >
                Sig.
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-col min-h-0 min-w-0">
          {!selectedId ? (
            <div className="flex-1 flex items-center justify-center p-6 text-center text-[var(--color-text-muted)]">
              <div>
                <Shield className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Seleccioná una agencia para administrarla.</p>
              </div>
            </div>
          ) : detailLoading || !detail ? (
            <div className="p-6 flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
              <Loader2 className="w-4 h-4 animate-spin" /> Cargando detalle…
            </div>
          ) : (
            <>
              <div className="p-3 border-b border-[var(--surface-border)] space-y-2 shrink-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <button
                      type="button"
                      className="xl:hidden text-[10px] font-mono text-[var(--color-text-muted)] flex items-center gap-1 mb-1"
                      onClick={() => setSelectedId(null)}
                    >
                      <ArrowLeft className="w-3 h-3" /> Volver
                    </button>
                    <h2 className="text-base font-display font-bold text-[var(--ink-soft)] truncate">
                      {detail.agency.name}
                    </h2>
                    <p className="text-[10px] font-mono text-[var(--color-text-muted)]">
                      {detail.agency.id}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <PlatformStatusBadge status={detail.agency.status} ok={detail.agency.status === 'active'} />
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void toggleAgencyStatus()}
                      className="text-[9px] font-mono font-bold uppercase px-2 py-1 rounded border border-[var(--surface-border)]"
                    >
                      {detail.agency.status === 'active' ? 'Suspender' : 'Reactivar'}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void deleteAgency()}
                      className="text-[9px] font-mono font-bold uppercase px-2 py-1 rounded border border-red-500/40 text-red-500"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {detailTabs.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setDetailTab(tab.id)}
                      className={`text-[9px] font-mono font-bold uppercase px-2 py-1 rounded border ${
                        detailTab === tab.id
                          ? 'border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10 text-[var(--color-accent)]'
                          : 'border-[var(--surface-border)] text-[var(--color-text-muted)]'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
                {detailTab === 'resumen' && (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] font-mono">
                      {[
                        ['Vendedores', detail.counts.sellers],
                        ['Repartidores', detail.counts.repartidores],
                        ['Pedidos abiertos', detail.counts.ordersOpen],
                        ['Zonas', detail.counts.zones],
                      ].map(([label, value]) => (
                        <div
                          key={String(label)}
                          className="rounded border border-[var(--surface-border)] p-2"
                        >
                          <p className="text-[var(--color-text-muted)]">{label}</p>
                          <p className="font-bold text-[var(--ink-soft)]">{value}</p>
                        </div>
                      ))}
                    </div>
                    <div className="border border-[var(--surface-border)] rounded p-3 space-y-2">
                      <p className="text-[10px] font-mono font-bold uppercase text-[var(--ink-soft)]">
                        Ficha
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {(
                          [
                            ['name', 'Nombre'],
                            ['city', 'Ciudad'],
                            ['contactEmail', 'Email'],
                            ['contactPhone', 'Teléfono'],
                            ['cuit', 'CUIT'],
                          ] as const
                        ).map(([key, label]) => (
                          <label key={key} className="text-[10px] font-mono space-y-0.5 block">
                            <span className="text-[var(--color-text-muted)]">{label}</span>
                            <input
                              value={editForm[key]}
                              onChange={(e) =>
                                setEditForm((f) => ({ ...f, [key]: e.target.value }))
                              }
                              className="w-full px-2 py-1.5 rounded border border-[var(--surface-border)] bg-[var(--surface-panel-2)]"
                            />
                          </label>
                        ))}
                        <label className="text-[10px] font-mono space-y-0.5 block">
                          <span className="text-[var(--color-text-muted)]">Corte (hora)</span>
                          <input
                            type="number"
                            min={0}
                            max={23}
                            value={editForm.deliveryDeadlineHour}
                            onChange={(e) =>
                              setEditForm((f) => ({
                                ...f,
                                deliveryDeadlineHour: Number(e.target.value),
                              }))
                            }
                            className="w-full px-2 py-1.5 rounded border border-[var(--surface-border)] bg-[var(--surface-panel-2)]"
                          />
                        </label>
                      </div>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void saveAgency()}
                        className="text-[10px] font-mono font-bold uppercase px-3 py-1.5 rounded bg-[var(--color-accent)] text-black"
                      >
                        Guardar ficha
                      </button>
                    </div>
                  </>
                )}

                {detailTab === 'suscripcion' && (
                  <div className="border border-[var(--surface-border)] rounded p-3 space-y-3">
                    <div className="flex flex-wrap gap-2 text-[10px] font-mono">
                      <PlatformStatusBadge
                        status={detail.subscription.status}
                        ok={detail.subscription.isActive}
                      />
                      <span className="text-[var(--color-text-muted)]">
                        Activa: {detail.subscription.isActive ? 'sí' : 'no'}
                        {detail.subscription.daysRemaining != null
                          ? ` · ${detail.subscription.daysRemaining} días`
                          : ''}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <label className="text-[10px] font-mono space-y-0.5 block">
                        <span className="text-[var(--color-text-muted)]">Estado</span>
                        <select
                          value={subForm.status}
                          onChange={(e) =>
                            setSubForm((f) => ({
                              ...f,
                              status: e.target.value as AgencySubscriptionStatusLike,
                            }))
                          }
                          className="w-full px-2 py-1.5 rounded border border-[var(--surface-border)] bg-[var(--surface-panel-2)]"
                        >
                          <option value="trial">trial</option>
                          <option value="active">active</option>
                          <option value="past_due">past_due</option>
                          <option value="cancelled">cancelled</option>
                        </select>
                      </label>
                      <label className="text-[10px] font-mono space-y-0.5 block">
                        <span className="text-[var(--color-text-muted)]">Plan</span>
                        <select
                          value={subForm.planId}
                          onChange={(e) => setSubForm((f) => ({ ...f, planId: e.target.value }))}
                          className="w-full px-2 py-1.5 rounded border border-[var(--surface-border)] bg-[var(--surface-panel-2)]"
                        >
                          <option value="">Automático</option>
                          {plans.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-[10px] font-mono space-y-0.5 block">
                        <span className="text-[var(--color-text-muted)]">Extender trial (días)</span>
                        <input
                          value={subForm.extendTrialDays}
                          onChange={(e) =>
                            setSubForm((f) => ({ ...f, extendTrialDays: e.target.value }))
                          }
                          className="w-full px-2 py-1.5 rounded border border-[var(--surface-border)] bg-[var(--surface-panel-2)]"
                        />
                      </label>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void saveSubscription()}
                        className="text-[10px] font-mono font-bold uppercase px-3 py-1.5 rounded bg-[var(--color-accent)] text-black"
                      >
                        Guardar suscripción
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void saveSubscription({
                            extendTrialDays: Number(subForm.extendTrialDays) || 7,
                          })
                        }
                        className="text-[10px] font-mono font-bold uppercase px-3 py-1.5 rounded border border-[var(--surface-border)]"
                      >
                        Extender trial
                      </button>
                    </div>
                  </div>
                )}

                {detailTab === 'usuarios' && (
                  <div className="space-y-3">
                    <div className="border border-[var(--surface-border)] rounded p-3 space-y-2">
                      <p className="text-[10px] font-mono font-bold uppercase">Alta usuario</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                          placeholder="Nombre"
                          value={userForm.name}
                          onChange={(e) => setUserForm((f) => ({ ...f, name: e.target.value }))}
                          className="px-2 py-1.5 text-xs rounded border border-[var(--surface-border)] bg-[var(--surface-panel-2)]"
                        />
                        <input
                          placeholder="Email"
                          value={userForm.username}
                          onChange={(e) =>
                            setUserForm((f) => ({ ...f, username: e.target.value }))
                          }
                          className="px-2 py-1.5 text-xs rounded border border-[var(--surface-border)] bg-[var(--surface-panel-2)]"
                        />
                        <input
                          placeholder="Contraseña"
                          type="password"
                          value={userForm.password}
                          onChange={(e) =>
                            setUserForm((f) => ({ ...f, password: e.target.value }))
                          }
                          className="px-2 py-1.5 text-xs rounded border border-[var(--surface-border)] bg-[var(--surface-panel-2)]"
                        />
                        <select
                          value={userForm.role}
                          onChange={(e) =>
                            setUserForm((f) => ({ ...f, role: e.target.value as UserRole }))
                          }
                          className="px-2 py-1.5 text-xs rounded border border-[var(--surface-border)] bg-[var(--surface-panel-2)]"
                        >
                          <option value={UserRole.STORE_ADMIN}>Vendedor</option>
                          <option value={UserRole.REPARTIDOR}>Repartidor</option>
                          <option value={UserRole.LOGISTICS_ADMIN}>Logística</option>
                          <option value={UserRole.SUPER_ADMIN}>Dueño agencia</option>
                        </select>
                      </div>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void createUser()}
                        className="text-[10px] font-mono font-bold uppercase px-3 py-1.5 rounded bg-[var(--color-accent)] text-black"
                      >
                        Crear usuario
                      </button>
                    </div>
                    <ul className="divide-y divide-[var(--surface-border)]/60 border border-[var(--surface-border)] rounded overflow-hidden">
                      {allUsers.map((u) => (
                        <li
                          key={u.id}
                          className="px-3 py-2 flex items-center justify-between gap-2 text-[11px]"
                        >
                          <div className="min-w-0">
                            <p className="font-semibold text-[var(--ink-soft)] truncate">
                              {u.name}{' '}
                              <span className="font-mono text-[var(--color-text-muted)]">
                                · {roleLabel(u.role)}
                              </span>
                            </p>
                            <p className="font-mono text-[10px] text-[var(--color-text-muted)] truncate">
                              {u.username}
                              {u.disabledAt ? ' · DESHABILITADO' : ''}
                            </p>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => resetPassword(u)}
                              className="text-[9px] font-mono px-1.5 py-1 rounded border border-[var(--surface-border)]"
                            >
                              Pass
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void toggleUserDisabled(u)}
                              className="text-[9px] font-mono px-1.5 py-1 rounded border border-[var(--surface-border)]"
                            >
                              {u.disabledAt ? 'Hab.' : 'Deshab.'}
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {detailTab === 'pedidos' && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-mono text-[var(--color-text-muted)]">
                      {ordersTotal} pedidos (mostrando {orders.length})
                    </p>
                    <ul className="divide-y divide-[var(--surface-border)]/60 border border-[var(--surface-border)] rounded overflow-hidden">
                      {orders.map((o) => (
                        <li key={o.id} className="px-3 py-2 text-[11px] space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-mono font-bold text-[var(--ink-soft)]">{o.id}</p>
                            <PlatformStatusBadge status={o.status} />
                          </div>
                          <p className="text-[var(--color-text-muted)] truncate">
                            {o.clientName} · {o.address}
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {[
                              OrderStatus.PENDING,
                              OrderStatus.ASSIGNED,
                              OrderStatus.DELIVERING,
                              OrderStatus.DELIVERED,
                              OrderStatus.CANCELLED,
                            ].map((st) => (
                              <button
                                key={st}
                                type="button"
                                disabled={busy || o.status === st}
                                onClick={() => void setOrderStatus(o.id, st)}
                                className="text-[8px] font-mono uppercase px-1.5 py-0.5 rounded border border-[var(--surface-border)] disabled:opacity-40"
                              >
                                {st}
                              </button>
                            ))}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {detailTab === 'zonas' && (
                  <ul className="divide-y divide-[var(--surface-border)]/60 border border-[var(--surface-border)] rounded overflow-hidden">
                    {zones.map((z) => (
                      <li key={z.id} className="px-3 py-2 text-[11px]">
                        <p className="font-semibold text-[var(--ink-soft)]">{z.name}</p>
                        <p className="font-mono text-[10px] text-[var(--color-text-muted)]">
                          {z.id}
                          {z.shippingRates
                            ? ` · flex ${z.shippingRates.flex} / express ${z.shippingRates.express} / std ${z.shippingRates.standard}`
                            : ''}
                        </p>
                      </li>
                    ))}
                    {zones.length === 0 && (
                      <li className="px-3 py-4 text-xs text-[var(--color-text-muted)]">
                        Sin zonas.
                      </li>
                    )}
                  </ul>
                )}

                {detailTab === 'precios' && (
                  <div className="space-y-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void createPriceList()}
                      className="text-[10px] font-mono font-bold uppercase px-3 py-1.5 rounded bg-[var(--color-accent)] text-black"
                    >
                      Nueva lista
                    </button>
                    <ul className="divide-y divide-[var(--surface-border)]/60 border border-[var(--surface-border)] rounded overflow-hidden">
                      {priceLists.map((p) => (
                        <li
                          key={p.id}
                          className="px-3 py-2 text-[11px] flex items-center justify-between gap-2"
                        >
                          <div>
                            <p className="font-semibold text-[var(--ink-soft)]">
                              {p.name}{' '}
                              {p.isDefault ? (
                                <span className="text-[var(--color-accent)]">· default</span>
                              ) : null}
                            </p>
                            <p className="font-mono text-[10px] text-[var(--color-text-muted)]">
                              {p.sellerCount} vendedores
                            </p>
                          </div>
                          {!p.isDefault && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void deletePriceList(p.id)}
                              className="text-[9px] font-mono px-1.5 py-1 rounded border border-[var(--color-danger)]/40 text-[var(--color-danger)]"
                            >
                              Borrar
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {detailTab === 'auditoria' && (
                  <ul className="divide-y divide-[var(--surface-border)]/60 border border-[var(--surface-border)] rounded overflow-hidden">
                    {audit.map((a) => (
                      <li key={a.id} className="px-3 py-2 text-[11px]">
                        <p className="font-mono text-[10px] text-[var(--color-text-muted)]">
                          {new Date(a.createdAt).toLocaleString('es-AR')} · {a.actorEmail} ·{' '}
                          {a.action}
                        </p>
                        <p className="text-[var(--ink-soft)]">{a.summary}</p>
                      </li>
                    ))}
                    {audit.length === 0 && (
                      <li className="px-3 py-4 text-xs text-[var(--color-text-muted)]">
                        Sin eventos.
                      </li>
                    )}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded border border-[var(--surface-border)] bg-[var(--surface-panel)] p-4 space-y-3">
            <h3 className="text-sm font-display font-bold text-[var(--ink-soft)]">
              Nueva agencia
            </h3>
            {(
              [
                ['name', 'Nombre agencia'],
                ['city', 'Ciudad'],
                ['contactEmail', 'Email contacto'],
                ['ownerName', 'Nombre dueño'],
                ['ownerEmail', 'Email dueño'],
                ['ownerPassword', 'Contraseña dueño'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="block text-[10px] font-mono space-y-0.5">
                <span className="text-[var(--color-text-muted)]">{label}</span>
                <input
                  type={key === 'ownerPassword' ? 'password' : 'text'}
                  value={createForm[key]}
                  onChange={(e) => setCreateForm((f) => ({ ...f, [key]: e.target.value }))}
                  className="w-full px-2 py-1.5 rounded border border-[var(--surface-border)] bg-[var(--surface-panel-2)]"
                />
              </label>
            ))}
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="text-[10px] font-mono px-3 py-1.5 rounded border border-[var(--surface-border)]"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void createAgency()}
                className="text-[10px] font-mono font-bold uppercase px-3 py-1.5 rounded bg-[var(--color-accent)] text-black"
              >
                Crear
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmState && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded border border-[var(--surface-border)] bg-[var(--surface-panel)] p-4 space-y-3">
            <h3 className="text-sm font-display font-bold text-[var(--ink-soft)]">
              {confirmState.title}
            </h3>
            <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
              {confirmState.message}
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setConfirmState(null)}
                className="text-[10px] font-mono px-3 py-1.5 rounded border border-[var(--surface-border)]"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  const { onConfirm } = confirmState;
                  setConfirmState(null);
                  void onConfirm();
                }}
                className={`text-[10px] font-mono font-bold uppercase px-3 py-1.5 rounded ${
                  confirmState.danger
                    ? 'bg-red-500 text-white'
                    : 'bg-[var(--color-accent)] text-black'
                }`}
              >
                {confirmState.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {promptState && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded border border-[var(--surface-border)] bg-[var(--surface-panel)] p-4 space-y-3">
            <h3 className="text-sm font-display font-bold text-[var(--ink-soft)]">
              {promptState.title}
            </h3>
            {promptState.message && (
              <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                {promptState.message}
              </p>
            )}
            <label className="block text-[10px] font-mono space-y-0.5">
              <span className="text-[var(--color-text-muted)]">{promptState.label}</span>
              <input
                autoFocus
                type={promptState.type ?? 'text'}
                value={promptValue}
                placeholder={promptState.placeholder}
                onChange={(e) => {
                  setPromptValue(e.target.value);
                  setPromptError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void submitPrompt();
                  }
                }}
                className="w-full px-2 py-1.5 rounded border border-[var(--surface-border)] bg-[var(--surface-panel-2)]"
              />
            </label>
            {promptError && (
              <p className="text-[10px] font-mono text-red-500">{promptError}</p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={closePrompt}
                className="text-[10px] font-mono px-3 py-1.5 rounded border border-[var(--surface-border)]"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void submitPrompt()}
                className={`text-[10px] font-mono font-bold uppercase px-3 py-1.5 rounded ${
                  promptState.danger
                    ? 'bg-red-500 text-white'
                    : 'bg-[var(--color-accent)] text-black'
                }`}
              >
                {promptState.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
