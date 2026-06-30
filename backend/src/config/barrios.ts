export interface Barrio {
  id: string;
  name: string;
  area: 'CABA' | 'GBA';
  south: number;
  west: number;
  north: number;
  east: number;
}

/** Barrios de CABA y GBA con rectángulos aproximados para zonas de entrega. */
export const BARRIOS: Barrio[] = [
  // CABA — Centro y norte
  { id: 'retiro', name: 'Retiro', area: 'CABA', south: -34.598, west: -58.385, north: -34.585, east: -58.365 },
  { id: 'san_nicolas', name: 'San Nicolás', area: 'CABA', south: -34.612, west: -58.385, north: -34.598, east: -58.365 },
  { id: 'recoleta', name: 'Recoleta', area: 'CABA', south: -34.595, west: -58.405, north: -34.575, east: -58.385 },
  { id: 'barrio_norte', name: 'Barrio Norte', area: 'CABA', south: -34.592, west: -58.405, north: -34.578, east: -58.388 },
  { id: 'palermo', name: 'Palermo', area: 'CABA', south: -34.595, west: -58.445, north: -34.565, east: -58.405 },
  { id: 'belgrano', name: 'Belgrano', area: 'CABA', south: -34.575, west: -58.475, north: -34.545, east: -58.445 },
  { id: 'nunez', name: 'Núñez', area: 'CABA', south: -34.555, west: -58.475, north: -34.535, east: -58.455 },
  { id: 'colegiales', name: 'Colegiales', area: 'CABA', south: -34.575, west: -58.455, north: -34.560, east: -58.440 },
  { id: 'coghlan', name: 'Coghlan', area: 'CABA', south: -34.565, west: -58.490, north: -34.552, east: -58.475 },
  { id: 'saavedra', name: 'Saavedra', area: 'CABA', south: -34.555, west: -58.500, north: -34.538, east: -58.475 },
  { id: 'villa_urquiza', name: 'Villa Urquiza', area: 'CABA', south: -34.585, west: -58.500, north: -34.560, east: -58.475 },
  { id: 'villa_pueyrredon', name: 'Villa Pueyrredón', area: 'CABA', south: -34.600, west: -58.510, north: -34.585, east: -58.490 },
  { id: 'devoto', name: 'Villa Devoto', area: 'CABA', south: -34.610, west: -58.530, north: -34.590, east: -58.505 },
  { id: 'villa_del_parque', name: 'Villa del Parque', area: 'CABA', south: -34.615, west: -58.505, north: -34.600, east: -58.485 },
  { id: 'agronomia', name: 'Agronomía', area: 'CABA', south: -34.600, west: -58.520, north: -34.585, east: -58.505 },
  { id: 'parque_chas', name: 'Parque Chas', area: 'CABA', south: -34.590, west: -58.490, north: -34.578, east: -58.475 },
  // CABA — Centro y sur
  { id: 'balvanera', name: 'Balvanera', area: 'CABA', south: -34.625, west: -58.410, north: -34.605, east: -58.390 },
  { id: 'san_telmo', name: 'San Telmo', area: 'CABA', south: -34.630, west: -58.380, north: -34.615, east: -58.365 },
  { id: 'montserrat', name: 'Montserrat', area: 'CABA', south: -34.620, west: -58.385, north: -34.605, east: -58.365 },
  { id: 'constitucion', name: 'Constitución', area: 'CABA', south: -34.640, west: -58.390, north: -34.625, east: -58.370 },
  { id: 'san_cristobal', name: 'San Cristóbal', area: 'CABA', south: -34.635, west: -58.410, north: -34.620, east: -58.390 },
  { id: 'boedo', name: 'Boedo', area: 'CABA', south: -34.640, west: -58.425, north: -34.625, east: -58.405 },
  { id: 'almagro', name: 'Almagro', area: 'CABA', south: -34.615, west: -58.430, north: -34.600, east: -58.410 },
  { id: 'caballito', name: 'Caballito', area: 'CABA', south: -34.635, west: -58.455, north: -34.615, east: -58.430 },
  { id: 'parque_chacabuco', name: 'Parque Chacabuco', area: 'CABA', south: -34.645, west: -58.445, north: -34.630, east: -58.425 },
  { id: 'villa_crespo', name: 'Villa Crespo', area: 'CABA', south: -34.605, west: -58.450, north: -34.590, east: -58.430 },
  { id: 'chacarita', name: 'Chacarita', area: 'CABA', south: -34.595, west: -58.460, north: -34.580, east: -58.445 },
  { id: 'paternal', name: 'Paternal', area: 'CABA', south: -34.605, west: -58.475, north: -34.590, east: -58.455 },
  { id: 'villa_santa_rita', name: 'Villa Santa Rita', area: 'CABA', south: -34.625, west: -58.475, north: -34.610, east: -58.455 },
  { id: 'flores', name: 'Flores', area: 'CABA', south: -34.645, west: -58.475, north: -34.625, east: -58.450 },
  { id: 'floresta', name: 'Floresta', area: 'CABA', south: -34.635, west: -58.495, north: -34.620, east: -58.475 },
  { id: 'velez_sarsfield', name: 'Vélez Sársfield', area: 'CABA', south: -34.650, west: -58.505, north: -34.635, east: -58.485 },
  { id: 'liniers', name: 'Liniers', area: 'CABA', south: -34.670, west: -58.535, north: -34.650, east: -58.510 },
  { id: 'mataderos', name: 'Mataderos', area: 'CABA', south: -34.670, west: -58.510, north: -34.650, east: -58.485 },
  { id: 'parque_avellaneda', name: 'Parque Avellaneda', area: 'CABA', south: -34.660, west: -58.490, north: -34.645, east: -58.470 },
  { id: 'villa_luro', name: 'Villa Luro', area: 'CABA', south: -34.645, west: -58.515, north: -34.630, east: -58.495 },
  { id: 'versalles', name: 'Versalles', area: 'CABA', south: -34.640, west: -58.530, north: -34.628, east: -58.515 },
  { id: 'monte_castro', name: 'Monte Castro', area: 'CABA', south: -34.625, west: -58.520, north: -34.610, east: -58.500 },
  { id: 'villa_real', name: 'Villa Real', area: 'CABA', south: -34.635, west: -58.530, north: -34.622, east: -58.515 },
  { id: 'villa_riachuelo', name: 'Villa Riachuelo', area: 'CABA', south: -34.685, west: -58.470, north: -34.665, east: -58.445 },
  { id: 'villa_lugano', name: 'Villa Lugano', area: 'CABA', south: -34.685, west: -58.500, north: -34.660, east: -58.470 },
  { id: 'villa_soldati', name: 'Villa Soldati', area: 'CABA', south: -34.675, west: -58.460, north: -34.655, east: -58.440 },
  { id: 'nueva_pompeya', name: 'Nueva Pompeya', area: 'CABA', south: -34.660, west: -58.430, north: -34.645, east: -58.405 },
  { id: 'barracas', name: 'Barracas', area: 'CABA', south: -34.655, west: -58.385, north: -34.635, east: -58.360 },
  { id: 'la_boca', name: 'La Boca', area: 'CABA', south: -34.650, west: -58.370, north: -34.630, east: -58.345 },
  { id: 'puerto_madero', name: 'Puerto Madero', area: 'CABA', south: -34.625, west: -58.370, north: -34.605, east: -58.350 },
  { id: 'parque_patricios', name: 'Parque Patricios', area: 'CABA', south: -34.645, west: -58.410, north: -34.630, east: -58.390 },
  // GBA — Zona norte
  { id: 'vicente_lopez', name: 'Vicente López', area: 'GBA', south: -34.540, west: -58.490, north: -34.510, east: -58.455 },
  { id: 'san_isidro', name: 'San Isidro', area: 'GBA', south: -34.510, west: -58.540, north: -34.470, east: -58.490 },
  { id: 'tigre', name: 'Tigre', area: 'GBA', south: -34.450, west: -58.620, north: -34.400, east: -58.520 },
  { id: 'san_fernando', name: 'San Fernando', area: 'GBA', south: -34.460, west: -58.520, north: -34.430, east: -58.480 },
  { id: 'escobar', name: 'Escobar', area: 'GBA', south: -34.380, west: -58.820, north: -34.320, east: -58.720 },
  { id: 'pilar', name: 'Pilar', area: 'GBA', south: -34.500, west: -58.950, north: -34.420, east: -58.850 },
  { id: 'malvinas_argentinas', name: 'Malvinas Argentinas', area: 'GBA', south: -34.520, west: -58.720, north: -34.480, east: -58.680 },
  { id: 'tortuguitas', name: 'Tortuguitas', area: 'GBA', south: -34.490, west: -58.760, north: -34.460, east: -58.720 },
  // GBA — Zona oeste
  { id: 'moron', name: 'Morón', area: 'GBA', south: -34.660, west: -58.640, north: -34.620, east: -58.600 },
  { id: 'hurlingham', name: 'Hurlingham', area: 'GBA', south: -34.610, west: -58.660, north: -34.580, east: -58.620 },
  { id: 'ituzaingo', name: 'Ituzaingó', area: 'GBA', south: -34.680, west: -58.680, north: -34.640, east: -58.640 },
  { id: 'tres_de_febrero', name: 'Tres de Febrero', area: 'GBA', south: -34.620, west: -58.580, north: -34.580, east: -58.530 },
  { id: 'san_martin_gba', name: 'San Martín', area: 'GBA', south: -34.590, west: -58.560, north: -34.550, east: -58.520 },
  { id: 'la_matanza', name: 'La Matanza', area: 'GBA', south: -34.780, west: -58.650, north: -34.700, east: -58.580 },
  { id: 'merlo', name: 'Merlo', area: 'GBA', south: -34.720, west: -58.750, north: -34.660, east: -58.680 },
  { id: 'moreno', name: 'Moreno', area: 'GBA', south: -34.660, west: -58.820, north: -34.600, east: -58.740 },
  // GBA — Zona sur
  { id: 'avellaneda', name: 'Avellaneda', area: 'GBA', south: -34.680, west: -58.380, north: -34.650, east: -58.350 },
  { id: 'lanus', name: 'Lanús', area: 'GBA', south: -34.720, west: -58.420, north: -34.680, east: -58.370 },
  { id: 'lomas_de_zamora', name: 'Lomas de Zamora', area: 'GBA', south: -34.780, west: -58.430, north: -34.740, east: -58.380 },
  { id: 'quilmes', name: 'Quilmes', area: 'GBA', south: -34.750, west: -58.300, north: -34.700, east: -58.240 },
  { id: 'berazategui', name: 'Berazategui', area: 'GBA', south: -34.780, west: -58.250, north: -34.730, east: -58.180 },
  { id: 'florencio_varela', name: 'Florencio Varela', area: 'GBA', south: -34.830, west: -58.300, north: -34.780, east: -58.240 },
  { id: 'ezeiza', name: 'Ezeiza', area: 'GBA', south: -34.870, west: -58.560, north: -34.820, east: -58.480 },
  { id: 'esteban_echeverria', name: 'Esteban Echeverría', area: 'GBA', south: -34.820, west: -58.520, north: -34.770, east: -58.460 },
];

const barrioById = new Map(BARRIOS.map((b) => [b.id, b]));

export function listBarrios(): Barrio[] {
  return BARRIOS;
}

export function getBarrioById(id: string): Barrio | undefined {
  return barrioById.get(id);
}

export function resolveBarriosToBounds(barrioIds: string[]): {
  south: number;
  west: number;
  north: number;
  east: number;
  names: string[];
} {
  const barrios = barrioIds.map((id) => getBarrioById(id)).filter((b): b is Barrio => Boolean(b));
  if (barrios.length === 0) throw new Error('INVALID_BARRIOS');

  return {
    south: Math.min(...barrios.map((b) => b.south)),
    west: Math.min(...barrios.map((b) => b.west)),
    north: Math.max(...barrios.map((b) => b.north)),
    east: Math.max(...barrios.map((b) => b.east)),
    names: barrios.map((b) => b.name),
  };
}

export function pointInBarrio(lat: number, lng: number, barrioId: string): boolean {
  const barrio = getBarrioById(barrioId);
  if (!barrio) return false;
  return lat >= barrio.south && lat <= barrio.north && lng >= barrio.west && lng <= barrio.east;
}

export function pointInZoneBarrios(lat: number, lng: number, barrioIds: string[]): boolean {
  return barrioIds.some((id) => pointInBarrio(lat, lng, id));
}
