/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Barcode, Camera, Keyboard, Loader2, X } from 'lucide-react';
import { User } from '../types.js';
import { getScanGeolocation } from '../utils/scanLocation.js';

export interface MercadoLibreScanImportResult {
  order: { id: string; clientName: string; address: string };
  alreadyImported: boolean;
  sellerId: string;
  sellerName: string;
  externalOrderId: string;
  mlFlexRegistered?: boolean;
  mlFlexMessage?: string;
}

export interface ScanLocation {
  lat: number;
  lng: number;
}

interface MercadoLibreLabelScannerProps {
  open: boolean;
  onClose: () => void;
  sellers?: User[];
  lockedSellerId?: string;
  lockedSellerName?: string;
  title?: string;
  subtitle?: string;
  onImport: (
    code: string,
    sellerId?: string,
    scanLocation?: ScanLocation | null
  ) => Promise<MercadoLibreScanImportResult>;
  onImported?: (result: MercadoLibreScanImportResult) => void;
}

const SCANNER_FORMATS = [
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.QR_CODE,
];

export default function MercadoLibreLabelScanner({
  open,
  onClose,
  sellers = [],
  lockedSellerId,
  lockedSellerName,
  title = 'Escanear etiqueta ML',
  subtitle = 'Importá envíos Flex escaneando el código de la etiqueta',
  onImport,
  onImported,
}: MercadoLibreLabelScannerProps) {
  const readerId = useId().replace(/:/g, '');
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const importingRef = useRef(false);
  const cooldownUntilRef = useRef(0);
  const [mode, setMode] = useState<'camera' | 'manual'>('camera');
  const [manualCode, setManualCode] = useState('');
  const [sellerId, setSellerId] = useState('');
  const effectiveSellerId = lockedSellerId ?? sellerId;
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusOk, setStatusOk] = useState(true);

  const stopScanner = useCallback(async () => {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (!scanner) return;
    try {
      if (scanner.isScanning) {
        await scanner.stop();
      }
      scanner.clear();
    } catch {
      // ignore cleanup errors
    }
  }, []);

  const runImport = useCallback(
    async (code: string) => {
      const trimmed = code.trim();
      if (!trimmed || importingRef.current || Date.now() < cooldownUntilRef.current) return;

      importingRef.current = true;
      setImporting(true);
      setStatusMessage(null);
      try {
        const scanLocation = await getScanGeolocation();
        const result = await onImport(trimmed, effectiveSellerId || undefined, scanLocation);
        setStatusOk(true);
        const locationNote = scanLocation ? ' · ubicación registrada' : '';
        const flexNote = result.mlFlexMessage
          ? result.mlFlexRegistered
            ? ` · ${result.mlFlexMessage}`
            : ` · Flex: ${result.mlFlexMessage}`
          : '';
        setStatusMessage(
          result.alreadyImported
            ? `Re-escaneado: ${result.order.id} · ${result.order.clientName} — bitácora${locationNote}${flexNote}`
            : `Importado: ${result.order.id} · ${result.order.clientName} (${result.sellerName})${locationNote}${flexNote}`
        );
        cooldownUntilRef.current = Date.now() + 3500;
        onImported?.(result);
        setManualCode('');
      } catch (err) {
        setStatusOk(false);
        setStatusMessage(err instanceof Error ? err.message : 'No se pudo importar el envío.');
      } finally {
        importingRef.current = false;
        setImporting(false);
      }
    },
    [onImport, onImported, effectiveSellerId]
  );

  useEffect(() => {
    if (!open || mode !== 'camera') {
      void stopScanner();
      return;
    }

    let cancelled = false;
    const scanner = new Html5Qrcode(readerId, { formatsToSupport: SCANNER_FORMATS, verbose: false });
    scannerRef.current = scanner;
    setCameraError(null);

    scanner
      .start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: (viewfinderWidth, viewfinderHeight) => {
            const width = Math.min(viewfinderWidth * 0.92, 320);
            const height = Math.min(viewfinderHeight * 0.45, 160);
            return { width: Math.max(width, 200), height: Math.max(height, 100) };
          },
        },
        (decoded) => {
          void runImport(decoded);
        },
        () => {}
      )
      .catch(() => {
        if (!cancelled) {
          setCameraError('No se pudo acceder a la cámara. Usá ingreso manual o revisá los permisos del navegador.');
          setMode('manual');
        }
      });

    return () => {
      cancelled = true;
      void stopScanner();
    };
  }, [open, mode, readerId, runImport, stopScanner]);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setMode('camera');
      setManualCode('');
      setSellerId('');
      setStatusMessage(null);
      setCameraError(null);
      importingRef.current = false;
      setImporting(false);
    }
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[10001] flex flex-col bg-[var(--surface-bg)] sm:bg-black/80 sm:backdrop-blur-sm sm:items-center sm:justify-center sm:p-4">
      <div className="flex flex-col flex-1 min-h-0 w-full sm:flex-none sm:max-w-lg sm:max-h-[92dvh] bg-[var(--surface-panel)] sm:border sm:border-[var(--surface-border)] sm:rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[var(--surface-border)] shrink-0 safe-area-top">
          <div className="min-w-0">
            <h3 className="text-sm font-display font-bold text-[var(--color-text)] flex items-center gap-2">
              <Barcode className="w-4 h-4 text-[var(--color-accent)] shrink-0" />
              {title}
            </h3>
            <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--surface-panel-2)]"
            title="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3 flex-1 min-h-0 overflow-y-auto">
          {lockedSellerId ? (
            <div className="rounded-lg border border-[var(--color-accent)]/25 bg-[var(--color-accent)]/5 px-3 py-2">
              <p className="mono-label">Vendedor</p>
              <p className="text-xs font-medium text-[var(--ink-soft)]">
                {lockedSellerName ?? 'Vendedor seleccionado'}
              </p>
            </div>
          ) : (
            sellers.length > 1 && (
              <div>
                <label className="mono-label block mb-1">Vendedor (opcional)</label>
                <select
                  value={sellerId}
                  onChange={(e) => setSellerId(e.target.value)}
                  className="w-full bg-[var(--paper)] border border-[var(--surface-border)] rounded-[5px] px-3 py-2 text-xs text-[var(--color-text)] focus:outline-none focus:border-[var(--color-accent)]"
                >
                  <option value="">Detectar automáticamente</option>
                  {sellers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} (@{s.username})
                    </option>
                  ))}
                </select>
              </div>
            )
          )}

          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setMode('camera')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-[5px] text-[10px] font-mono font-bold uppercase tracking-wider border transition ${
                mode === 'camera'
                  ? 'bg-[var(--color-accent)]/10 border-[var(--color-accent)]/40 text-[var(--color-accent)]'
                  : 'border-[var(--surface-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              Cámara
            </button>
            <button
              type="button"
              onClick={() => setMode('manual')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-[5px] text-[10px] font-mono font-bold uppercase tracking-wider border transition ${
                mode === 'manual'
                  ? 'bg-[var(--color-accent)]/10 border-[var(--color-accent)]/40 text-[var(--color-accent)]'
                  : 'border-[var(--surface-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
              }`}
            >
              <Keyboard className="w-3.5 h-3.5" />
              Manual
            </button>
          </div>

          {mode === 'camera' ? (
            <div className="space-y-2 flex-1 flex flex-col min-h-0">
              <div
                id={readerId}
                className="ml-scanner-reader w-full flex-1 min-h-[min(52vh,22rem)] sm:min-h-[220px] overflow-hidden rounded-lg border border-[var(--surface-border)] bg-black"
              />
              {cameraError && (
                <p className="text-[10px] text-[var(--color-warn)]">{cameraError}</p>
              )}
              <p className="text-[10px] text-[var(--color-text-faint)] text-center">
                Apuntá al código de barras de la etiqueta de Mercado Libre Flex
              </p>
            </div>
          ) : (
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                void runImport(manualCode);
              }}
            >
              <input
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="Código de orden o envío ML"
                className="w-full bg-[var(--paper)] border border-[var(--surface-border)] rounded-[5px] px-3 py-2 text-xs text-[var(--color-text)] placeholder:text-[var(--color-text-faint)] focus:outline-none focus:border-[var(--color-accent)]"
                autoFocus
              />
              <button
                type="submit"
                disabled={importing || !manualCode.trim()}
                className="btn-primary w-full py-2 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {importing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Importando…
                  </>
                ) : (
                  'Importar envío'
                )}
              </button>
            </form>
          )}

          {importing && mode === 'camera' && (
            <div className="flex items-center justify-center gap-2 text-[11px] text-[var(--color-text-muted)]">
              <Loader2 className="w-4 h-4 animate-spin" />
              Importando envío…
            </div>
          )}

          {statusMessage && (
            <p
              className={`text-[11px] font-mono rounded-lg px-3 py-2 border ${
                statusOk
                  ? 'text-[var(--color-ok)] border-[var(--color-ok)]/30 bg-[var(--color-ok)]/5'
                  : 'text-[var(--color-danger)] border-[var(--color-danger)]/30 bg-[var(--color-danger)]/5'
              }`}
            >
              {statusMessage}
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
