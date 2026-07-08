/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef } from 'react';
import * as L from 'leaflet';
import { MAP_TILE_URLS } from '../theme/colors.ts';
import { usePostaTheme, readPostaTheme } from '../theme/usePostaTheme.ts';

interface MapPoint {
  lat: number;
  lng: number;
}

interface PublicTrackingMapProps {
  destination: MapPoint;
  driver?: MapPoint | null;
  trail?: MapPoint[];
  className?: string;
}

const COLORS = {
  destination: '#E8431F',
  driver: '#5C87EB',
  route: '#E69A2E',
};

function pinIcon(color: string, label: string) {
  return L.divIcon({
    html: `
      <div style="position:relative;width:32px;height:32px;display:flex;align-items:center;justify-content:center;filter:drop-shadow(0 2px 6px rgba(0,0,0,.35))">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${color}" style="width:32px;height:32px;position:absolute">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
        </svg>
        <span style="z-index:1;color:#fff;font-size:10px;font-weight:700;margin-bottom:10px">${label}</span>
      </div>
    `,
    className: '',
    iconSize: [32, 32],
    iconAnchor: [16, 32],
  });
}

export default function PublicTrackingMap({
  destination,
  driver,
  trail = [],
  className = 'h-56 sm:h-72',
}: PublicTrackingMapProps) {
  const theme = usePostaTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  const destMarkerRef = useRef<L.Marker | null>(null);
  const driverMarkerRef = useRef<L.Marker | null>(null);
  const trailRef = useRef<L.Polyline | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const map = L.map(containerRef.current, {
      center: [destination.lat, destination.lng],
      zoom: 14,
      zoomControl: true,
      scrollWheelZoom: true,
    });

    tileRef.current = L.tileLayer(MAP_TILE_URLS[readPostaTheme()], {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);

    destMarkerRef.current = L.marker([destination.lat, destination.lng], {
      icon: pinIcon(COLORS.destination, 'D'),
    }).addTo(map);

    mapRef.current = map;
    const timer = window.setTimeout(() => map.invalidateSize(), 120);

    return () => {
      window.clearTimeout(timer);
      map.remove();
      mapRef.current = null;
      destMarkerRef.current = null;
      driverMarkerRef.current = null;
      trailRef.current = null;
      tileRef.current = null;
    };
  }, []);

  useEffect(() => {
    tileRef.current?.setUrl(MAP_TILE_URLS[theme]);
  }, [theme]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !destMarkerRef.current) return;

    destMarkerRef.current.setLatLng([destination.lat, destination.lng]);

    if (driverMarkerRef.current) {
      driverMarkerRef.current.remove();
      driverMarkerRef.current = null;
    }

    if (driver) {
      driverMarkerRef.current = L.marker([driver.lat, driver.lng], {
        icon: pinIcon(COLORS.driver, 'R'),
      }).addTo(map);
    }

    if (trailRef.current) {
      trailRef.current.remove();
      trailRef.current = null;
    }

    if (trail.length > 1) {
      trailRef.current = L.polyline(
        trail.map((p) => [p.lat, p.lng] as [number, number]),
        { color: COLORS.route, weight: 4, opacity: 0.85, dashArray: '6, 8' }
      ).addTo(map);
    }

    const boundsPoints: [number, number][] = [[destination.lat, destination.lng]];
    if (driver) boundsPoints.push([driver.lat, driver.lng]);
    if (trail.length > 0) {
      for (const p of trail) boundsPoints.push([p.lat, p.lng]);
    }

    if (boundsPoints.length > 1) {
      map.fitBounds(L.latLngBounds(boundsPoints), { padding: [36, 36], animate: true });
    } else {
      map.setView([destination.lat, destination.lng], 15, { animate: true });
    }
  }, [destination.lat, destination.lng, driver?.lat, driver?.lng, trail]);

  return (
    <div className={`rounded-lg border border-[var(--line)] overflow-hidden ${className}`}>
      <div ref={containerRef} className="w-full h-full min-h-[14rem]" />
    </div>
  );
}
