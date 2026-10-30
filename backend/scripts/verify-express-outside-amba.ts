/**
 * Regresión: Express no debe cotizar / resolverse como AMBA en Mendoza
 * (San Martín CP 5570 ≠ San Martín GBA).
 *
 * Ejecutar: npx tsx scripts/verify-express-outside-amba.ts
 */
import { ambaPointForPostalCode, ambaPointForPlaceName } from '../src/config/amba-postal-codes.js';
import { addressHasNonAmbaPostalCode } from '../src/services/geocode.service.js';
import {
  provinceIsOutsideAmba,
  resolveAmbaLocalPoint,
} from '../src/services/postal-code-geo.service.js';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const mendozaAddress = 'Av lima 357, San Martin, Mendoza, 5570, Argentina';

assert(ambaPointForPostalCode('5570') == null, '5570 no es CP AMBA');
assert(ambaPointForPlaceName('San Martin') != null, 'San Martín GBA existe (nombre ambiguo)');
assert(ambaPointForPlaceName('San Martín') != null, 'San Martín con tilde también');

assert(provinceIsOutsideAmba('Mendoza'), 'Mendoza fuera de AMBA');
assert(provinceIsOutsideAmba('Córdoba'), 'Córdoba fuera de AMBA');
assert(!provinceIsOutsideAmba('Buenos Aires'), 'Buenos Aires no se corta solo por provincia');
assert(!provinceIsOutsideAmba('Capital Federal'), 'CABA no se corta por provincia');
assert(!provinceIsOutsideAmba(null), 'sin provincia no afirmamos');

assert(
  resolveAmbaLocalPoint('5570', { city: 'San Martin', locality: 'San Martin', province: 'Mendoza' }) ==
    null,
  'CP 5570 + San Martín Mendoza no debe resolver AMBA'
);
assert(
  resolveAmbaLocalPoint('5570', { city: 'San Martin', locality: 'San Martin' }) == null,
  'CP 5570 sin provincia tampoco debe usar nombre San Martín → GBA'
);
assert(
  resolveAmbaLocalPoint(null, { city: 'San Martin', province: 'Mendoza' }) == null,
  'provincia Mendoza bloquea match por ciudad'
);

const gbaSanMartin = resolveAmbaLocalPoint('1650', {
  city: 'San Martin',
  locality: 'San Martin',
  province: 'Buenos Aires',
});
assert(gbaSanMartin != null, 'CP 1650 San Martín BA sí es AMBA');
assert(gbaSanMartin!.barrioId === 'san_martin_gba', `barrio GBA, obtuvo ${gbaSanMartin!.barrioId}`);

const byNameOnly = resolveAmbaLocalPoint(null, { city: 'San Martin' });
assert(byNameOnly != null, 'sin CP, San Martín puede resolver GBA (checkout sin zip)');

assert(addressHasNonAmbaPostalCode(mendozaAddress), 'etiqueta Mendoza debe marcarse fuera de AMBA');

console.log('OK verify-express-outside-amba');
