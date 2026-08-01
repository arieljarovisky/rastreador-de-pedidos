/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { Order, OrderStatus, User, UserRole } from '../types.js';
import SellerOrdersRegistry from './SellerOrdersRegistry.tsx';
import AgencyDriverScanPage from './AgencyDriverScanPage.tsx';

type RegistroTab = 'envios' | 'personales';

interface RegistroPageProps {
  token: string;
  orders: Order[];
  sellers: User[];
  repartidores: Array<{ id: string; name: string }>;
  userRole: UserRole;
  initialSellerId?: string | null;
  onUpdateOrderStatus: (
    orderId: string,
    status: OrderStatus,
    repartidorId?: string,
    comment?: string
  ) => Promise<void>;
  onSelectOrder?: (orderId: string) => void;
}

export default function RegistroPage({
  token,
  orders,
  sellers,
  repartidores,
  userRole,
  initialSellerId = null,
  onUpdateOrderStatus,
  onSelectOrder,
}: RegistroPageProps) {
  const [tab, setTab] = useState<RegistroTab>('envios');

  return (
    <div className="h-full flex flex-col min-h-0 overflow-hidden posta-surface">
      <div className="shrink-0 flex gap-1 p-2 border-b border-[var(--surface-border)] bg-[var(--surface-panel-2)]/40">
        <button
          type="button"
          onClick={() => setTab('envios')}
          className={`flex-1 px-3 py-1.5 rounded-[5px] border text-[10px] font-mono font-bold uppercase tracking-wider transition ${
            tab === 'envios'
              ? 'border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10 text-[var(--color-accent)]'
              : 'border-[var(--surface-border)] bg-[var(--surface-panel-2)] text-[var(--color-text-muted)] hover:text-[var(--ink-soft)]'
          }`}
        >
          Envíos Posta
        </button>
        <button
          type="button"
          onClick={() => setTab('personales')}
          className={`flex-1 px-3 py-1.5 rounded-[5px] border text-[10px] font-mono font-bold uppercase tracking-wider transition ${
            tab === 'personales'
              ? 'border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10 text-[var(--color-accent)]'
              : 'border-[var(--surface-border)] bg-[var(--surface-panel-2)] text-[var(--color-text-muted)] hover:text-[var(--ink-soft)]'
          }`}
        >
          Paquetes personales
        </button>
      </div>

      <div className="flex-1 min-h-0">
        {tab === 'envios' ? (
          <SellerOrdersRegistry
            orders={orders}
            sellers={sellers}
            userRole={userRole}
            initialSellerId={initialSellerId}
            onUpdateOrderStatus={onUpdateOrderStatus}
            onSelectOrder={onSelectOrder}
          />
        ) : (
          <AgencyDriverScanPage token={token} repartidores={repartidores} />
        )}
      </div>
    </div>
  );
}
