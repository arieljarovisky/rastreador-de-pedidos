/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link2, Unlink, Download, RefreshCw, ShoppingBag, Store, Loader2, Archive } from 'lucide-react';
import type { MarketplaceIntegrationStatus, MarketplaceShipmentPreview } from '../types.js';

export interface MarketplaceIntegrationsProps {
  status: MarketplaceIntegrationStatus | null;
  statusLoading: boolean;
  statusError?: string | null;
  onRefreshStatus: () => Promise<void>;
  onConnect: (platform: 'mercadolibre' | 'tiendanube') => Promise<void>;
  onDisconnect: (platform: 'mercadolibre' | 'tiendanube') => Promise<void>;
  onFetchShipments: (
    platform: 'mercadolibre' | 'tiendanube',
    options?: { dateFrom?: string; dateTo?: string }
  ) => Promise<MarketplaceShipmentPreview[]>;
  onImport: (
    platform: 'mercadolibre' | 'tiendanube',
    externalIds?: string[],
    options?: { dateFrom?: string; dateTo?: string; mlRefs?: string[] }
  ) => Promise<{ imported: number; skipped: number; errors?: string[] }>;
  onArchiveAllFinishedOrders?: () => Promise<number>;
}

const btnPrimary = 'btn-primary px-3 py-1.5 disabled:opacity-50';
const btnGhost = 'btn-secondary px-3 py-1.5 disabled:opacity-50';
const dateInputClass =
  'bg-[var(--paper)] border border-[var(--surface-border)] rounded-[5px] px-2 py-1 text-[10px] text-[var(--color-text)] min-w-0 focus:outline-none focus:border-[var(--color-accent)]';

function toDateInputValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function defaultMlDateRange(): { dateFrom: string; dateTo: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - 7);
  return { dateFrom: toDateInputValue(from), dateTo: toDateInputValue(to) };
}

function orderListKey(s: MarketplaceShipmentPreview): string {
  if (s.platform === 'mercadolibre') {
    if (s.mlPackId) return `pack:${s.mlPackId}`;
    return s.externalId;
  }
  return s.mlOrderId ?? s.externalId;
}

/** Referencia para importar (orden o envío MLA, no clave de UI). */
function importRef(s: MarketplaceShipmentPreview): string {
  return s.mlOrderId ?? s.externalId;
}

function defaultTnDateRange(): { dateFrom: string; dateTo: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - 30);
  return { dateFrom: toDateInputValue(from), dateTo: toDateInputValue(to) };
}

function formatShipmentDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function PlatformCard({
  title,
  subtitle,
  icon,
  platform,
  configured,
  showMissingCredentials = false,
  connected,
  accountName,
  webhookUrl,
  autoSync = false,
  shipments,
  shipmentsLoading,
  importLoading,
  importingId,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  onConnect,
  onDisconnect,
  onRefreshShipments,
  onImportAll,
  onImportOne,
  mlRefInput = '',
  onMlRefInputChange,
  onImportByMlRef,
  mlRefImporting = false,
}: {
  title: string;
  subtitle: string;
  icon: ReactNode;
  platform: 'mercadolibre' | 'tiendanube';
  configured: boolean;
  showMissingCredentials?: boolean;
  connected: boolean;
  accountName: string | null;
  webhookUrl?: string;
  autoSync?: boolean;
  shipments: MarketplaceShipmentPreview[];
  shipmentsLoading: boolean;
  importLoading: boolean;
  importingId: string | 'all' | null;
  dateFrom?: string;
  dateTo?: string;
  onDateFromChange?: (value: string) => void;
  onDateToChange?: (value: string) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onRefreshShipments: () => void;
  onImportAll: () => void;
  onImportOne: (externalId: string) => void;
  mlRefInput?: string;
  onMlRefInputChange?: (value: string) => void;
  onImportByMlRef?: () => void;
  mlRefImporting?: boolean;
}) {
  const pending = shipments.filter(
    (s) => !s.alreadyImported && s.mlShipmentStatus !== 'delivered'
  );
  const pendingImportCount = pending.length;

  return (
    <div className="bg-[var(--paper)] border border-[var(--surface-border)] rounded-[5px] p-3 flex flex-col gap-3">
      <div className="flex items-start gap-2">
        <div className="w-9 h-9 rounded-[5px] bg-[var(--paper-3)] border border-[var(--surface-border)] flex items-center justify-center shrink-0">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-display font-semibold text-[var(--color-text)]">{title}</p>
          <p className="mono-label">{subtitle}</p>
          {connected && accountName && (
            <p className="text-[10px] text-[var(--color-ok)] mt-0.5 truncate">Conectado: {accountName}</p>
          )}
          {connected && autoSync && (
            <p className="text-[10px] text-[var(--color-ok)] mt-0.5">Sync automático activo</p>
          )}
          {connected && platform === 'tiendanube' && (
            <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
              Posta Express aparece en el checkout de Tienda Nube según CP (solo AMBA).
            </p>
          )}
          {!configured && showMissingCredentials && (
            <p className="text-[10px] text-[var(--color-warn)] mt-0.5">
              Falta configurar credenciales en el servidor.
            </p>
          )}
          {platform === 'mercadolibre' && configured && webhookUrl && (
            <p className="text-[10px] text-[var(--color-text-muted)] mt-1 break-all">
              Webhook ML: <span className="text-[var(--ink-soft)] font-mono">{webhookUrl}</span>
            </p>
          )}
          {platform === 'tiendanube' && configured && webhookUrl && (
            <p className="text-[10px] text-[var(--color-text-muted)] mt-1 break-all">
              Webhook TN: <span className="text-[var(--ink-soft)] font-mono">{webhookUrl}</span>
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1 shrink-0">
          {!connected ? (
            <button
              type="button"
              className={btnPrimary}
              disabled={!configured}
              onClick={onConnect}
            >
              <span className="inline-flex items-center gap-1">
                <Link2 className="w-3 h-3" /> Conectar
              </span>
            </button>
          ) : (
            <button type="button" className={btnGhost} onClick={onDisconnect}>
              <span className="inline-flex items-center gap-1">
                <Unlink className="w-3 h-3" /> Desconectar
              </span>
            </button>
          )}
        </div>
      </div>

      {connected && (
        <>
          {platform === 'mercadolibre' && onMlRefInputChange && onImportByMlRef && (
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-0.5 flex-1 min-w-[12rem]">
                <span className="mono-label">Importar por número MLA</span>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="Ej. 2000013826685141"
                  className={dateInputClass}
                  value={mlRefInput}
                  disabled={shipmentsLoading || importLoading || mlRefImporting}
                  onChange={(e) => onMlRefInputChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && mlRefInput.trim()) {
                      e.preventDefault();
                      onImportByMlRef();
                    }
                  }}
                />
              </label>
              <button
                type="button"
                className={btnPrimary}
                disabled={!mlRefInput.trim() || shipmentsLoading || importLoading || mlRefImporting}
                onClick={onImportByMlRef}
              >
                <span className="inline-flex items-center gap-1">
                  {mlRefImporting ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Download className="w-3 h-3" />
                  )}
                  {mlRefImporting ? 'Importando…' : 'Importar'}
                </span>
              </button>
            </div>
          )}

          {platform === 'mercadolibre' && dateFrom && dateTo && onDateFromChange && onDateToChange && (
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-0.5 min-w-[7.5rem] flex-1">
                <span className="mono-label">Desde</span>
                <input
                  type="date"
                  className={dateInputClass}
                  value={dateFrom}
                  max={dateTo}
                  disabled={shipmentsLoading || importLoading}
                  onChange={(e) => onDateFromChange(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-0.5 min-w-[7.5rem] flex-1">
                <span className="mono-label">Hasta</span>
                <input
                  type="date"
                  className={dateInputClass}
                  value={dateTo}
                  min={dateFrom}
                  disabled={shipmentsLoading || importLoading}
                  onChange={(e) => onDateToChange(e.target.value)}
                />
              </label>
            </div>
          )}

          {platform === 'tiendanube' && dateFrom && dateTo && onDateFromChange && onDateToChange && (
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-0.5 min-w-[7.5rem] flex-1">
                <span className="mono-label">Desde</span>
                <input
                  type="date"
                  className={dateInputClass}
                  value={dateFrom}
                  max={dateTo}
                  disabled={shipmentsLoading || importLoading}
                  onChange={(e) => onDateFromChange(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-0.5 min-w-[7.5rem] flex-1">
                <span className="mono-label">Hasta</span>
                <input
                  type="date"
                  className={dateInputClass}
                  value={dateTo}
                  min={dateFrom}
                  disabled={shipmentsLoading || importLoading}
                  onChange={(e) => onDateToChange(e.target.value)}
                />
              </label>
            </div>
          )}

          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              className={btnGhost}
              disabled={shipmentsLoading || importLoading}
              onClick={onRefreshShipments}
            >
              <span className="inline-flex items-center gap-1">
                <RefreshCw className={`w-3 h-3 ${shipmentsLoading ? 'animate-spin' : ''}`} />
                Buscar envíos
              </span>
            </button>
            {pendingImportCount > 0 && (
              <button
                type="button"
                className={btnPrimary}
                disabled={importLoading}
                onClick={onImportAll}
              >
                <span className="inline-flex items-center gap-1">
                  {importingId === 'all' ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Download className="w-3 h-3" />
                  )}
                  {importingId === 'all'
                    ? 'Importando…'
                    : `Importar todos (${pendingImportCount})`}
                </span>
              </button>
            )}
          </div>

          {!shipmentsLoading && shipments.length > 0 && (
            <p className="text-[10px] text-[var(--color-text-muted)]">
              {shipments.length} venta{shipments.length !== 1 ? 's' : ''}
              {pendingImportCount > 0 &&
                ` · ${pendingImportCount} pendiente${pendingImportCount !== 1 ? 's' : ''} de importar`}
            </p>
          )}

          {importLoading && (
            <div className="flex items-center gap-2 rounded-[5px] border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/10 px-2 py-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--color-accent)] shrink-0" />
              <p className="text-[10px] text-[var(--color-text)]">Importando envíos de {title}…</p>
            </div>
          )}

          {shipmentsLoading && (
            <p className="text-[10px] text-[var(--color-text-muted)]">Consultando envíos en {title}…</p>
          )}

          {!shipmentsLoading && shipments.length === 0 && (
            <p className="text-[10px] text-[var(--color-text-muted)]">
              Tocá &quot;Buscar envíos&quot; para ver pedidos Flex del período
              {platform === 'mercadolibre' ? ' seleccionado' : ''}
              {platform === 'tiendanube' ? ' seleccionado' : ''}.
              {platform === 'mercadolibre' &&
                ' Una venta = un pack MLA (como en Mercado Libre), aunque tenga varios productos.'}
            </p>
          )}

          {!shipmentsLoading && shipments.length > 0 && pending.length === 0 && (
            <p className="text-[10px] text-[var(--color-ok)]">
              Todos los envíos Flex visibles ya fueron importados. Si tenés pedidos nuevos en ML, tocá
              &quot;Buscar envíos&quot; de nuevo.
            </p>
          )}

          {shipments.length > 0 && (
            <ul className="space-y-1 max-h-48 overflow-y-auto pr-1 scrollbar-thin">
              {shipments.map((s) => (
                <li
                  key={orderListKey(s)}
                  className={`text-[10px] rounded-[5px] border px-2 py-1.5 ${
                    s.alreadyImported || s.mlShipmentStatus === 'delivered'
                      ? 'border-[var(--surface-border)] bg-[var(--paper-3)]/60 text-[var(--color-text-muted)]'
                      : 'border-[var(--edge-2)] bg-[var(--paper-3)] text-[var(--ink-soft)]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-[var(--color-text)] truncate">
                        {s.platform === 'mercadolibre' && s.mlOrderId
                          ? `Orden #${s.mlOrderId}`
                          : `#${s.externalId}`}
                        {s.platform === 'mercadolibre' &&
                          (s.mlProductCount ?? 0) > 1 &&
                          ` · Paquete de ${s.mlProductCount} productos`}
                        {' · '}
                        {s.clientName}
                        {s.createdAt && (
                          <span className="text-[var(--color-text-muted)] font-normal">
                            {' '}
                            · {formatShipmentDate(s.createdAt)}
                          </span>
                        )}
                      </p>
                      <p className="text-[var(--color-text-muted)] truncate">{s.address}</p>
                    </div>
                    {s.alreadyImported ? (
                      <span className="shrink-0 mono-label">Importado</span>
                    ) : s.mlShipmentStatus === 'delivered' ? (
                      <span className="shrink-0 mono-label">Entregado</span>
                    ) : (
                      <button
                        type="button"
                        disabled={importLoading}
                        onClick={() => onImportOne(importRef(s))}
                        className="shrink-0 mono-label text-[var(--color-accent)] hover:brightness-110 disabled:opacity-50 inline-flex items-center gap-1"
                      >
                        {importingId === importRef(s) ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Importando
                          </>
                        ) : (
                          'Importar'
                        )}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

export default function MarketplaceIntegrations({
  status,
  statusLoading,
  statusError = null,
  onRefreshStatus,
  onConnect,
  onDisconnect,
  onFetchShipments,
  onImport,
  onArchiveAllFinishedOrders,
}: MarketplaceIntegrationsProps) {
  const [mlShipments, setMlShipments] = useState<MarketplaceShipmentPreview[]>([]);
  const [tnShipments, setTnShipments] = useState<MarketplaceShipmentPreview[]>([]);
  const [mlLoading, setMlLoading] = useState(false);
  const [tnLoading, setTnLoading] = useState(false);
  const [mlImporting, setMlImporting] = useState(false);
  const [tnImporting, setTnImporting] = useState(false);
  const [mlImportingId, setMlImportingId] = useState<string | 'all' | null>(null);
  const [tnImportingId, setTnImportingId] = useState<string | 'all' | null>(null);
  const [tnDateFrom, setTnDateFrom] = useState(() => defaultTnDateRange().dateFrom);
  const [tnDateTo, setTnDateTo] = useState(() => defaultTnDateRange().dateTo);
  const [mlDateFrom, setMlDateFrom] = useState(() => defaultMlDateRange().dateFrom);
  const [mlDateTo, setMlDateTo] = useState(() => defaultMlDateRange().dateTo);
  const [mlRefInput, setMlRefInput] = useState('');
  const [mlRefImporting, setMlRefImporting] = useState(false);
  const [archivingFinished, setArchivingFinished] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<'success' | 'error'>('success');

  useEffect(() => {
    void onRefreshStatus();
  }, [onRefreshStatus]);

  const tnDateOptions = { dateFrom: tnDateFrom, dateTo: tnDateTo };
  const mlDateOptions = { dateFrom: mlDateFrom, dateTo: mlDateTo };

  const refreshMl = useCallback(async () => {
    if (mlDateFrom > mlDateTo) {
      setMessageTone('error');
      setMessage('La fecha desde no puede ser posterior a la fecha hasta.');
      return;
    }
    setMlLoading(true);
    setMessage(null);
    try {
      const list = await onFetchShipments('mercadolibre', mlDateOptions);
      setMlShipments(list);
    } catch (err: unknown) {
      setMessageTone('error');
      setMessage(err instanceof Error ? err.message : 'Error al buscar envíos de Mercado Libre');
    } finally {
      setMlLoading(false);
    }
  }, [onFetchShipments, mlDateFrom, mlDateTo]);

  const refreshTn = useCallback(async () => {
    if (tnDateFrom > tnDateTo) {
      setMessageTone('error');
      setMessage('La fecha desde no puede ser posterior a la fecha hasta.');
      return;
    }

    setTnLoading(true);
    setMessage(null);
    try {
      const list = await onFetchShipments('tiendanube', tnDateOptions);
      setTnShipments(list);
    } catch (err: unknown) {
      setMessageTone('error');
      setMessage(err instanceof Error ? err.message : 'Error al buscar envíos de Tienda Nube');
    } finally {
      setTnLoading(false);
    }
  }, [onFetchShipments, tnDateFrom, tnDateTo]);

  const runImport = async (
    platform: 'mercadolibre' | 'tiendanube',
    externalIds?: string[]
  ) => {
    const setImporting = platform === 'mercadolibre' ? setMlImporting : setTnImporting;
    const setImportingId = platform === 'mercadolibre' ? setMlImportingId : setTnImportingId;
    const refresh = platform === 'mercadolibre' ? refreshMl : refreshTn;
    const options = platform === 'tiendanube' ? tnDateOptions : mlDateOptions;

    if (platform === 'tiendanube' && tnDateFrom > tnDateTo) {
      setMessageTone('error');
      setMessage('La fecha desde no puede ser posterior a la fecha hasta.');
      return;
    }
    if (platform === 'mercadolibre' && mlDateFrom > mlDateTo) {
      setMessageTone('error');
      setMessage('La fecha desde no puede ser posterior a la fecha hasta.');
      return;
    }

    setImporting(true);
    setImportingId(externalIds?.length === 1 ? externalIds[0]! : 'all');
    setMessage(null);
    try {
      const result = await onImport(platform, externalIds, options);
      if (result.imported > 0) {
        setMessageTone('success');
        setMessage(
          `Importación lista: ${result.imported} envío${result.imported !== 1 ? 's' : ''} importado${result.imported !== 1 ? 's' : ''}` +
            (result.skipped ? `, ${result.skipped} omitido${result.skipped !== 1 ? 's' : ''}` : '') +
            '.'
        );
      } else if (result.errors?.length) {
        setMessageTone('error');
        setMessage(result.errors.slice(0, 6).join(' '));
      } else {
        setMessageTone('error');
        setMessage('No se importó ningún envío.');
      }
      await refresh();
    } catch (err: unknown) {
      setMessageTone('error');
      setMessage(err instanceof Error ? err.message : 'No se pudo importar');
    } finally {
      setImporting(false);
      setImportingId(null);
    }
  };

  const importByMlRef = async () => {
    const ref = mlRefInput.trim();
    if (!ref) return;

    setMlRefImporting(true);
    setMessage(null);
    try {
      const result = await onImport('mercadolibre', undefined, { mlRefs: [ref] });
      if (result.imported > 0) {
        setMessageTone('success');
        setMessage('Pedido importado correctamente.');
        setMlRefInput('');
      } else if (result.skipped > 0 && !result.errors?.length) {
        setMessageTone('success');
        setMessage('El pedido ya estaba importado; se sincronizó el estado desde ML.');
        setMlRefInput('');
      } else if (result.errors?.length) {
        setMessageTone('error');
        setMessage(result.errors[0] ?? 'No se pudo importar.');
      } else {
        setMessageTone('error');
        setMessage('No se importó el pedido.');
      }
    } catch (err: unknown) {
      setMessageTone('error');
      setMessage(err instanceof Error ? err.message : 'No se pudo importar');
    } finally {
      setMlRefImporting(false);
    }
  };

  return (
    <section className="paper-card p-3 lg:col-span-2">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div>
          <p className="text-xs font-display font-semibold text-[var(--color-text)]">
            Tiendas conectadas
          </p>
          <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
            Importá envíos Flex (Mercado Libre) y Express (Tienda Nube). Ambos con sync automático vía webhook.
          </p>
        </div>
        <button
          type="button"
          className={btnGhost}
          disabled={statusLoading}
          onClick={() => void onRefreshStatus()}
        >
          Actualizar
        </button>
      </div>

      {statusError && (
        <p className="text-[10px] mb-2 font-mono text-[var(--color-danger)]">{statusError}</p>
      )}

      {message && (
        <p className={`text-[10px] mb-2 font-mono ${messageTone === 'error' ? 'text-[var(--color-danger)]' : 'text-[var(--color-ok)]'}`}>
          {message}
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <PlatformCard
          title="Mercado Libre"
          subtitle="Envíos Flex (self_service)"
          icon={<ShoppingBag className="w-4 h-4 text-yellow-400" />}
          platform="mercadolibre"
          configured={status?.mercadolibre.configured ?? false}
          showMissingCredentials={
            !statusError && status !== null && !status.mercadolibre.configured
          }
          connected={status?.mercadolibre.connected ?? false}
          accountName={status?.mercadolibre.account?.nickname ?? null}
          webhookUrl={status?.mercadolibre.webhookUrl}
          shipments={mlShipments}
          shipmentsLoading={mlLoading}
          importLoading={mlImporting}
          importingId={mlImportingId}
          dateFrom={mlDateFrom}
          dateTo={mlDateTo}
          onDateFromChange={setMlDateFrom}
          onDateToChange={setMlDateTo}
          onConnect={() => void onConnect('mercadolibre')}
          onDisconnect={() => void onDisconnect('mercadolibre')}
          onRefreshShipments={() => void refreshMl()}
          onImportAll={() => void runImport('mercadolibre')}
          onImportOne={(id) => void runImport('mercadolibre', [id])}
          mlRefInput={mlRefInput}
          onMlRefInputChange={setMlRefInput}
          onImportByMlRef={() => void importByMlRef()}
          mlRefImporting={mlRefImporting}
        />
        <PlatformCard
          title="Tienda Nube"
          subtitle="Posta Express en checkout (AMBA) · sync + import por período"
          icon={<Store className="w-4 h-4 text-violet-400" />}
          platform="tiendanube"
          configured={status?.tiendanube.configured ?? false}
          showMissingCredentials={
            !statusError && status !== null && !status.tiendanube.configured
          }
          connected={status?.tiendanube.connected ?? false}
          accountName={
            status?.tiendanube.account?.nickname ?? status?.tiendanube.account?.externalStoreId ?? null
          }
          webhookUrl={status?.tiendanube.orderWebhookUrl}
          autoSync={status?.tiendanube.autoSync ?? status?.tiendanube.connected ?? false}
          shipments={tnShipments}
          shipmentsLoading={tnLoading}
          importLoading={tnImporting}
          importingId={tnImportingId}
          dateFrom={tnDateFrom}
          dateTo={tnDateTo}
          onDateFromChange={setTnDateFrom}
          onDateToChange={setTnDateTo}
          onConnect={() => void onConnect('tiendanube')}
          onDisconnect={() => void onDisconnect('tiendanube')}
          onRefreshShipments={() => void refreshTn()}
          onImportAll={() => void runImport('tiendanube')}
          onImportOne={(id) => void runImport('tiendanube', [id])}
        />
      </div>

      {onArchiveAllFinishedOrders && (
        <div className="pt-2 border-t border-[var(--surface-border)]">
          <button
            type="button"
            className={`${btnGhost} w-full`}
            disabled={archivingFinished || mlLoading || tnLoading || mlImporting || tnImporting}
            onClick={() => {
              setArchivingFinished(true);
              void onArchiveAllFinishedOrders()
                .then((archived) => {
                  if (archived > 0) {
                    setMessageTone('success');
                    setMessage(
                      `Se archivaron ${archived} envío${archived !== 1 ? 's' : ''} finalizado${archived !== 1 ? 's' : ''}.`
                    );
                  }
                })
                .catch(() => {})
                .finally(() => setArchivingFinished(false));
            }}
          >
            <span className="inline-flex items-center justify-center gap-1 w-full">
              {archivingFinished ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Archive className="w-3 h-3" />
              )}
              {archivingFinished ? 'Archivando…' : 'Archivar envíos finalizados'}
            </span>
          </button>
        </div>
      )}
    </section>
  );
}
