/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ClipboardList, Loader2, Trash2 } from 'lucide-react';
import { apiUrl } from '../api.ts';
import OperationalDatePicker from './OperationalDatePicker.tsx';
import { getOperationalDateKey, formatOperationalDateShort } from '../utils/deliverySummary.js';
import { useModal } from '../context/ModalContext.tsx';

export type AgencyDriverScanStatus = 'pending' | 'delivered' | 'cancelled';

export interface AgencyDriverScanEntry {
  id: string;
  agencyId: string;
  repartidorId: string;
  repartidorName?: string;
  scanCode: string;
  routeDate: string;
  status: AgencyDriverScanStatus;
  note: string | null;
  clientName?: string | null;
  address?: string | null;
  clientPhone?: string | null;
  scannedAt: string;
  deliveredAt: string | null;
}

interface AgencyDriverScanPageProps {
  token: string;
  repartidores?: Array<{ id: string; name: string }>;
}

function statusLabel(status: AgencyDriverScanStatus): string {
  if (status === 'delivered') return 'Entregado';
  if (status === 'cancelled') return 'Cancelado';
  return 'Pendiente';
}

function statusClass(status: AgencyDriverScanStatus): string {
  if (status === 'delivered') return 'text-[var(--color-ok)] border-[var(--color-ok)]/30 bg-[var(--color-ok)]/10';
  if (status === 'cancelled') return 'text-[var(--color-danger)] border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10';
  return 'text-[var(--color-accent)] border-[var(--color-accent)]/30 bg-[var(--color-accent)]/10';
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

/** Extrae ID legible de payloads JSON de QR (p. ej. ML Flex). */
function formatScanCodeLabel(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      const id = parsed.id ?? parsed.shipment_id ?? parsed.shipping_id ?? parsed.order_id;
      if (id != null && String(id).trim()) return String(id).trim();
    } catch {
      // fall through
    }
  }
  if (trimmed.length <= 40) return trimmed;
  const digits = trimmed.match(/\d{8,}/);
  if (digits?.[0]) return digits[0];
  return `${trimmed.slice(0, 12)}…${trimmed.slice(-8)}`;
}

/** Quita "· Ref: …" / "Referencia: …" de una dirección guardada o leída por OCR. */
function stripAddressReference(address: string): string {
  return address
    .replace(/\s*[·•]\s*Ref(?:erencia)?\s*:.+$/i, '')
    .replace(/\s+Ref(?:erencia)?\s*:.+$/i, '')
    .replace(/\s+Referencia\s*:.+$/i, '')
    .trim();
}

export default function AgencyDriverScanPage({
  token,
  repartidores = [],
}: AgencyDriverScanPageProps) {
  const { confirm, alert: showAlert } = useModal();
  const todayKey = getOperationalDateKey();
  const [date, setDate] = useState(todayKey);
  const [repartidorId, setRepartidorId] = useState('');
  const [entries, setEntries] = useState<AgencyDriverScanEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ date });
      if (repartidorId) params.set('repartidorId', repartidorId);
      const res = await fetch(apiUrl(`/api/driver-scan/agency?${params}`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'No se pudo cargar el registro.');
      setEntries(Array.isArray(body.entries) ? body.entries : []);
    } catch (err) {
      setEntries([]);
      setError(err instanceof Error ? err.message : 'Error al cargar el registro.');
    } finally {
      setLoading(false);
    }
  }, [token, date, repartidorId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDelete = useCallback(
    async (entry: AgencyDriverScanEntry) => {
      const label = entry.clientName?.trim() || formatScanCodeLabel(entry.scanCode);
      const ok = await confirm({
        title: 'Eliminar del registro',
        message: `¿Eliminar "${label}" del registro? Esta acción no se puede deshacer.`,
        variant: 'danger',
        confirmText: 'Eliminar',
        cancelText: 'Cancelar',
      });
      if (!ok) return;
      setDeletingId(entry.id);
      setError(null);
      try {
        const res = await fetch(apiUrl(`/api/driver-scan/${entry.id}`), {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || 'No se pudo eliminar.');
        }
        setEntries((prev) => prev.filter((e) => e.id !== entry.id));
      } catch (err) {
        const message = err instanceof Error ? err.message : 'No se pudo eliminar el registro.';
        setError(message);
        void showAlert({ title: 'No se pudo eliminar', message, variant: 'error' });
      } finally {
        setDeletingId(null);
      }
    },
    [token, confirm, showAlert]
  );

  const counts = useMemo(() => {
    let pending = 0;
    let delivered = 0;
    let cancelled = 0;
    for (const e of entries) {
      if (e.status === 'pending') pending += 1;
      else if (e.status === 'delivered') delivered += 1;
      else cancelled += 1;
    }
    return { pending, delivered, cancelled, total: entries.length };
  }, [entries]);

  return (
    <div className="h-full flex flex-col min-h-0 overflow-hidden posta-surface">
      <div className="shrink-0 border-b border-[var(--surface-border)] px-4 py-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[var(--color-accent)]">
            <ClipboardList size={16} />
            <h2 className="text-sm font-display font-bold tracking-[-0.02em] text-[var(--color-text)]">
              Registro de paquetes
            </h2>
          </div>
          <p className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">
            Lo que cada repartidor escaneó para su bitácora personal (paquetes no vinculados).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <OperationalDatePicker
            value={date}
            onChange={setDate}
            maxDateKey={todayKey}
            layout="field"
            label="Día"
          />
          <select
            className="posta-input px-2.5 py-1.5 text-xs font-mono min-w-[10rem]"
            value={repartidorId}
            onChange={(e) => setRepartidorId(e.target.value)}
          >
            <option value="">Todos los repartidores</option>
            {repartidores.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="shrink-0 grid grid-cols-2 sm:grid-cols-4 gap-2 px-4 py-3 border-b border-[var(--surface-border)] bg-[var(--surface-panel-2)]/30">
        <div className="rounded-[5px] border border-[var(--surface-border)] px-3 py-2">
          <div className="text-[9px] font-mono uppercase tracking-wider text-[var(--color-text-muted)]">Total</div>
          <div className="text-lg font-display font-bold text-[var(--color-text)]">{counts.total}</div>
        </div>
        <div className="rounded-[5px] border border-[var(--surface-border)] px-3 py-2">
          <div className="text-[9px] font-mono uppercase tracking-wider text-[var(--color-text-muted)]">Pendientes</div>
          <div className="text-lg font-display font-bold text-[var(--color-accent)]">{counts.pending}</div>
        </div>
        <div className="rounded-[5px] border border-[var(--surface-border)] px-3 py-2">
          <div className="text-[9px] font-mono uppercase tracking-wider text-[var(--color-text-muted)]">Entregados</div>
          <div className="text-lg font-display font-bold text-[var(--color-ok)]">{counts.delivered}</div>
        </div>
        <div className="rounded-[5px] border border-[var(--surface-border)] px-3 py-2">
          <div className="text-[9px] font-mono uppercase tracking-wider text-[var(--color-text-muted)]">Cancelados</div>
          <div className="text-lg font-display font-bold text-[var(--color-danger)]">{counts.cancelled}</div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto px-4 py-3">
        {loading ? (
          <div className="h-40 flex items-center justify-center gap-2 text-[var(--color-text-muted)]">
            <Loader2 size={16} className="animate-spin" />
            <span className="text-xs font-mono">Cargando registro…</span>
          </div>
        ) : error ? (
          <div className="rounded-[5px] border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 px-3 py-2 text-xs text-[var(--color-danger)]">
            {error}
          </div>
        ) : entries.length === 0 ? (
          <div className="h-40 flex flex-col items-center justify-center gap-1 text-center px-4">
            <ClipboardList size={28} className="text-[var(--color-text-muted)] opacity-50" />
            <p className="text-sm text-[var(--color-text)] font-medium">Sin escaneos este día</p>
            <p className="text-[11px] text-[var(--color-text-muted)] max-w-sm">
              Cuando un repartidor escanee paquetes ajenos en la app, van a aparecer acá para{' '}
              {formatOperationalDateShort(date)}.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-[5px] border border-[var(--surface-border)]">
            <table className="w-full text-left text-xs">
              <thead className="bg-[var(--surface-panel-2)] text-[9px] font-mono uppercase tracking-wider text-[var(--color-text-muted)]">
                <tr>
                  <th className="px-3 py-2 font-bold">Hora</th>
                  <th className="px-3 py-2 font-bold">Repartidor</th>
                  <th className="px-3 py-2 font-bold">Cliente</th>
                  <th className="px-3 py-2 font-bold">Código</th>
                  <th className="px-3 py-2 font-bold">Dirección</th>
                  <th className="px-3 py-2 font-bold">Estado</th>
                  <th className="px-3 py-2 font-bold w-10" />
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr
                    key={entry.id}
                    className="border-t border-[var(--surface-border)] hover:bg-[var(--surface-panel-2)]/40"
                  >
                    <td className="px-3 py-2 font-mono text-[var(--color-text-muted)] whitespace-nowrap">
                      {formatTime(entry.scannedAt)}
                    </td>
                    <td className="px-3 py-2 text-[var(--color-text)] whitespace-nowrap">
                      {entry.repartidorName ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-[var(--color-text)] max-w-[12rem]">
                      {entry.clientName?.trim() || (
                        <span className="text-[var(--color-text-muted)]">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-[var(--color-text)] whitespace-nowrap">
                      {formatScanCodeLabel(entry.scanCode)}
                    </td>
                    <td className="px-3 py-2 text-[var(--color-text)] max-w-[18rem]">
                      {entry.address?.trim() ? (
                        stripAddressReference(entry.address.trim())
                      ) : (
                        <span className="text-[var(--color-text-muted)]">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded border text-[10px] font-mono font-bold uppercase tracking-wide ${statusClass(entry.status)}`}
                      >
                        {statusLabel(entry.status)}
                      </span>
                    </td>
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        title="Eliminar"
                        disabled={deletingId === entry.id}
                        onClick={() => void handleDelete(entry)}
                        className="inline-flex items-center justify-center p-1.5 rounded border border-[var(--color-danger)]/30 text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 disabled:opacity-50"
                      >
                        {deletingId === entry.id ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Trash2 size={14} />
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
