/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  createContext,
  useCallback,
  useContext,
  useState,
  ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, CheckCircle2, Info, XCircle, X } from 'lucide-react';

export type AlertVariant = 'info' | 'success' | 'error' | 'warning';
export type ConfirmVariant = 'default' | 'danger' | 'warning';

export interface AlertOptions {
  title: string;
  message: string;
  variant?: AlertVariant;
  confirmText?: string;
}

export interface ConfirmOptions {
  title: string;
  message: string;
  variant?: ConfirmVariant;
  confirmText?: string;
  cancelText?: string;
}

interface ModalContextValue {
  alert: (options: AlertOptions) => Promise<void>;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ModalContext = createContext<ModalContextValue | null>(null);

type ActiveModal =
  | { kind: 'alert'; options: AlertOptions; resolve: () => void }
  | { kind: 'confirm'; options: ConfirmOptions; resolve: (value: boolean) => void };

const ALERT_STYLES: Record<
  AlertVariant,
  { icon: typeof Info; iconClass: string; borderClass: string }
> = {
  info: { icon: Info, iconClass: 'text-[var(--color-accent)] bg-[var(--color-accent)]/10 border-[var(--color-accent)]/20', borderClass: 'border-[var(--surface-border)]' },
  success: { icon: CheckCircle2, iconClass: 'text-[var(--color-ok)] bg-[var(--color-ok)]/10 border-[var(--color-ok)]/20', borderClass: 'border-[var(--color-ok)]/30' },
  error: { icon: XCircle, iconClass: 'text-[var(--color-danger)] bg-[var(--color-danger)]/10 border-[var(--color-danger)]/20', borderClass: 'border-[var(--color-danger)]/30' },
  warning: { icon: AlertTriangle, iconClass: 'text-[var(--color-warn)] bg-[var(--color-warn)]/10 border-[var(--color-warn)]/20', borderClass: 'border-[var(--color-warn)]/30' },
};

const CONFIRM_STYLES: Record<ConfirmVariant, { icon: typeof Info; iconClass: string; btnClass: string }> = {
  default: {
    icon: Info,
    iconClass: 'text-[var(--color-accent)] bg-[var(--color-accent)]/10 border-[var(--color-accent)]/20',
    btnClass: 'btn-primary',
  },
  danger: {
    icon: AlertTriangle,
    iconClass: 'text-[var(--color-danger)] bg-[var(--color-danger)]/10 border-[var(--color-danger)]/20',
    btnClass: 'btn-primary',
  },
  warning: {
    icon: AlertTriangle,
    iconClass: 'text-[var(--color-warn)] bg-[var(--color-warn)]/10 border-[var(--color-warn)]/20',
    btnClass: 'btn-primary',
  },
};

function ModalOverlay({
  modal,
  onClose,
}: {
  modal: ActiveModal;
  onClose: (result?: boolean) => void;
}) {
  const isAlert = modal.kind === 'alert';
  const variant = isAlert
    ? (modal.options.variant ?? 'info')
    : (modal.options.variant ?? 'default');
  const styles = isAlert ? ALERT_STYLES[variant as AlertVariant] : CONFIRM_STYLES[variant as ConfirmVariant];
  const Icon = styles.icon;

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="modal-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm"
        onClick={() => onClose(false)}
      >
        <motion.div
          role="dialog"
          aria-modal="true"
          initial={{ opacity: 0, scale: 0.95, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: 4 }}
          transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
          className={`relative w-full max-w-md rounded-[var(--radius-posta)] border bg-[var(--surface-panel)] shadow-2xl ${
            isAlert ? ALERT_STYLES[variant as AlertVariant].borderClass : 'border-[var(--surface-border)]'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => onClose(false)}
            className="absolute top-3 right-3 p-1 rounded-[var(--radius-posta)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--surface-panel-2)] transition"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="p-5 pt-6">
            <div className="flex gap-4">
              <div
                className={`shrink-0 w-10 h-10 rounded-2xl border flex items-center justify-center ${styles.iconClass}`}
              >
                <Icon className="w-5 h-5" />
              </div>
              <div className="min-w-0 pr-6">
                <h2 className="text-sm font-display font-bold text-[var(--color-text)] leading-snug">
                  {modal.options.title}
                </h2>
                <p className="mt-2 text-[13px] text-[var(--color-text-muted)] leading-relaxed whitespace-pre-wrap">
                  {modal.options.message}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[var(--surface-border)] bg-[var(--surface-panel-2)]/80 rounded-b-[var(--radius-posta)]">
            {!isAlert && (
              <button
                type="button"
                onClick={() => onClose(false)}
                className="btn-secondary px-4 py-2"
              >
                {(modal.options as ConfirmOptions).cancelText ?? 'Cancelar'}
              </button>
            )}
            <button
              type="button"
              autoFocus
              onClick={() => onClose(true)}
              className={[
                'px-4 py-2 rounded-[var(--radius-posta)] text-xs font-mono font-bold uppercase tracking-wider transition',
                isAlert ? 'btn-primary' : (styles as (typeof CONFIRM_STYLES)[ConfirmVariant]).btnClass,
              ].join(' ')}
            >
              {isAlert
                ? (modal.options as AlertOptions).confirmText ?? 'Entendido'
                : (modal.options as ConfirmOptions).confirmText ?? 'Confirmar'}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}

export function ModalProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<ActiveModal | null>(null);

  const alert = useCallback((options: AlertOptions) => {
    return new Promise<void>((resolve) => {
      setActive({ kind: 'alert', options, resolve });
    });
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setActive({ kind: 'confirm', options, resolve });
    });
  }, []);

  const handleClose = (result?: boolean) => {
    if (!active) return;
    if (active.kind === 'alert') {
      active.resolve();
    } else {
      active.resolve(result === true);
    }
    setActive(null);
  };

  return (
    <ModalContext.Provider value={{ alert, confirm }}>
      {children}
      {active && <ModalOverlay modal={active} onClose={handleClose} />}
    </ModalContext.Provider>
  );
}

export function useModal(): ModalContextValue {
  const ctx = useContext(ModalContext);
  if (!ctx) {
    throw new Error('useModal debe usarse dentro de ModalProvider');
  }
  return ctx;
}
