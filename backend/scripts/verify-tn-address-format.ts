/**
 * Verifica que formatTnAddress concatene calle + altura (bug del pedido #2463).
 * Ejecutar: npx tsx scripts/verify-tn-address-format.ts
 */
import {
  addressMissingStreetNumber,
  formatTnAddress,
  mapTiendaNubeOrderToShipment,
  type TnOrder,
} from '../src/services/tiendanube.service.js';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const baunessCase = formatTnAddress({
  address: 'Bauness',
  number: '1275',
  floor: '7 / PB',
  locality: 'Parque chass',
  city: 'Capital Federal',
  province: 'Capital Federal',
  zipcode: '1427',
});

assert(
  baunessCase.startsWith('Bauness 1275'),
  `esperado calle+altura al inicio, obtuvo: ${baunessCase}`
);
assert(
  baunessCase.includes('7 / PB'),
  `esperado conservar piso/depto, obtuvo: ${baunessCase}`
);
assert(
  !addressMissingStreetNumber(baunessCase),
  'la dirección formateada no debería marcarse sin altura'
);
assert(
  addressMissingStreetNumber('Bauness, 7 / PB, Parque chass, Capital Federal'),
  'el formato viejo (sin altura) debería detectarse'
);

// number numérico (API nueva) y address ya con altura no se duplica
assert(
  formatTnAddress({ address: 'Bauness', number: 1275 }).startsWith('Bauness 1275'),
  'number numérico debe concatenarse'
);
assert(
  formatTnAddress({ address: 'Bauness 1275', number: '1275' }).startsWith('Bauness 1275'),
  'no debe duplicar altura si ya está en address'
);
assert(
  formatTnAddress({ street: 'Bauness', number: '1275' }).startsWith('Bauness 1275'),
  'fallback street+number'
);
assert(
  !formatTnAddress({ address: 'Bauness', number: 'No informado' }).includes('No informado'),
  'debe filtrar placeholder TN'
);

const order = {
  id: 9001,
  number: 2463,
  created_at: '2026-10-17T12:00:00Z',
  payment_status: 'paid',
  status: 'open',
  customer: { name: 'Sofia Nacarato', phone: '+541130546362' },
  shipping_option: 'Envíos en el día',
  shipping_address: {
    name: 'Sofia Nacarato',
    phone: '+541130546362',
    address: 'Bauness',
    number: '1275',
    floor: '7 / PB',
    locality: 'Parque chass',
    city: 'Capital Federal',
    province: 'Capital Federal',
    zipcode: '1427',
  },
} as TnOrder;

const shipment = mapTiendaNubeOrderToShipment(order);
assert(shipment != null, 'el pedido Express debería mapearse');
assert(
  shipment!.address.startsWith('Bauness 1275'),
  `shipment.address incorrecto: ${shipment!.address}`
);

console.log('OK formatTnAddress / mapTiendaNubeOrderToShipment');
console.log(shipment!.address);
