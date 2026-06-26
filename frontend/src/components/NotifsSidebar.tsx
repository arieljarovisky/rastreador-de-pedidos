/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ReactNode } from 'react';
import { motion } from 'motion/react';

interface NotifsSidebarProps {
  open: boolean;
  mobileShow: boolean;
  children: ReactNode;
}

export default function NotifsSidebar({ open, mobileShow, children }: NotifsSidebarProps) {
  const visibleOnDesktop = open;

  return (
    <aside
      aria-hidden={!mobileShow && !visibleOnDesktop}
      className={[
        'flex-col h-full overflow-hidden shrink-0',
        'transition-[width,opacity,transform,margin] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
        mobileShow ? 'flex flex-1 min-h-0 w-full' : 'hidden',
        'xl:flex xl:min-h-0 xl:overflow-hidden',
        visibleOnDesktop
          ? 'xl:w-[min(25%,20rem)] xl:opacity-100 xl:translate-x-0 xl:ml-0'
          : 'xl:w-0 xl:opacity-0 xl:translate-x-6 xl:pointer-events-none xl:ml-0',
      ].join(' ')}
    >
      <motion.div
        initial={false}
        animate={{
          opacity: visibleOnDesktop || mobileShow ? 1 : 0,
          x: visibleOnDesktop || mobileShow ? 0 : 16,
        }}
        transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
        className={[
          'h-full flex flex-col',
          mobileShow ? 'w-full' : 'w-[min(25%,20rem)]',
          visibleOnDesktop || mobileShow ? 'min-w-[16rem]' : 'min-w-0',
        ].join(' ')}
      >
        {children}
      </motion.div>
    </aside>
  );
}
