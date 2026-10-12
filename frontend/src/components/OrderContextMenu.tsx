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
    <>
      <div
        className="fixed inset-0 z-[10040]"
        onMouseDown={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        ref={menuRef}
        style={{
          position: 'fixed',
          left: x,
          top: y,
          zIndex: 10050,
          width: 'max-content',
          minWidth: '13.5rem',
          maxWidth: '18rem',
          maxHeight: 'min(70vh, 28rem)',
          overflowY: 'auto',
          background: 'var(--surface-panel, #1c1814)',
        }}
        className="py-1 rounded-[5px] border border-[var(--surface-border)] shadow-2xl"
        role="menu"
      >
        {items.map((item) =>
          item.separator ? (
            <div key={item.id} className="my-1 border-t border-[var(--surface-border)]" />
          ) : (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => {
                if (item.disabled) return;
                item.onClick();
                onClose();
              }}
              className={[
                'block w-full text-left whitespace-nowrap px-3 py-2 text-[11px] font-medium transition font-mono',
                item.disabled
                  ? 'text-[var(--color-text-faint)] cursor-not-allowed'
                  : item.danger
                    ? 'text-[var(--color-danger)] hover:bg-[var(--color-danger)]/15'
                    : 'text-[var(--color-text)] hover:bg-[var(--surface-panel-2)]',
              ].join(' ')}
            >
              {item.label}
            </button>
          )
        )}
      </div>
    </>,
    document.body
  );
}
