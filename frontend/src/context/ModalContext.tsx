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
import { ui } from '../styles/ui.ts';

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
  info: { icon: Info, iconClass: 'text-violet-600 bg-violet-50 border-violet-200', borderClass: 'border-[var(--lupo-border)]' },
  success: { icon: CheckCircle2, iconClass: 'text-emerald-600 bg-emerald-50 border-emerald-200', borderClass: 'border-emerald-200' },
  error: { icon: XCircle, iconClass: 'text-red-600 bg-red-50 border-red-200', borderClass: 'border-red-200' },
  warning: { icon: AlertTriangle, iconClass: 'text-amber-600 bg-amber-50 border-amber-200', borderClass: 'border-amber-200' },
};

const CONFIRM_STYLES: Record<ConfirmVariant, { icon: typeof Info; iconClass: string; btnClass: string }> = {
  default: {
    icon: Info,
    iconClass: 'text-violet-600 bg-violet-50 border-violet-200',
    btnClass: 'lupo-btn lupo-btn--primary',
  },
  danger: {
    icon: AlertTriangle,
    iconClass: 'text-red-600 bg-red-50 border-red-200',
    btnClass: 'lupo-btn lupo-btn--danger',
  },
  warning: {
    icon: AlertTriangle,
    iconClass: 'text-amber-600 bg-amber-50 border-amber-200',
    btnClass: 'lupo-btn lupo-btn--primary',
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
        className={ui.modalBackdrop}
        onClick={() => onClose(false)}
      >
        <motion.div
          role="dialog"
          aria-modal="true"
          initial={{ opacity: 0, scale: 0.95, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: 4 }}
          transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
          className={ui.modal}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => onClose(false)}
            className="absolute top-3 right-3 p-1 rounded-md text-[var(--lupo-text-muted)] hover:text-[var(--lupo-text)] hover:bg-white/5 transition"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="p-5 pt-6">
            <div className="flex gap-4">
              <div
                className={`shrink-0 w-10 h-10 rounded-lg border flex items-center justify-center ${styles.iconClass}`}
              >
                <Icon className="w-5 h-5" />
              </div>
              <div className="min-w-0 pr-6">
                <h2 className="text-sm font-semibold text-[var(--lupo-text)] leading-snug">
                  {modal.options.title}
                </h2>
                <p className="mt-2 text-[13px] text-[var(--lupo-text-secondary)] leading-relaxed whitespace-pre-wrap">
                  {modal.options.message}
                </p>
              </div>
            </div>
          </div>

          <div className={ui.modalFooter}>
            {!isAlert && (
              <button
                type="button"
                onClick={() => onClose(false)}
                className={ui.btnSecondary}
              >
                {(modal.options as ConfirmOptions).cancelText ?? 'Cancelar'}
              </button>
            )}
            <button
              type="button"
              autoFocus
              onClick={() => onClose(true)}
              className={[
                isAlert ? ui.btnPrimary : (styles as (typeof CONFIRM_STYLES)[ConfirmVariant]).btnClass,
                'lupo-btn',
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
