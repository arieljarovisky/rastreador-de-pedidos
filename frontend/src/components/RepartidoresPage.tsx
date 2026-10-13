/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { lazy, Suspense, useEffect, useState } from 'react';
import { Bike, ClipboardList, Wallet } from 'lucide-react';
import type { User } from '../types.js';
import { getDeliveryZone, type DeliveryZone } from '../config/deliveryZones.js';
import RepartidorProfilePanel from './RepartidorProfilePanel.tsx';

const DriverSettlementPage = lazy(() => import('./DriverSettlementPage.tsx'));

interface RepartidoresPageProps {
  token: string;
  user: User;
  repartidores: User[];
  deliveryZones?: DeliveryZone[];
}

type MainTab = 'pedidos' | 'liquidacion';

export default function RepartidoresPage({
  token,
  user,
  repartidores,
  deliveryZones = [],
}: RepartidoresPageProps) {
  const [selectedId, setSelectedId] = useState<string | null>(repartidores[0]?.id ?? null);
  const [mainTab, setMainTab] = useState<MainTab>('pedidos');

  useEffect(() => {
    if (selectedId && repartidores.some((rep) => rep.id === selectedId)) return;
    setSelectedId(repartidores[0]?.id ?? null);
  }, [repartidores, selectedId]);

  return (
    <div className="flex min-h-[calc(100dvh-8rem)] w-full flex-col overflow-hidden rounded-[6px] border border-[var(--surface-border)] bg-[var(--surface-panel)] xl:min-h-[calc(100dvh-6rem)] xl:flex-row">
      <aside className="flex max-h-64 shrink-0 flex-col border-b border-[var(--surface-border)] xl:max-h-none xl:w-72 xl:border-b-0 xl:border-r">
        <div className="border-b border-[var(--surface-border)] px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-accent)]">Flota</p>
          <h1 className="mt-1 text-lg font-medium">Repartidores</h1>
          <p className="text-xs text-[var(--color-text-muted)]">
            {repartidores.length} activo{repartidores.length === 1 ? '' : 's'} · pedidos y liquidación
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {mainTab === 'liquidacion' && (
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className={`mb-1 w-full rounded-[var(--radius-posta)] px-3 py-2 text-left ${
                selectedId === null
                  ? 'bg-[var(--color-accent)]/10 text-[var(--color-text)]'
                  : 'hover:bg-[var(--surface-panel-2)]'
              }`}
            >
              <p className="truncate text-sm font-medium">Toda la flota</p>
              <p className="truncate text-[11px] text-[var(--color-text-muted)]">
                Resumen de liquidación
              </p>
            </button>
          )}
          {repartidores.length === 0 ? (
            <p className="px-2 py-4 text-sm text-[var(--color-text-muted)]">
              Todavía no hay repartidores. Crealos en Ajustes.
            </p>
          ) : (
            <ul className="space-y-1">
              {repartidores.map((rep) => {
                const zone = getDeliveryZone(deliveryZones, rep.deliveryZone);
                const active = rep.id === selectedId;
                return (
                  <li key={rep.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(rep.id)}
                      className={`w-full rounded-[var(--radius-posta)] px-3 py-2 text-left ${
                        active
                          ? 'bg-[var(--color-accent)]/10 text-[var(--color-text)]'
                          : 'hover:bg-[var(--surface-panel-2)]'
                      }`}
                    >
                      <p className="truncate text-sm font-medium">{rep.name}</p>
                      <p className="truncate text-[11px] text-[var(--color-text-muted)]">
                        @{rep.username}
                        {zone ? ` · ${zone.name}` : ''}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 gap-1 border-b border-[var(--surface-border)] bg-[var(--surface-panel-2)]/40 p-2">
          <button
            type="button"
            onClick={() => {
              setMainTab('pedidos');
              if (!selectedId && repartidores[0]) setSelectedId(repartidores[0].id);
            }}
            className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-[5px] border px-3 py-1.5 text-[10px] font-mono font-bold uppercase tracking-wider transition ${
              mainTab === 'pedidos'
                ? 'border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10 text-[var(--color-accent)]'
                : 'border-[var(--surface-border)] bg-[var(--surface-panel-2)] text-[var(--color-text-muted)] hover:text-[var(--ink-soft)]'
            }`}
          >
            <ClipboardList className="size-3.5" />
            Pedidos
          </button>
          <button
            type="button"
            onClick={() => setMainTab('liquidacion')}
            className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-[5px] border px-3 py-1.5 text-[10px] font-mono font-bold uppercase tracking-wider transition ${
              mainTab === 'liquidacion'
                ? 'border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10 text-[var(--color-accent)]'
                : 'border-[var(--surface-border)] bg-[var(--surface-panel-2)] text-[var(--color-text-muted)] hover:text-[var(--ink-soft)]'
            }`}
          >
            <Wallet className="size-3.5" />
            Liquidación
          </button>
        </div>

        <div className="min-h-0 flex-1">
          {mainTab === 'pedidos' ? (
            selectedId ? (
              <RepartidorProfilePanel token={token} repartidorId={selectedId} embedded />
            ) : (
              <p className="px-6 py-10 text-sm text-[var(--color-text-muted)]">
                Elegí un repartidor para ver sus pedidos.
              </p>
            )
          ) : (
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center gap-2 text-[var(--color-text-muted)]">
                  <Bike className="size-4 animate-pulse" />
                  <span className="text-xs font-mono">Cargando liquidación…</span>
                </div>
              }
            >
              <DriverSettlementPage
                token={token}
                user={user}
                repartidores={repartidores.map((r) => ({ id: r.id, name: r.name }))}
                lockedRepartidorId={selectedId ?? ''}
                embedded
              />
            </Suspense>
          )}
        </div>
      </div>
    </div>
  );
}
