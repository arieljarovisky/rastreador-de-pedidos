/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Order, OrderStatus, User, UserRole } from '../types.js';
import SellerOrdersRegistry from './SellerOrdersRegistry.tsx';

interface RegistroPageProps {
  token: string;
  orders: Order[];
  sellers: User[];
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
  userRole,
  initialSellerId = null,
  onUpdateOrderStatus,
  onSelectOrder,
}: RegistroPageProps) {
  return (
    <div className="w-full flex flex-col posta-surface">
      <SellerOrdersRegistry
        token={token}
        orders={orders}
        sellers={sellers}
        userRole={userRole}
        initialSellerId={initialSellerId}
        onUpdateOrderStatus={onUpdateOrderStatus}
        onSelectOrder={onSelectOrder}
      />
    </div>
  );
}
