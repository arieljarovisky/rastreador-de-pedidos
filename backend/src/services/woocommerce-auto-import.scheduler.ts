import { runWooCommerceAutoImport } from './marketplace-import.service.js';

const INTERVAL_MS = Math.max(
  60_000,
  Number(process.env.WOO_AUTO_IMPORT_INTERVAL_MS ?? 5 * 60_000) || 5 * 60_000
);

const START_DELAY_MS = 90_000;

let inFlight = false;

async function tick(): Promise<void> {
  if (inFlight) return;
  inFlight = true;
  try {
    await runWooCommerceAutoImport();
  } catch (err) {
    console.error(
      '[woo-auto-import] Error en corrida:',
      err instanceof Error ? err.message : err
    );
  } finally {
    inFlight = false;
  }
}

/** Importa pedidos WooCommerce automáticamente mientras el vendedor tenga la tienda conectada. */
export function startWooCommerceAutoImportScheduler(): void {
  setTimeout(() => {
    void tick();
    setInterval(() => {
      void tick();
    }, INTERVAL_MS);
  }, START_DELAY_MS);

  console.log(
    `[woo-auto-import] Auto-import activo (cada ${Math.round(INTERVAL_MS / 1000)}s, arranca en ${Math.round(START_DELAY_MS / 1000)}s)`
  );
}
