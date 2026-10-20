/**
 * Corrige pedidos TN importados sin altura.
 * Uso (con .env de producción):
 *   node ./node_modules/tsx/dist/cli.mjs scripts/repair-tn-addresses.ts
 */
import { repairTiendaNubeOrdersMissingStreetNumber } from '../src/services/marketplace-import.service.js';
import { pool } from '../src/config/database.js';

async function main() {
  const result = await repairTiendaNubeOrdersMissingStreetNumber();
  console.log(JSON.stringify(result, null, 2));
  await pool.end();
  if (result.errors.length > 0 && result.repaired === 0) {
    process.exitCode = 1;
  }
}

main().catch(async (err) => {
  console.error(err);
  try {
    await pool.end();
  } catch {
    // ignore
  }
  process.exit(1);
});
