/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AppNotification, Order } from '../types.js';
import { Bell, ShieldAlert, Check, CheckCheck, Trash2, X, Volume2, ChevronRight, MapPin, Bike, Clock, AlertTriangle, Siren, Megaphone } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useModal } from '../context/ModalContext.tsx';
import { getUndeliveredTodayOrders } from '../utils/deliverySummary.js';

const UNDELIVERED_PREVIEW = 3;

/** Quita emojis/símbolos al inicio del título (quedan en push históricos). */
function stripLeadingEmoji(text: string): string {
  return text
    .replace(
      /^(?:[\uFE0F\u200D\uFE0E]|\p{Extended_Pictographic}|\p{Emoji_Component}|\p{So})+\s*/gu,
      ''
    )
    .trim();
}

function NotificationTypeLabel({
  type,
  read,
}: {
  type: AppNotification['type'];
  read: boolean;
}) {
  const muted = read ? 'text-[var(--color-text-faint)]' : null;
  const base = 'inline-flex items-center gap-1 font-semibold';

  switch (type) {
    case 'order_assigned':
      return (
        <span className={`${base} ${muted ?? 'text-[var(--color-accent)]'}`}>
          <Bike className="w-3 h-3 shrink-0" aria-hidden />
          Asignación
        </span>
      );
    case 'order_delivered':
      return (
        <span className={`${base} ${muted ?? 'text-[var(--color-ok)]'}`}>
          <Check className="w-3 h-3 shrink-0" aria-hidden />
          Entregado
        </span>
      );
    case 'deadline_warning':
      return (
        <span className={`${base} ${muted ?? 'text-[var(--color-warn)]'}`}>
          <Clock className="w-3 h-3 shrink-0" aria-hidden />
          Corte
        </span>
      );
    case 'deadline_urgent':
      return (
        <span className={`${base} ${muted ?? 'text-[var(--color-warn)]'}`}>
          <AlertTriangle className="w-3 h-3 shrink-0" aria-hidden />
          Urgente
        </span>
      );
    case 'deadline_missed':
      return (
        <span className={`${base} ${muted ?? 'text-[var(--color-danger)]'}`}>
          <Siren className="w-3 h-3 shrink-0" aria-hidden />
          Fuera de plazo
        </span>
      );
    default:
      return (
        <span className={`${base} ${muted ?? 'text-[var(--color-accent)]'}`}>
          <Megaphone className="w-3 h-3 shrink-0" aria-hidden />
          Info
        </span>
      );
  }
}

interface NotificationHubProps {
  notifications: AppNotification[];
  onMarkAllRead: () => void;
  onClearNotifications?: () => void;
  activeUserId: string;
  onToggleCollapse?: () => void;
  showCollapseButton?: boolean;
  orders?: Order[];
  onOpenOrder?: (orderId: string) => void;
  onOpenMap?: () => void;
}

function isDeadlineNotification(type: AppNotification['type']): boolean {
  return (
    type === 'deadline_warning' ||
    type === 'deadline_urgent' ||
    type === 'deadline_missed'
  );
}

// Sonido de notificación sintetizado mediante Web Audio API para no necesitar un archivo de audio externo
export function playNotificationSound() {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Crear notas armónicas elegantes (un acorde ascendente rápido)
    const playNote = (freq: number, start: number, duration: number) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);
      
      gain.gain.setValueAtTime(0.15, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
      
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      
      osc.start(start);
      osc.stop(start + duration);
    };

    const now = audioCtx.currentTime;
    playNote(587.33, now, 0.15); // D5
    playNote(880.00, now + 0.08, 0.25); // A5
  } catch (e) {
    console.warn('AudioContext no soportado o bloqueado por el navegador:', e);
  }
}

export default function NotificationHub({
  notifications,
  onMarkAllRead,
  onClearNotifications,
  activeUserId,
  onToggleCollapse,
  showCollapseButton = false,
  orders = [],
  onOpenOrder,
  onOpenMap,
}: NotificationHubProps) {
  const { alert: showAlert, confirm } = useModal();
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [activeBanner, setActiveBanner] = useState<AppNotification | null>(null);

  const undeliveredToday = useMemo(
    () => getUndeliveredTodayOrders(orders),
    [orders]
  );

  useEffect(() => {
    if ('Notification' in window) {
      setPermission(Notification.permission);
    }
  }, []);

  // Escuchar nuevas notificaciones para disparar efectos visuales y sonoros
  useEffect(() => {
    if (notifications.length > 0) {
      const latest = notifications[0];
      const isRecent = (Date.now() - new Date(latest.createdAt).getTime()) < 5000;
      
      if (isRecent && latest.userId !== 'all_read') {
        // Mostrar banner flotante en pantalla
        setActiveBanner(latest);
        playNotificationSound();

        // Mostrar notificación de navegador nativa si tiene permiso
        if ('Notification' in window && Notification.permission === 'granted') {
          try {
            new window.Notification(latest.title, {
              body: latest.body,
              icon: '/icon-posta.svg',
            });
          } catch (err) {
            // Algunos navegadores requieren service worker para notificaciones push
            navigator.serviceWorker.ready.then((reg) => {
              reg.showNotification(latest.title, {
                body: latest.body,
                icon: '/icon-posta.svg',
              });
            });
          }
        }

        // Descartar banner en 5 segundos
        const timer = setTimeout(() => {
          setActiveBanner(null);
        }, 5000);
        return () => clearTimeout(timer);
      }
    }
  }, [notifications]);

  const requestPermission = async () => {
    if (!('Notification' in window)) {
      void showAlert({
        title: 'No compatible',
        message: 'Las notificaciones del sistema no están soportadas en este navegador.',
        variant: 'warning',
      });
      return;
    }
    try {
      const status = await window.Notification.requestPermission();
      setPermission(status);
      if (status === 'granted') {
        playNotificationSound();
        new window.Notification('¡Posta!', {
          body: 'Notificaciones push del sistema activadas correctamente.',
          icon: '/icon-posta.svg',
        });
      }
    } catch (e) {
      console.error('Error solicitando permisos de notificación:', e);
    }
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  const toastBanner =
    typeof document !== 'undefined'
      ? createPortal(
          <AnimatePresence>
            {activeBanner && (
              <motion.div
                initial={{ opacity: 0, y: -16, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -12, scale: 0.96 }}
                id="notification-banner-alert"
                role="alert"
                className="fixed z-[10050] top-[7.25rem] lg:top-20 right-4 left-4 sm:left-auto sm:w-full sm:max-w-sm pointer-events-auto bg-[var(--surface-panel)] border text-[var(--color-text)] rounded-[var(--radius-posta)] p-4 shadow-[0_12px_40px_rgba(0,0,0,0.45)] backdrop-blur-md flex items-start gap-3 ${
                  activeBanner.type === 'deadline_missed'
                    ? 'border-[var(--color-danger)]/40'
                    : activeBanner.type === 'deadline_warning'
                      ? 'border-[var(--color-warn)]/40'
                      : activeBanner.type === 'deadline_urgent'
                        ? 'border-orange-500/40'
                        : 'border-[var(--color-warn)]/40'
                }"
              >
                <div className="w-10 h-10 rounded-full bg-[var(--color-warn)]/15 flex items-center justify-center text-[var(--color-warn)] shrink-0 border border-[var(--color-warn)]/25">
                  <Bell className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono tracking-wider text-[var(--color-warn)] font-bold uppercase">
                      Nueva alerta
                    </span>
                    <span className="text-[9px] text-[var(--color-text-muted)] ml-auto font-mono">Ahora</span>
                  </div>
                  <h4 className="font-bold text-sm text-[var(--ink-soft)] mt-0.5">
                    {stripLeadingEmoji(activeBanner.title)}
                  </h4>
                  <p className="text-xs text-[var(--color-text-muted)] mt-1 leading-relaxed line-clamp-3">
                    {activeBanner.body}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveBanner(null)}
                  className="text-[var(--color-text-muted)] hover:text-[var(--ink-soft)] p-1 rounded-[var(--radius-posta)] hover:bg-[var(--surface-panel-2)] transition shrink-0"
                  aria-label="Cerrar alerta"
                >
                  <X className="w-4 h-4" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )
      : null;

  return (
    <div className="h-full w-full flex flex-col min-h-0">
      {toastBanner}
      {/* Widget lateral de Configuración de Notificaciones PWA (HIGH DENSITY) */}
      <div className="bg-[var(--surface-panel)]/80 border border-[var(--surface-border)] rounded-[var(--radius-posta)] backdrop-blur-sm flex flex-col flex-1 overflow-hidden" id="pwa-notification-config">
        {showCollapseButton && onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            title="Ocultar panel de alertas"
            className="hidden xl:flex items-center justify-center gap-1.5 w-full py-1.5 border-b border-[var(--surface-border)] bg-[var(--surface-panel-2)]/60 text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] hover:text-[var(--ink-soft)] hover:bg-[var(--surface-panel-2)] transition shrink-0"
          >
            <ChevronRight className="w-3.5 h-3.5" />
            Ocultar panel
          </button>
        )}

        <div className="p-3.5 flex flex-col flex-1 overflow-hidden min-h-0">
        <div className="flex items-center gap-2 mb-3 shrink-0">
          <div className="w-8 h-8 rounded bg-blue-500/10 border border-[var(--color-accent)]/20 flex items-center justify-center text-[var(--color-accent)]">
            <Bell className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-bold text-xs lg:text-sm text-[var(--ink-soft)]">Notificaciones PWA</h3>
            <p className="text-[10px] text-[var(--color-text-muted)] font-mono">Estado: {permission === 'granted' ? 'PERMITIDO' : permission === 'denied' ? 'DENEGADO' : 'PENDIENTE'}</p>
          </div>
          <div className="ml-auto flex items-center gap-0.5">
            <button
              onClick={playNotificationSound}
              title="Probar sonido de timbre"
              className="text-[var(--color-text-muted)] hover:text-[var(--color-accent)] p-1.5 rounded hover:bg-[var(--surface-panel)] transition"
            >
              <Volume2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {permission !== 'granted' ? (
          <div className="bg-[var(--surface-panel-2)] border border-[var(--surface-border)] rounded p-2.5 mb-3 shrink-0">
            <div className="flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--ink-soft)]">Permiso requerido</p>
                <p className="text-[9px] text-[var(--color-text-muted)] mt-0.5 leading-normal">
                  Activa alertas nativas para recibir avisos de pedidos en tiempo real.
                </p>
                <button
                  onClick={requestPermission}
                  id="btn-request-notifications"
                  className="mt-2 w-full text-center py-1 bg-[var(--color-cta)] hover:brightness-110 text-[#F6F0E4] font-mono font-bold text-[9px] uppercase tracking-wider rounded-[5px] transition"
                >
                  Activar Alertas
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 bg-emerald-500/5 border border-emerald-500/20 rounded p-2 text-[var(--color-ok)] text-[10px] font-medium mb-3 shrink-0 leading-normal">
            <CheckCheck className="w-4 h-4 text-[var(--color-ok)] shrink-0" />
            <span>Suscripción PWA activa. Alertas instantáneas configuradas.</span>
          </div>
        )}

        {/* Listado de últimas notificaciones del usuario */}
        <div className="border-t border-[var(--surface-border)]/80 pt-3 flex flex-col flex-1 overflow-hidden">
          <div className="flex items-center justify-between mb-2 shrink-0">
            <span className="text-[9px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider font-mono">Buzón de Alertas ({unreadCount})</span>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={onMarkAllRead}
                  className="text-[9px] text-[var(--color-accent)] hover:text-[var(--color-accent)] flex items-center gap-0.5 font-bold uppercase tracking-wider"
                >
                  <Check className="w-3 h-3" /> Marcar leídas
                </button>
              )}
              {notifications.length > 0 && onClearNotifications && (
                <button
                  type="button"
                  onClick={async () => {
                    const ok = await confirm({
                      title: 'Limpiar notificaciones',
                      message: '¿Vaciar el buzón de alertas? Las notificaciones personales se eliminan y las generales dejan de mostrarse para tu cuenta.',
                      variant: 'danger',
                      confirmText: 'Limpiar',
                      cancelText: 'Cancelar',
                    });
                    if (ok) onClearNotifications();
                  }}
                  className="text-[9px] text-[var(--color-danger)] hover:text-red-300 flex items-center gap-0.5 font-bold uppercase tracking-wider"
                >
                  <Trash2 className="w-3 h-3" /> Limpiar
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 scrollbar-thin scrollbar-thumb-zinc-800">
            {notifications.length === 0 ? (
              <div className="text-center py-8 text-[10px] text-[var(--color-text-muted)] font-mono">
                No hay notificaciones recientes.
              </div>
            ) : (
              notifications.map((notif) => (
                <div
                  key={notif.id}
                  className={`p-2 rounded text-[11px] border transition ${
                    notif.read
                      ? 'bg-[var(--surface-panel-2)]/20 border-zinc-900/50 text-[var(--color-text-muted)]'
                      : 'bg-[var(--surface-panel-2)] border-[var(--surface-border)]/80 text-[var(--ink-soft)]'
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-[10px]">
                    <NotificationTypeLabel type={notif.type} read={notif.read} />
                    <span className="text-[9px] text-[var(--color-text-muted)] ml-auto font-mono">
                      {new Date(notif.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <h5 className="font-bold mt-0.5">{stripLeadingEmoji(notif.title)}</h5>
                  <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5 leading-relaxed">{notif.body}</p>
                  {isDeadlineNotification(notif.type) && onOpenOrder && (
                    <div className="mt-1.5 space-y-1">
                      {undeliveredToday.length === 0 ? (
                        <p className="text-[9px] font-mono text-[var(--color-ok)]">
                          No quedan pedidos sin entregar hoy.
                        </p>
                      ) : (
                        <>
                          <p className="text-[9px] font-mono font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
                            Sin entregar ahora
                          </p>
                          <div className="flex flex-col gap-1">
                            {undeliveredToday.slice(0, UNDELIVERED_PREVIEW).map((order) => (
                              <button
                                key={order.id}
                                type="button"
                                onClick={() => onOpenOrder(order.id)}
                                className="w-full text-left px-2 py-1.5 rounded border border-[var(--color-warn)]/30 bg-[var(--color-warn)]/5 hover:bg-[var(--color-warn)]/10 hover:border-[var(--color-warn)]/50 transition group"
                              >
                                <span className="flex items-center gap-1.5 min-w-0">
                                  <MapPin className="w-3 h-3 shrink-0 text-[var(--color-warn)]" />
                                  <span className="font-mono font-bold text-[10px] text-[var(--color-accent)] group-hover:underline shrink-0">
                                    {order.id}
                                  </span>
                                  <span className="text-[10px] text-[var(--ink-soft)] truncate min-w-0">
                                    {order.clientName}
                                  </span>
                                  <ChevronRight className="w-3 h-3 ml-auto shrink-0 text-[var(--color-text-faint)] group-hover:text-[var(--color-accent)]" />
                                </span>
                                {order.address ? (
                                  <span className="block text-[9px] text-[var(--color-text-muted)] truncate pl-[1.125rem] mt-0.5">
                                    {order.address}
                                  </span>
                                ) : null}
                              </button>
                            ))}
                            {undeliveredToday.length > UNDELIVERED_PREVIEW && (
                              <button
                                type="button"
                                onClick={() => onOpenMap?.()}
                                className="text-left px-2 py-1 text-[9px] font-mono font-bold uppercase tracking-wider text-[var(--color-accent)] hover:underline"
                              >
                                +{undeliveredToday.length - UNDELIVERED_PREVIEW} más en el mapa
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
