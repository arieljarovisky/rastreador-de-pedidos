import { apiUrl } from '../api.js';

export interface GeocodeResult {
  lat: number;
  lng: number;
  displayName: string;
}

export async function geocodeAddress(address: string): Promise<GeocodeResult> {
  const token = localStorage.getItem('lupo_token');
  const res = await fetch(
    apiUrl(`/api/geocode?address=${encodeURIComponent(address.trim())}`),
    {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'No se pudo ubicar la dirección en el mapa.');
  }

  return res.json();
}
