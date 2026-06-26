interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
}

export interface GeocodeResult {
  lat: number;
  lng: number;
  displayName: string;
}

const GBA_VIEWBOX = '-58.65,-34.75,-58.30,-34.45';

export async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  const trimmed = address.trim();
  if (!trimmed) return null;

  const query = trimmed.toLowerCase().includes('argentina')
    ? trimmed
    : `${trimmed}, Buenos Aires, Argentina`;

  const params = new URLSearchParams({
    format: 'json',
    q: query,
    limit: '1',
    countrycodes: 'ar',
    viewbox: GBA_VIEWBOX,
    bounded: '1',
  });

  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: {
      'User-Agent': 'LupoEnvios/1.0 (rastreador-de-pedidos)',
      'Accept-Language': 'es',
    },
  });

  if (!response.ok) {
    throw new Error('GEOCODE_UNAVAILABLE');
  }

  const results = (await response.json()) as NominatimResult[];
  const hit = results[0];
  if (!hit) return null;

  const lat = Number(hit.lat);
  const lng = Number(hit.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return {
    lat,
    lng,
    displayName: hit.display_name,
  };
}
