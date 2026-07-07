/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef } from 'react';
import * as L from 'leaflet';
import { MAP_TILE_URLS } from '../theme/colors.ts';
import { usePostaTheme, readPostaTheme } from '../theme/usePostaTheme.ts';

interface LocationPreviewMapProps {
  lat: number;
  lng: number;
  onLocationChange?: (lat: number, lng: number) => void;
  className?: string;
}

export default function LocationPreviewMap({
  lat,
  lng,
  onLocationChange,
  className = 'h-44',
}: LocationPreviewMapProps) {
  const theme = usePostaTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  const onLocationChangeRef = useRef(onLocationChange);
  onLocationChangeRef.current = onLocationChange;

  useEffect(() => {
    if (!containerRef.current) return;

    const map = L.map(containerRef.current, {
      center: [lat, lng],
      zoom: 16,
      zoomControl: true,
      scrollWheelZoom: true,
      dragging: true,
      touchZoom: true,
    });

    tileRef.current = L.tileLayer(MAP_TILE_URLS[readPostaTheme()], {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);

    const icon = L.divIcon({
      html: `<div style="width:26px;height:26px;border-radius:50% 50% 50% 0;background:var(--color-accent,#f97316);border:2px solid #fff;box-shadow:0 2px 10px rgba(0,0,0,0.45);transform:rotate(-45deg)"></div>`,
      className: '',
      iconSize: [26, 26],
      iconAnchor: [13, 26],
    });

    const marker = L.marker([lat, lng], { icon, draggable: Boolean(onLocationChangeRef.current) }).addTo(map);
    marker.on('dragend', () => {
      const pos = marker.getLatLng();
      onLocationChangeRef.current?.(pos.lat, pos.lng);
    });

    markerRef.current = marker;
    mapRef.current = map;

    const resizeTimer = window.setTimeout(() => map.invalidateSize(), 120);

    return () => {
      window.clearTimeout(resizeTimer);
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      tileRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !markerRef.current) return;
    markerRef.current.setLatLng([lat, lng]);
    mapRef.current.setView([lat, lng], mapRef.current.getZoom(), { animate: true });
    window.setTimeout(() => mapRef.current?.invalidateSize(), 80);
  }, [lat, lng]);

  useEffect(() => {
    tileRef.current?.setUrl(MAP_TILE_URLS[theme]);
  }, [theme]);

  return (
    <div className={`rounded-lg border border-[var(--surface-border)] overflow-hidden ${className}`}>
      <div ref={containerRef} className="w-full h-full min-h-[11rem]" />
    </div>
  );
}
