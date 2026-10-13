import { BARRIOS, getBarrioById } from './barrios.js';

/**
 * CPA de 4 dígitos del AMBA → barrio operativo.
 * Sirve para cotizar en el checkout sin geocodificar (Nominatim no llega a tiempo).
 * Los rangos no se solapan: cada CP cae en un solo cordón.
 */
const POSTAL_RANGES: Array<[number, number, string]> = [
  [1000, 1440, 'san_nicolas'],
  [1602, 1607, 'vicente_lopez'],
  [1609, 1609, 'san_isidro'],
  [1610, 1611, 'tigre'],
  [1613, 1615, 'malvinas_argentinas'],
  [1617, 1618, 'tigre'],
  [1619, 1619, 'escobar'],
  [1621, 1621, 'tigre'],
  [1623, 1627, 'escobar'],
  [1629, 1635, 'pilar'],
  [1636, 1638, 'vicente_lopez'],
  [1640, 1643, 'san_isidro'],
  [1644, 1646, 'san_fernando'],
  [1648, 1649, 'tigre'],
  [1650, 1659, 'san_martin_gba'],
  [1661, 1663, 'san_miguel'],
  [1665, 1665, 'jose_c_paz'],
  [1667, 1669, 'san_miguel'],
  [1672, 1672, 'san_martin_gba'],
  [1674, 1684, 'tres_de_febrero'],
  [1686, 1688, 'hurlingham'],
  [1702, 1702, 'tres_de_febrero'],
  [1704, 1704, 'la_matanza_norte'],
  [1706, 1712, 'moron'],
  [1713, 1714, 'ituzaingo'],
  [1718, 1723, 'merlo'],
  [1727, 1727, 'marcos_paz'],
  [1742, 1746, 'moreno'],
  [1748, 1748, 'general_rodriguez'],
  [1752, 1754, 'la_matanza_norte'],
  [1755, 1765, 'la_matanza_sur'],
  [1766, 1772, 'la_matanza_norte'],
  [1778, 1778, 'la_matanza_sur'],
  [1802, 1806, 'ezeiza'],
  [1814, 1816, 'canuelas'],
  [1822, 1826, 'lanus'],
  [1828, 1828, 'avellaneda'],
  [1832, 1838, 'lomas_de_zamora'],
  [1842, 1842, 'esteban_echeverria'],
  [1846, 1858, 'almirante_brown'],
  [1862, 1862, 'presidente_peron'],
  [1864, 1865, 'san_vicente'],
  [1870, 1875, 'avellaneda'],
  [1876, 1882, 'quilmes'],
  [1884, 1886, 'berazategui'],
  [1888, 1892, 'florencio_varela'],
  [1894, 1906, 'la_plata'],
  [1923, 1923, 'berisso'],
  [1925, 1925, 'ensenada'],
  [2800, 2802, 'zarate'],
  [2804, 2804, 'campana'],
  [6700, 6702, 'lujan'],
];

const CITY_ALIASES: Record<string, string> = {
  caba: 'san_nicolas',
  'capital federal': 'san_nicolas',
  'ciudad autonoma de buenos aires': 'san_nicolas',
  'ciudad autónoma de buenos aires': 'san_nicolas',
  'ciudad de buenos aires': 'san_nicolas',
  'caba argentina': 'san_nicolas',
};

const postalToBarrio = new Map<number, string>();
for (const [from, to, barrioId] of POSTAL_RANGES) {
  for (let cp = from; cp <= to; cp += 1) {
    if (postalToBarrio.has(cp)) {
      throw new Error(`CP AMBA duplicado: ${cp}`);
    }
    postalToBarrio.set(cp, barrioId);
  }
}

export interface AmbaPostalPoint {
  barrioId: string;
  lat: number;
  lng: number;
}

function pointForBarrio(barrioId: string): AmbaPostalPoint | null {
  const barrio = getBarrioById(barrioId);
  if (!barrio) return null;
  return {
    barrioId,
    lat: (barrio.south + barrio.north) / 2,
    lng: (barrio.west + barrio.east) / 2,
  };
}

export function ambaPointForPostalCode(rawPostalCode: string): AmbaPostalPoint | null {
  const cp = Number(rawPostalCode);
  if (!Number.isInteger(cp)) return null;
  const barrioId = postalToBarrio.get(cp);
  if (!barrioId) return null;
  return pointForBarrio(barrioId);
}

function fold(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Localidad o ciudad del checkout → punto dentro del barrio, si lo reconocemos. */
export function ambaPointForPlaceName(raw: string | null | undefined): AmbaPostalPoint | null {
  if (!raw) return null;
  const key = fold(raw);
  if (!key || key === 'argentina' || key === 'buenos aires') return null;
  const alias = CITY_ALIASES[key];
  if (alias) return pointForBarrio(alias);

  const barrioId = key.replace(/\s+/g, '_');
  const byId = getBarrioById(barrioId);
  if (byId) return pointForBarrio(byId.id);

  const byName = BARRIOS.find((barrio) => fold(barrio.name) === key);
  if (byName) return pointForBarrio(byName.id);
  return null;
}
