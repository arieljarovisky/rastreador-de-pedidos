/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ReactNode } from 'react';

const SIDEBAR_WIDTH = '18rem'; // 288px — ancho fijo del panel

interface NotifsSidebarProps {
  open: boolean;
  mobileShow: boolean;
  children: ReactNode;
}

export default function NotifsSidebar({ open, mobileShow, children }: NotifsSidebarProps) {
  const showOnDesktop = open;

  // Vista móvil: pestaña Alertas a pantalla completa
  if (mobileShow) {
    return (
      <aside className="flex flex-1 min-h-0 w-full h-full overflow-hidden xl:hidden">
        {children}
      </aside>
    );
  }

  // Escritorio: ancho animado, sin reservar espacio cuando está cerrado
  return (
    <aside
      aria-hidden={!showOnDesktop}
      style={{ width: showOnDesktop ? SIDEBAR_WIDTH : 0 }}
      className={[
        'hidden xl:block h-full shrink-0 overflow-hidden',
        'transition-[width,opacity] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
        showOnDesktop ? 'opacity-100' : 'opacity-0 pointer-events-none',
      ].join(' ')}
    >
      <div
        style={{ width: SIDEBAR_WIDTH }}
        className={[
          'h-full flex flex-col',
          'transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
          showOnDesktop ? 'translate-x-0' : 'translate-x-4',
        ].join(' ')}
      >
        {children}
      </div>
    </aside>
  );
}
