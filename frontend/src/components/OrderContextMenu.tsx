/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export interface ContextMenuItem {
  id: string;
  label: string;
  danger?: boolean;
  disabled?: boolean;
  separator?: boolean;
  onClick: () => void;
}

interface OrderContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export default function OrderContextMenu({ x, y, items, onClose }: OrderContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handlePointer = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      onClose();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    window.addEventListener('mousedown', handlePointer);
    window.addEventListener('scroll', onClose, true);
    window.addEventListener('keydown', handleKey);
    window.addEventListener('resize', onClose);

    return () => {
      window.removeEventListener('mousedown', handlePointer);
      window.removeEventListener('scroll', onClose, true);
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  useEffect(() => {
    const el = menuRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const padding = 8;
    let left = x;
    let top = y;

    if (left + rect.width > window.innerWidth - padding) {
      left = window.innerWidth - rect.width - padding;
    }
    if (top + rect.height > window.innerHeight - padding) {
      top = window.innerHeight - rect.height - padding;
    }

    el.style.left = `${Math.max(padding, left)}px`;
    el.style.top = `${Math.max(padding, top)}px`;
  }, [x, y, items]);

  const actionable = items.filter((item) => !item.separator);

  if (actionable.length === 0) return null;

  return createPortal(
    <div
      ref={menuRef}
      style={{ left: x, top: y }}
      className="fixed z-[9999] min-w-[11rem] py-1 rounded-lg border border-zinc-700 bg-zinc-950 shadow-2xl shadow-black/50"
      role="menu"
    >
      {items.map((item) =>
        item.separator ? (
          <div key={item.id} className="my-1 border-t border-zinc-800" />
        ) : (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              if (item.disabled) return;
              item.onClick();
              onClose();
            }}
            className={[
              'w-full text-left px-3 py-2 text-[11px] font-medium transition',
              item.disabled
                ? 'text-zinc-600 cursor-not-allowed'
                : item.danger
                  ? 'text-red-400 hover:bg-red-950/40 hover:text-red-300'
                  : 'text-zinc-200 hover:bg-zinc-800 hover:text-white',
            ].join(' ')}
          >
            {item.label}
          </button>
        )
      )}
    </div>,
    document.body
  );
}
