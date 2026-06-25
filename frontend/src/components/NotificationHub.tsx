/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { AppNotification } from '../types.js';
import { Bell, ShieldAlert, Check, CheckCheck, Trash2, X, Volume2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface NotificationHubProps {
  notifications: AppNotification[];
  onMarkAllRead: () => void;
  onClearNotifications?: () => void;
  activeUserId: string;
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
}: NotificationHubProps) {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [activeBanner, setActiveBanner] = useState<AppNotification | null>(null);

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
              icon: 'https://cdn-icons-png.flaticon.com/512/3063/3063822.png',
            });
          } catch (err) {
            // Algunos navegadores requieren service worker para notificaciones push
            navigator.serviceWorker.ready.then((reg) => {
              reg.showNotification(latest.title, {
                body: latest.body,
                icon: 'https://cdn-icons-png.flaticon.com/512/3063/3063822.png',
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
      alert('Las notificaciones del sistema no están soportadas en este navegador.');
      return;
    }
    try {
      const status = await window.Notification.requestPermission();
      setPermission(status);
      if (status === 'granted') {
        playNotificationSound();
        new window.Notification('¡Lupo Envíos!', {
          body: 'Notificaciones push del sistema activadas correctamente.',
          icon: 'https://cdn-icons-png.flaticon.com/512/3063/3063822.png',
        });
      }
    } catch (e) {
      console.error('Error solicitando permisos de notificación:', e);
    }
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <>
      {/* Banner de Notificación Push Flotante Realtime */}
      <AnimatePresence>
        {activeBanner && (
          <motion.div
            initial={{ opacity: 0, y: -50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            id="notification-banner-alert"
            className="fixed top-4 right-4 z-[9999] max-w-sm w-full bg-slate-900/95 border-2 border-amber-500 text-white rounded-2xl p-4 shadow-2xl backdrop-blur-md flex items-start gap-3"
          >
            <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-500 shrink-0 border border-amber-500/20">
              <Bell className="w-5 h-5 animate-bounce" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono tracking-wider text-amber-400 font-bold uppercase">Notificación Push</span>
                <span className="text-[9px] text-slate-400 ml-auto font-mono">Ahora</span>
              </div>
              <h4 className="font-bold text-sm text-slate-100 mt-0.5 truncate">{activeBanner.title}</h4>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">{activeBanner.body}</p>
            </div>
            <button 
              onClick={() => setActiveBanner(null)}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Widget lateral de Configuración de Notificaciones PWA (HIGH DENSITY) */}
      <div className="bg-zinc-900/30 border border-zinc-800 rounded-lg p-3.5 backdrop-blur-sm flex flex-col flex-1 overflow-hidden" id="pwa-notification-config">
        <div className="flex items-center gap-2 mb-3 shrink-0">
          <div className="w-8 h-8 rounded bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
            <Bell className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-bold text-xs text-zinc-200">Notificaciones PWA</h3>
            <p className="text-[10px] text-zinc-500 font-mono">Estado: {permission === 'granted' ? 'PERMITIDO' : permission === 'denied' ? 'DENEGADO' : 'PENDIENTE'}</p>
          </div>
          <button 
            onClick={playNotificationSound}
            title="Probar sonido de timbre"
            className="ml-auto text-zinc-400 hover:text-blue-400 p-1.5 rounded hover:bg-zinc-800 transition"
          >
            <Volume2 className="w-4 h-4" />
          </button>
        </div>

        {permission !== 'granted' ? (
          <div className="bg-zinc-950 border border-zinc-800 rounded p-2.5 mb-3 shrink-0">
            <div className="flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-300">Permiso requerido</p>
                <p className="text-[9px] text-zinc-500 mt-0.5 leading-normal">
                  Activa alertas nativas para recibir avisos de pedidos en tiempo real.
                </p>
                <button
                  onClick={requestPermission}
                  id="btn-request-notifications"
                  className="mt-2 w-full text-center py-1 bg-blue-600 hover:bg-blue-500 text-white font-bold text-[9px] uppercase tracking-wider rounded transition"
                >
                  Activar Alertas
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 bg-emerald-500/5 border border-emerald-500/20 rounded p-2 text-emerald-400 text-[10px] font-medium mb-3 shrink-0 leading-normal">
            <CheckCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Suscripción PWA activa. Alertas instantáneas configuradas.</span>
          </div>
        )}

        {/* Listado de últimas notificaciones del usuario */}
        <div className="border-t border-zinc-800/80 pt-3 flex flex-col flex-1 overflow-hidden">
          <div className="flex items-center justify-between mb-2 shrink-0">
            <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider font-mono">Buzón de Alertas ({unreadCount})</span>
            {unreadCount > 0 && (
              <button
                onClick={onMarkAllRead}
                className="text-[9px] text-blue-400 hover:text-blue-300 flex items-center gap-0.5 font-bold uppercase tracking-wider"
              >
                <Check className="w-3 h-3" /> Marcar Leídas
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 scrollbar-thin scrollbar-thumb-zinc-800">
            {notifications.length === 0 ? (
              <div className="text-center py-8 text-[10px] text-zinc-500 font-mono">
                No hay notificaciones recientes.
              </div>
            ) : (
              notifications.map((notif) => (
                <div
                  key={notif.id}
                  className={`p-2 rounded text-[11px] border transition ${
                    notif.read
                      ? 'bg-zinc-950/20 border-zinc-900/50 text-zinc-500'
                      : 'bg-zinc-900 border-zinc-800/80 text-zinc-200'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-semibold text-[10px]">
                    <span className={notif.read ? 'text-zinc-600' : 'text-blue-400'}>
                      {notif.type === 'order_assigned' ? '🏍️ Asignación' : notif.type === 'order_delivered' ? '✓ Entregado' : '📢 Info'}
                    </span>
                    <span className="text-[9px] text-zinc-500 ml-auto font-mono">
                      {new Date(notif.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <h5 className="font-bold mt-0.5">{notif.title}</h5>
                  <p className="text-[10px] text-zinc-400 mt-0.5 leading-relaxed">{notif.body}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
}
