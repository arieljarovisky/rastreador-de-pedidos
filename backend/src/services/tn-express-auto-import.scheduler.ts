import { runTiendaNubeExpressAutoImport } from './marketplace-import.service.js';

/** Cada 5 min; respaldo si TN no entrega webhooks a tiempo. */
const INTERVAL_MS = Math.max(
  60_000,
  Number(process.env.TN_EXPRESS_AUTO_IMPORT_INTERVAL_MS ?? 5 * 60_000) || 5 * 60_000
);

const START_DELAY_MS = 60_000;

let inFlight = false;

async function tick(): Promise<void> {
  if (inFlight) return;
  inFlight = true;
  try {
    await runTiendaNubeExpressAutoImport();
  } catch (err) {
    console.error(
      '[tn-auto-import] Error en corrida:',
      err instanceof Error ? err.message : err
    );
  } finally {
    inFlight = false;
  }
}

/** Importa Express automáticamente mientras el vendedor tenga TN conectado. */
export function startTiendaNubeExpressAutoImportScheduler(): void {
  setTimeout(() => {
    void tick();
    setInterval(() => {
      void tick();
    }, INTERVAL_MS);
  }, START_DELAY_MS);

  console.log(
    `[tn-auto-import] Auto-import Express activo (cada ${Math.round(INTERVAL_MS / 1000)}s, arranca en ${Math.round(START_DELAY_MS / 1000)}s)`
  );
}
