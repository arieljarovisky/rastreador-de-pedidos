/**
 * Descarga el último APK de EAS y lo guarda en backend/downloads/posta-repartidor.apk
 * Uso: node scripts/save-apk-to-backend.mjs [build-id]
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.resolve(__dirname, '..');
const outPath = path.resolve(mobileRoot, '..', 'backend', 'downloads', 'posta-repartidor.apk');
const buildId = process.argv[2];

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
  if (latest.status !== 'FINISHED') throw new Error(`El último build (${latest.id}) no terminó: ${latest.status}`);
  id = latest.id;
}

const view = JSON.parse(run(`npx eas-cli build:view ${id} --json`));
const url = view?.artifacts?.applicationArchiveUrl ?? view?.artifacts?.buildUrl;
if (!url) throw new Error(`Build ${id} sin URL de artefacto.`);

fs.mkdirSync(path.dirname(outPath), { recursive: true });
run(`curl -fsSL "${url}" -o "${outPath}"`);

const sizeMb = (fs.statSync(outPath).size / (1024 * 1024)).toFixed(1);
console.log(`APK guardado: ${outPath} (${sizeMb} MB)`);
