/**
 * Verificación rápida de la allowlist del dueño de Posta (sin DB).
 * Uso: PLATFORM_OWNER_EMAILS=a@posta.com,b@posta.com npx tsx scripts/verify-platform-access.ts
 */
import { env } from '../src/config/env.js';
import { isPlatformOwnerEmail } from '../src/middleware/platform.js';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exitCode = 1;
  } else {
    console.log('OK:', msg);
  }
}

const configured = env.platformOwnerEmails;
console.log('PLATFORM_OWNER_EMAILS =', configured);

if (configured.length === 0) {
  assert(!isPlatformOwnerEmail('cualquiera@posta.com'), 'sin allowlist nadie es dueño');
} else {
  const first = configured[0]!;
  assert(isPlatformOwnerEmail(first), `email configurado es dueño (${first})`);
  assert(isPlatformOwnerEmail(first.toUpperCase()), 'comparación case-insensitive');
  assert(!isPlatformOwnerEmail('no-es-dueno@example.com'), 'email ajeno no es dueño');
}

assert(!isPlatformOwnerEmail(''), 'email vacío no es dueño');
assert(!isPlatformOwnerEmail(null), 'null no es dueño');

if (process.exitCode) {
  console.error('Verificación fallida');
  process.exit(1);
}
console.log('Verificación OK');
