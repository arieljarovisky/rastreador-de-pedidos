import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const svg = path.join(root, 'assets', 'icon-posta.svg');
const outputs = ['icon.png', 'adaptive-icon.png'].map((name) => path.join(root, 'assets', name));

for (const output of outputs) {
  execFileSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['-y', '@resvg/resvg-js-cli', '--fit-width', '1024', svg, output],
    { stdio: 'inherit', cwd: root }
  );
}

console.log('Iconos generados desde assets/icon-posta.svg');
