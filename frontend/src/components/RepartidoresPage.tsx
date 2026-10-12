/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import type { User } from '../types.js';
import { getDeliveryZone, type DeliveryZone } from '../config/deliveryZones.js';
import RepartidorProfilePanel from './RepartidorProfilePanel.tsx';

interface RepartidoresPageProps {
  token: string;
  repartidores: User[];
  deliveryZones?: DeliveryZone[];
}

export default function RepartidoresPage({
  token,
  repartidores,
  deliveryZones = [],
}: RepartidoresPageProps) {
  const [selectedId, setSelectedId] = useState<string | null>(repartidores[0]?.id ?? null);

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
            {repartidores.length} activo{repartidores.length === 1 ? '' : 's'} · pedidos y etiquetas
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
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
      <div className="min-h-0 min-w-0 flex-1">
        {selectedId ? (
          <RepartidorProfilePanel token={token} repartidorId={selectedId} embedded />
        ) : (
          <p className="px-6 py-10 text-sm text-[var(--color-text-muted)]">Elegí un repartidor para ver sus pedidos.</p>
        )}
      </div>
    </div>
  );
}
