/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useMemo, useState } from 'react';
import { Barcode, MapPin, Package, Store } from 'lucide-react';
import { PickupPoint, User } from '../types.js';
import MercadoLibreLabelScanner, {
  type MercadoLibreScanImportResult,
} from './MercadoLibreLabelScanner.tsx';

interface SellerPickupPanelProps {
  sellers: User[];
  pickupPoints?: PickupPoint[];
  onScanImport: (code: string, sellerId: string) => Promise<MercadoLibreScanImportResult>;
  onImported?: (result: MercadoLibreScanImportResult) => void;
  initialSellerId?: string;
  compact?: boolean;
  lockSellerSelection?: boolean;
}

export default function SellerPickupPanel({
  sellers,
  pickupPoints = [],
  onScanImport,
  onImported,
  initialSellerId = '',
  compact = false,
  lockSellerSelection = false,
}: SellerPickupPanelProps) {
  const [sellerId, setSellerId] = useState(initialSellerId);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [sessionImports, setSessionImports] = useState<MercadoLibreScanImportResult[]>([]);

  useEffect(() => {
    if (initialSellerId) setSellerId(initialSellerId);
  }, [initialSellerId]);

  const selectedSeller = useMemo(
    () => sellers.find((s) => s.id === sellerId) ?? null,
    [sellers, sellerId]
  );

  const pickupPoint = useMemo(() => {
    if (!sellerId) return null;
    return pickupPoints.find((p) => p.userId === sellerId) ?? null;
  }, [pickupPoints, sellerId]);

  const handleImported = (result: MercadoLibreScanImportResult) => {
    setSessionImports((prev) => {
      const exists = prev.some((item) => item.order.id === result.order.id);
      if (exists) return prev;
      return [result, ...prev];
    });
    onImported?.(result);
  };

  if (sellers.length === 0) {
    return (
      <div className="bg-[var(--input-bg)]/80 border border-[var(--surface-border)] rounded-lg p-3 text-[10px] text-[var(--color-text-muted)] font-mono">
        Agregá vendedores en Configuración para poder colectar paquetes en sus locales.
      </div>
    );
  }

  return (
    <>
      <div
        className={`border border-[var(--color-accent)]/25 bg-[var(--color-accent)]/5 rounded-lg ${
          compact ? 'p-2.5 space-y-2' : 'p-3 space-y-3'
        }`}
      >
        <div className="flex items-start gap-2">
          <div className="w-8 h-8 rounded-[5px] bg-[var(--color-accent)]/15 flex items-center justify-center shrink-0">
            <Package className="w-4 h-4 text-[var(--color-accent)]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-display font-semibold text-[var(--color-text)]">
              Colecta en vendedor
            </p>
            <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5 leading-relaxed">
              Escaneá las etiquetas de Mercado Libre al retirar los paquetes en el local del vendedor.
            </p>
          </div>
        </div>

        <div>
          {!lockSellerSelection ? (
            <>
              <label className="mono-label block mb-1">¿En qué vendedor estás?</label>
              <select
                value={sellerId}
                onChange={(e) => setSellerId(e.target.value)}
                className="w-full bg-[var(--paper)] border border-[var(--surface-border)] rounded-[5px] px-3 py-2 text-xs text-[var(--color-text)] focus:outline-none focus:border-[var(--color-accent)]"
              >
                <option value="">Seleccioná un vendedor…</option>
                {sellers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} (@{s.username})
                  </option>
                ))}
              </select>
            </>
          ) : null}
        </div>

        {selectedSeller && (
          <div className="rounded-lg border border-[var(--surface-border)] bg-[var(--paper)] px-2.5 py-2 space-y-1.5">
            <p className="text-[11px] font-medium text-[var(--ink-soft)] flex items-center gap-1.5">
              <Store className="w-3.5 h-3.5 text-[var(--route)] shrink-0" />
              {selectedSeller.name}
            </p>
            {pickupPoint ? (
              <p className="text-[10px] text-[var(--color-text-muted)] flex items-start gap-1.5">
                <MapPin className="w-3 h-3 text-[var(--color-ok)] shrink-0 mt-0.5" />
                <span>
                  <span className="font-medium text-[var(--color-ok)]">{pickupPoint.label}</span>
                  <span className="block truncate">{pickupPoint.address}</span>
                </span>
              </p>
            ) : (
              <p className="text-[10px] text-[var(--color-text-faint)]">
                Sin punto de colecta configurado — coordiná la dirección con el vendedor.
              </p>
            )}
          </div>
        )}

        <button
          type="button"
          disabled={!sellerId}
          onClick={() => setScannerOpen(true)}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-[5px] bg-[var(--color-accent)] hover:brightness-110 text-[var(--paper)] font-mono font-bold text-[11px] uppercase tracking-wider transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Barcode className="w-4 h-4" />
          Escanear etiquetas ML
        </button>

        {sessionImports.length > 0 && (
          <div className="pt-1 border-t border-[var(--surface-border)]/80">
            <p className="mono-label mb-1.5">Colectados en esta visita ({sessionImports.length})</p>
            <ul className="space-y-1 max-h-28 overflow-y-auto pr-1 scrollbar-thin">
              {sessionImports.map((item) => (
                <li
                  key={item.order.id}
                  className="text-[10px] rounded-[5px] px-2 py-1.5 bg-[var(--paper)] border border-[var(--surface-border)]"
                >
                  <span className="font-mono font-bold text-[var(--ink-soft)]">{item.order.id}</span>
                  <span className="text-[var(--color-text-muted)]"> · ML #{item.externalOrderId}</span>
                  <span className="block truncate text-[var(--color-text-faint)]">{item.order.clientName}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {sellerId && (
        <MercadoLibreLabelScanner
          open={scannerOpen}
          onClose={() => setScannerOpen(false)}
          lockedSellerId={sellerId}
          lockedSellerName={selectedSeller?.name}
          title="Colecta en vendedor"
          subtitle={`Escaneá cada etiqueta Flex de ${selectedSeller?.name ?? 'el vendedor'}`}
          onImport={(code, id) => onScanImport(code, id ?? sellerId)}
          onImported={handleImported}
        />
      )}
    </>
  );
}
