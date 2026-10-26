/**
 * Regresión: direcciones del interior (p. ej. Pigüé CP 8170, calle Belgrano)
 * no deben resolverse como CABA / AMBA.
 *
 * Ejecutar: npx tsx scripts/verify-geocode-outside-amba.ts
 */
import { ambaPointForPostalCode } from '../src/config/amba-postal-codes.js';
import {
  addressHasNonAmbaPostalCode,
  ambaFallbackFromAddress,
  extractArgentinePostalDigits,
  localityFallbackQueries,
} from '../src/services/geocode.service.js';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

/** Bbox aproximado CABA+AMBA cercano; un punto de Pigüé no debe caer acá. */
function looksLikeAmba(lat: number, lng: number): boolean {
  return lat <= -34.0 && lat >= -35.1 && lng >= -59.2 && lng <= -57.85;
}

const pigueTn = 'Belgrano 336, Abra de Hinojo, Pigüé, Buenos Aires, 8170, Argentina';
const pigueCommaStreet = 'Belgrano, 336, Abra de Hinojo, Pigüé, Buenos Aires, 8170, Argentina';
const cabaControl = 'Bauness 1275, 7 / PB, Parque chass, Capital Federal, 1427, Argentina';

assert(extractArgentinePostalDigits(pigueTn) === '8170', 'CP Pigüé TN');
assert(extractArgentinePostalDigits(pigueCommaStreet) === '8170', 'CP Pigüé con coma');
assert(extractArgentinePostalDigits(cabaControl) === '1427', 'CP CABA control');

assert(ambaPointForPostalCode('8170') == null, '8170 no es CP AMBA');
assert(ambaPointForPostalCode('1427') != null, '1427 es CP AMBA');

assert(addressHasNonAmbaPostalCode(pigueTn), 'Pigüé debe marcarse fuera de AMBA');
assert(addressHasNonAmbaPostalCode(pigueCommaStreet), 'Pigüé (coma) fuera de AMBA');
assert(!addressHasNonAmbaPostalCode(cabaControl), 'CABA control no es fuera de AMBA');

assert(
  ambaFallbackFromAddress(pigueTn) == null,
  'fallback AMBA no debe aplicar a Pigüé (formato TN)'
);
assert(
  ambaFallbackFromAddress(pigueCommaStreet) == null,
  'fallback AMBA no debe matchear calle Belgrano → barrio CABA'
);

const belgranoOnlyStreet = ambaFallbackFromAddress(
  'Belgrano, 336, Abra de Hinojo, Pigüé, Buenos Aires, Argentina'
);
assert(
  belgranoOnlyStreet == null || !looksLikeAmba(belgranoOnlyStreet.lat, belgranoOnlyStreet.lng),
  'sin CP AMBA, Belgrano calle no debe anclar a CABA'
);

const cabaFallback = ambaFallbackFromAddress(cabaControl);
assert(cabaFallback != null, 'CABA control debe tener fallback AMBA por CP');
assert(looksLikeAmba(cabaFallback!.lat, cabaFallback!.lng), 'CABA control en bbox AMBA');

const localityQueries = localityFallbackQueries(pigueTn);
assert(
  localityQueries.some((q) => /pig[uü]é/i.test(q) && /8170|buenos aires/i.test(q)),
  `locality fallback debe incluir Pigüé; obtuvo: ${JSON.stringify(localityQueries)}`
);
assert(
  !localityQueries.some((q) => /^belgrano\b/i.test(q.trim())),
  'locality fallback no debe empezar por la calle Belgrano'
);

console.log('OK verify-geocode-outside-amba');
console.log('locality queries:', localityQueries);
