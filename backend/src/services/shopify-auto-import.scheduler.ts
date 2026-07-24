import { runShopifyAutoImport } from './marketplace-import.service.js';

const INTERVAL_MS = Math.max(
  60_000,
  Number(process.env.SHOPIFY_AUTO_IMPORT_INTERVAL_MS ?? 5 * 60_000) || 5 * 60_000
);

const START_DELAY_MS = 75_000;

let inFlight = false;

async function tick(): Promise<void> {
  if (inFlight) return;
  inFlight = true;
  try {
    await runShopifyAutoImport();
  } catch (err) {
    console.error(
      '[shopify-auto-import] Error en corrida:',
      err instanceof Error ? err.message : err
    );
  } finally {
    inFlight = false;
  }
}

/** Importa pedidos Shopify automáticamente mientras el vendedor tenga la tienda conectada. */
export function startShopifyAutoImportScheduler(): void {
  setTimeout(() => {
    void tick();
    setInterval(() => {
      void tick();
    }, INTERVAL_MS);
  }, START_DELAY_MS);

  console.log(
    `[shopify-auto-import] Auto-import activo (cada ${Math.round(INTERVAL_MS / 1000)}s, arranca en ${Math.round(START_DELAY_MS / 1000)}s)`
  );
}
