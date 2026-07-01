/**
 * Genera GeoJSON con polígonos oficiales (Georef IGN) para zonas Flex MLA.
 * Fuente: apis.datos.gob.ar — ejecutar tras actualizar departamentos-ar.geojson / provincias-ar.geojson
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const geoDir = join(root, 'frontend', 'public', 'geo');

/** ML Flex zone id → nombre en Georef (departamento BA o CABA). */
const ML_ZONE_GEO_NAMES = {
  CABA: '__CABA__',
  Vicente_Lopez: 'Vicente López',
  San_Isidro: 'San Isidro',
  San_Fernando: 'San Fernando',
  Avellaneda: 'Avellaneda',
  Lanus: 'Lanús',
  Moron: 'Morón',
  Hurlingham: 'Hurlingham',
  Ituzaingo: 'Ituzaingó',
  San_Martin: 'General San Martín',
  Tres_De_Febrero: 'Tres de Febrero',
  La_Matanza_1: 'La Matanza',
  La_Matanza_2: 'La Matanza',
  Quilmes: 'Quilmes',
  Berazategui: 'Berazategui',
  Lomas_de_Zamora: 'Lomas de Zamora',
  Ezeiza: 'Ezeiza',
  Esteban_Echeverria: 'Esteban Echeverría',
  Tigre: 'Tigre',
  San_Miguel: 'San Miguel',
  Malvinas_Argentinas: 'Malvinas Argentinas',
  Florencio_Varela: 'Florencio Varela',
  Merlo: 'Merlo',
  Moreno: 'Moreno',
  Jose_C_Paz: 'José C. Paz',
  Almirante_Brown: 'Almirante Brown',
};

function normalizeName(s) {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim();
}

const departamentos = JSON.parse(readFileSync(join(geoDir, 'departamentos-ar.geojson'), 'utf8'));
const provincias = JSON.parse(readFileSync(join(geoDir, 'provincias-ar.geojson'), 'utf8'));

const cabaFeature = provincias.features.find((f) => {
  const n = f.properties?.nombre ?? '';
  return normalizeName(n).includes('ciudad autonoma de buenos aires');
});

const baByName = new Map();
for (const f of departamentos.features) {
  const prov = f.properties?.provincia?.nombre ?? f.properties?.provincia_nombre ?? '';
  if (!String(prov).includes('Buenos Aires')) continue;
  if (f.geometry?.type !== 'Polygon' && f.geometry?.type !== 'MultiPolygon') continue;
  const name = f.properties?.nombre ?? '';
  baByName.set(normalizeName(name), f);
}

const features = [];
for (const [mlZoneId, geoName] of Object.entries(ML_ZONE_GEO_NAMES)) {
  let source;
  if (geoName === '__CABA__') {
    source = cabaFeature;
  } else {
    source = baByName.get(normalizeName(geoName));
  }
  if (!source?.geometry) {
    console.warn(`Sin polígono para ${mlZoneId} (${geoName})`);
    continue;
  }
  features.push({
    type: 'Feature',
    geometry: source.geometry,
    properties: {
      mlZoneId,
      label: geoName === '__CABA__' ? 'CABA' : geoName,
      source: 'georef-ign',
    },
  });
}

const out = { type: 'FeatureCollection', features };
const outPath = join(geoDir, 'ml-flex-zones.geojson');
writeFileSync(outPath, JSON.stringify(out));
console.log(`Wrote ${features.length} features → ${outPath}`);
