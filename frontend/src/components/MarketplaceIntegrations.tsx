/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link2, Unlink, Download, RefreshCw, ShoppingBag, Store, Loader2 } from 'lucide-react';
import type { MarketplaceIntegrationStatus, MarketplaceShipmentPreview } from '../types.js';

interface MarketplaceIntegrationsProps {
  status: MarketplaceIntegrationStatus | null;
  statusLoading: boolean;
  onRefreshStatus: () => Promise<void>;
  onConnect: (platform: 'mercadolibre' | 'tiendanube') => Promise<void>;
  onDisconnect: (platform: 'mercadolibre' | 'tiendanube') => Promise<void>;
  onFetchShipments: (platform: 'mercadolibre' | 'tiendanube') => Promise<MarketplaceShipmentPreview[]>;
  onImport: (
    platform: 'mercadolibre' | 'tiendanube',
    externalIds?: string[]
  ) => Promise<{ imported: number; skipped: number; errors?: string[] }>;
}

const btnPrimary =
  'px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-[11px] font-bold uppercase tracking-wider transition';
const btnGhost =
  'px-3 py-1.5 rounded-lg border border-zinc-700 hover:border-zinc-500 text-zinc-300 text-[11px] font-bold uppercase tracking-wider transition disabled:opacity-50';

function PlatformCard({
  title,
  subtitle,
  icon,
  platform,
  configured,
  connected,
  accountName,
  webhookUrl,
  shipments,
  shipmentsLoading,
  importLoading,
  importingId,
  onConnect,
  onDisconnect,
  onRefreshShipments,
  onImportAll,
  onImportOne,
}: {
  title: string;
  subtitle: string;
  icon: ReactNode;
  platform: 'mercadolibre' | 'tiendanube';
  configured: boolean;
  connected: boolean;
  accountName: string | null;
  webhookUrl?: string;
  shipments: MarketplaceShipmentPreview[];
  shipmentsLoading: boolean;
  importLoading: boolean;
  importingId: string | 'all' | null;
  onConnect: () => void;
  onDisconnect: () => void;
  onRefreshShipments: () => void;
  onImportAll: () => void;
  onImportOne: (externalId: string) => void;
}) {
  const pending = shipments.filter((s) => !s.alreadyImported);

  return (
    <div className="bg-zinc-950/50 border border-zinc-800 rounded-xl p-3 flex flex-col gap-3">
      <div className="flex items-start gap-2">
        <div className="w-9 h-9 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-zinc-100">{title}</p>
          <p className="text-[10px] text-zinc-500">{subtitle}</p>
          {connected && accountName && (
            <p className="text-[10px] text-emerald-400 mt-0.5 truncate">Conectado: {accountName}</p>
          )}
          {!configured && (
            <p className="text-[10px] text-amber-400 mt-0.5">
              Falta configurar credenciales en el servidor.
            </p>
          )}
          {platform === 'mercadolibre' && configured && webhookUrl && (
            <p className="text-[10px] text-zinc-500 mt-1 break-all">
              Webhook ML: <span className="text-zinc-400 font-mono">{webhookUrl}</span>
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
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              className={btnGhost}
              disabled={shipmentsLoading}
              onClick={onRefreshShipments}
            >
              <span className="inline-flex items-center gap-1">
                <RefreshCw className={`w-3 h-3 ${shipmentsLoading ? 'animate-spin' : ''}`} />
                Buscar envíos
              </span>
            </button>
            {pending.length > 0 && (
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
                  {importingId === 'all' ? 'Importando…' : `Importar todos (${pending.length})`}
                </span>
              </button>
            )}
          </div>

          {importLoading && (
            <div className="flex items-center gap-2 rounded-lg border border-blue-900/40 bg-blue-950/30 px-2 py-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400 shrink-0" />
              <p className="text-[10px] text-blue-200">Importando envíos de {title}…</p>
            </div>
          )}

          {shipmentsLoading && (
            <p className="text-[10px] text-zinc-500">Consultando envíos en {title}…</p>
          )}

          {!shipmentsLoading && shipments.length === 0 && (
            <p className="text-[10px] text-zinc-500">
              Tocá &quot;Buscar envíos&quot; para ver pedidos {platform === 'mercadolibre' ? 'Flex' : 'Express'} pendientes.
            </p>
          )}

          {shipments.length > 0 && (
            <ul className="space-y-1 max-h-48 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-zinc-800">
              {shipments.map((s) => (
                <li
                  key={s.externalId}
                  className={`text-[10px] rounded-lg border px-2 py-1.5 ${
                    s.alreadyImported
                      ? 'border-zinc-800 bg-zinc-900/40 text-zinc-500'
                      : 'border-zinc-700 bg-zinc-900 text-zinc-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-zinc-200 truncate">
                        #{s.externalId} · {s.clientName}
                      </p>
                      <p className="text-zinc-500 truncate">{s.address}</p>
                    </div>
                    {s.alreadyImported ? (
                      <span className="shrink-0 text-[9px] uppercase text-zinc-500">Importado</span>
                    ) : (
                      <button
                        type="button"
                        disabled={importLoading}
                        onClick={() => onImportOne(s.externalId)}
                        className="shrink-0 text-[9px] uppercase font-bold text-blue-400 hover:text-blue-300 disabled:opacity-50 inline-flex items-center gap-1"
                      >
                        {importingId === s.externalId ? (
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
  onRefreshStatus,
  onConnect,
  onDisconnect,
  onFetchShipments,
  onImport,
}: MarketplaceIntegrationsProps) {
  const [mlShipments, setMlShipments] = useState<MarketplaceShipmentPreview[]>([]);
  const [tnShipments, setTnShipments] = useState<MarketplaceShipmentPreview[]>([]);
  const [mlLoading, setMlLoading] = useState(false);
  const [tnLoading, setTnLoading] = useState(false);
  const [mlImporting, setMlImporting] = useState(false);
  const [tnImporting, setTnImporting] = useState(false);
  const [mlImportingId, setMlImportingId] = useState<string | 'all' | null>(null);
  const [tnImportingId, setTnImportingId] = useState<string | 'all' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<'success' | 'error'>('success');

  useEffect(() => {
    void onRefreshStatus();
  }, [onRefreshStatus]);

  const refreshMl = useCallback(async () => {
    setMlLoading(true);
    setMessage(null);
    try {
      const list = await onFetchShipments('mercadolibre');
      setMlShipments(list);
    } catch (err: unknown) {
      setMessageTone('error');
      setMessage(err instanceof Error ? err.message : 'Error al buscar envíos de Mercado Libre');
    } finally {
      setMlLoading(false);
    }
  }, [onFetchShipments]);

  const refreshTn = useCallback(async () => {
    setTnLoading(true);
    setMessage(null);
    try {
      const list = await onFetchShipments('tiendanube');
      setTnShipments(list);
    } catch (err: unknown) {
      setMessageTone('error');
      setMessage(err instanceof Error ? err.message : 'Error al buscar envíos de Tienda Nube');
    } finally {
      setTnLoading(false);
    }
  }, [onFetchShipments]);

  const runImport = async (
    platform: 'mercadolibre' | 'tiendanube',
    externalIds?: string[]
  ) => {
    const setImporting = platform === 'mercadolibre' ? setMlImporting : setTnImporting;
    const setImportingId = platform === 'mercadolibre' ? setMlImportingId : setTnImportingId;
    const refresh = platform === 'mercadolibre' ? refreshMl : refreshTn;
    setImporting(true);
    setImportingId(externalIds?.length === 1 ? externalIds[0]! : 'all');
    setMessage(null);
    try {
      const result = await onImport(platform, externalIds);
      if (result.imported > 0) {
        setMessageTone('success');
        setMessage(
          `Importación lista: ${result.imported} envío${result.imported !== 1 ? 's' : ''} importado${result.imported !== 1 ? 's' : ''}` +
            (result.skipped ? `, ${result.skipped} omitido${result.skipped !== 1 ? 's' : ''}` : '') +
            '.'
        );
      } else if (result.errors?.length) {
        setMessageTone('error');
        setMessage(result.errors.slice(0, 3).join(' '));
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

  return (
    <section className="bg-blue-950/20 border border-blue-900/30 rounded-xl p-3 lg:col-span-2">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div>
          <p className="text-xs font-bold text-blue-200">Tiendas conectadas</p>
          <p className="text-[10px] text-zinc-500">
            Importá envíos Flex (Mercado Libre) y Express (Tienda Nube). ML: importación y estados automáticos vía webhook.
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

      {message && (
        <p className={`text-[10px] mb-2 ${messageTone === 'error' ? 'text-red-400' : 'text-emerald-400'}`}>
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
          connected={status?.mercadolibre.connected ?? false}
          accountName={status?.mercadolibre.account?.nickname ?? null}
          webhookUrl={status?.mercadolibre.webhookUrl}
          shipments={mlShipments}
          shipmentsLoading={mlLoading}
          importLoading={mlImporting}
          importingId={mlImportingId}
          onConnect={() => void onConnect('mercadolibre')}
          onDisconnect={() => void onDisconnect('mercadolibre')}
          onRefreshShipments={() => void refreshMl()}
          onImportAll={() => void runImport('mercadolibre')}
          onImportOne={(id) => void runImport('mercadolibre', [id])}
        />
        <PlatformCard
          title="Tienda Nube"
          subtitle="Envíos Express"
          icon={<Store className="w-4 h-4 text-violet-400" />}
          platform="tiendanube"
          configured={status?.tiendanube.configured ?? false}
          connected={status?.tiendanube.connected ?? false}
          accountName={
            status?.tiendanube.account?.nickname ?? status?.tiendanube.account?.externalStoreId ?? null
          }
          shipments={tnShipments}
          shipmentsLoading={tnLoading}
          importLoading={tnImporting}
          importingId={tnImportingId}
          onConnect={() => void onConnect('tiendanube')}
          onDisconnect={() => void onDisconnect('tiendanube')}
          onRefreshShipments={() => void refreshTn()}
          onImportAll={() => void runImport('tiendanube')}
          onImportOne={(id) => void runImport('tiendanube', [id])}
        />
      </div>
    </section>
  );
}
