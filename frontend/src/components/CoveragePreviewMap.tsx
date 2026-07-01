/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef } from 'react';
import * as L from 'leaflet';
import type { Barrio } from '../config/deliveryZones.js';
import { ML_FLEX_CORDON_COLORS, type MlFlexCordon } from '../config/mlFlexZones.js';
import { MAP_TILE_URLS } from '../theme/colors.ts';
import { readPostaTheme } from '../theme/usePostaTheme.ts';

interface CoveragePreviewMapProps {
  barrios: Barrio[];
  selectedBarrioIds: string[];
  /** Color por cordón para resaltar la zona activa. */
  highlightCordon?: MlFlexCordon | null;
  className?: string;
}

const GBA_BOUNDS = L.latLngBounds([-34.95, -59.0], [-34.25, -57.9]);

export default function CoveragePreviewMap({
  barrios,
  selectedBarrioIds,
  highlightCordon = null,
  className = '',
}: CoveragePreviewMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<L.Rectangle[]>([]);

  useEffect(() => {
    if (!containerRef.current) return;

    if (!mapRef.current) {
      mapRef.current = L.map(containerRef.current, {
        center: [-34.61, -58.44],
        zoom: 10,
        minZoom: 9,
        maxZoom: 14,
        maxBounds: GBA_BOUNDS,
        maxBoundsViscosity: 0.85,
        zoomControl: false,
        attributionControl: false,
        dragging: true,
        scrollWheelZoom: false,
        touchZoom: true,
      });

      L.tileLayer(MAP_TILE_URLS[readPostaTheme()], {
        subdomains: 'abcd',
        maxZoom: 19,
      }).addTo(mapRef.current);
    }

    const map = mapRef.current;
    layersRef.current.forEach((layer) => layer.remove());
    layersRef.current = [];

    const catalog = new Map(barrios.map((b) => [b.id, b]));
    const selected = selectedBarrioIds
      .map((id) => catalog.get(id))
      .filter((b): b is Barrio => Boolean(b));

    if (selected.length === 0) return;

    const bounds: L.LatLngBounds[] = [];
    for (const barrio of selected) {
      const color = highlightCordon ? ML_FLEX_CORDON_COLORS[highlightCordon] : '#3b82f6';
      const rect = L.rectangle(
        [
          [barrio.south, barrio.west],
          [barrio.north, barrio.east],
        ],
        {
          color,
          weight: 1.5,
          fillColor: color,
          fillOpacity: 0.22,
        }
      ).addTo(map);
      layersRef.current.push(rect);
      bounds.push(rect.getBounds());
    }

    if (bounds.length > 0) {
      const combined = bounds.reduce((acc, b) => acc.extend(b));
      map.fitBounds(combined.pad(0.12), { animate: false, maxZoom: 12 });
    }
  }, [barrios, selectedBarrioIds, highlightCordon]);

  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  return (
    <div
      className={`relative rounded-lg border border-[var(--surface-border)] overflow-hidden bg-[var(--surface-panel-2)] ${className}`}
    >
      <div ref={containerRef} className="h-40 sm:h-48 w-full" />
      {selectedBarrioIds.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-[var(--surface-panel-2)]/80">
          <p className="text-[10px] font-mono text-[var(--color-text-muted)] px-4 text-center">
            Seleccioná zonas Flex para ver la cobertura en el mapa
          </p>
        </div>
      )}
    </div>
  );
}
