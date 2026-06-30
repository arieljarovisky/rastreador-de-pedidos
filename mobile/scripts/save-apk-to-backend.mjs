/**
 * Descarga el último APK de EAS y lo publica en backend/downloads/
 *
 * Uso:
 *   node scripts/save-apk-to-backend.mjs [build-id] [--min-version 1.1.0] [--message "..."]
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.resolve(__dirname, '..');
const backendDownloads = path.resolve(mobileRoot, '..', 'backend', 'downloads');
const outPath = path.join(backendDownloads, 'posta-repartidor.apk');
const versionPath = path.join(backendDownloads, 'app-version.json');
const appJsonPath = path.join(mobileRoot, 'app.json');

function parseArgs(argv) {
  const positional = [];
  let minVersion;
  let message;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--min-version') {
      minVersion = argv[i + 1];
      i += 1;
    } else if (arg === '--message') {
      message = argv[i + 1];
      i += 1;
    } else if (!arg.startsWith('--')) {
      positional.push(arg);
    }
  }
  return { buildId: positional[0], minVersion, message };
}

const { buildId, minVersion: minVersionArg, message: messageArg } = parseArgs(
  process.argv.slice(2)
);

function run(cmd) {
  return execSync(cmd, { cwd: mobileRoot, encoding: 'utf8', stdio: ['pipe', 'pipe', 'inherit'] });
}

let id = buildId;
if (!id) {
  const list = JSON.parse(
    run('npx eas-cli build:list --platform android --limit 1 --json --non-interactive')
  );
  const latest = list?.[0];
  if (!latest?.id) throw new Error('No hay builds de Android en EAS.');
  if (latest.status !== 'FINISHED') {
    throw new Error(`El último build (${latest.id}) no terminó: ${latest.status}`);
  }
  id = latest.id;
}

const view = JSON.parse(run(`npx eas-cli build:view ${id} --json`));
const url = view?.artifacts?.applicationArchiveUrl ?? view?.artifacts?.buildUrl;
if (!url) throw new Error(`Build ${id} sin URL de artefacto.`);

fs.mkdirSync(path.dirname(outPath), { recursive: true });
run(`curl -fsSL "${url}" -o "${outPath}"`);

const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
const version = appJson?.expo?.version ?? '1.0.0';

const versionPayload = {
  version,
  minVersion: minVersionArg ?? version,
  message:
    messageArg ??
    'Hay una nueva versión de Posta. Actualizá para seguir usando la app con las últimas mejoras.',
};
fs.writeFileSync(versionPath, `${JSON.stringify(versionPayload, null, 2)}\n`);

const sizeMb = (fs.statSync(outPath).size / (1024 * 1024)).toFixed(1);
console.log(`APK guardado: ${outPath} (${sizeMb} MB)`);
console.log(`Versión publicada: ${versionPayload.version} (mínima: ${versionPayload.minVersion})`);
console.log(`Metadata: ${versionPath}`);
console.log(`Build EAS: ${id}`);
