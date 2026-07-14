import { runMercadoLibreFlexAutoImport } from './marketplace-import.service.js';

/** Cada 5 min; suficiente para cubrir Flex sin martillar la API de ML. */
const INTERVAL_MS = Math.max(
  60_000,
  Number(process.env.ML_FLEX_AUTO_IMPORT_INTERVAL_MS ?? 5 * 60_000) || 5 * 60_000
);

const START_DELAY_MS = 45_000;

let inFlight = false;

async function tick(): Promise<void> {
  if (inFlight) return;
  inFlight = true;
  try {
    await runMercadoLibreFlexAutoImport();
  } catch (err) {
    console.error(
      '[ml-auto-import] Error en corrida:',
      err instanceof Error ? err.message : err
    );
  } finally {
    inFlight = false;
  }
}

/** Importa envíos Flex automáticamente mientras el vendedor/agencia tenga ML conectado. */
export function startMercadoLibreFlexAutoImportScheduler(): void {
  setTimeout(() => {
    void tick();
    setInterval(() => {
      void tick();
    }, INTERVAL_MS);
  }, START_DELAY_MS);

  console.log(
    `[ml-auto-import] Auto-import Flex activo (cada ${Math.round(INTERVAL_MS / 1000)}s, arranca en ${Math.round(START_DELAY_MS / 1000)}s)`
  );
}
