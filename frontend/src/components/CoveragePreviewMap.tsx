/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useMemo, useRef } from 'react';
import * as L from 'leaflet';
import type { Barrio } from '../config/deliveryZones.js';
import {
  boundsForMlZone,
  ML_FLEX_CORDON_COLORS,
  type MlFlexCordon,
  type MlFlexZone,
} from '../config/mlFlexZones.js';
import { MAP_TILE_URLS } from '../theme/colors.ts';
import { readPostaTheme } from '../theme/usePostaTheme.ts';

interface CoveragePreviewMapProps {
  barrios: Barrio[];
  mlZones: MlFlexZone[];
  selectedMlZoneIds: string[];
  cordonLabels: Record<MlFlexCordon, string>;
  className?: string;
}

const GBA_BOUNDS = L.latLngBounds([-34.95, -59.0], [-34.25, -57.9]);

export default function CoveragePreviewMap({
  barrios,
  mlZones,
  selectedMlZoneIds,
  cordonLabels,
  className = '',
}: CoveragePreviewMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<L.Rectangle[]>([]);

  const zoneById = useMemo(() => new Map(mlZones.map((z) => [z.id, z])), [mlZones]);
  const uniqueZoneIds = useMemo(
    () => [...new Set(selectedMlZoneIds.filter((id) => zoneById.has(id)))],
    [selectedMlZoneIds, zoneById]
  );

  const activeCordons = useMemo(() => {
    const set = new Set<MlFlexCordon>();
    for (const id of uniqueZoneIds) {
      const zone = zoneById.get(id);
      if (zone) set.add(zone.cordon);
    }
    return [...set];
  }, [uniqueZoneIds, zoneById]);

  useEffect(() => {
    if (!containerRef.current) return;

    if (!mapRef.current) {
      mapRef.current = L.map(containerRef.current, {
        center: [-34.61, -58.44],
        zoom: 10,
        minZoom: 9,
        maxZoom: 13,
        maxBounds: GBA_BOUNDS,
        maxBoundsViscosity: 0.9,
        zoomControl: true,
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

    if (uniqueZoneIds.length === 0) {
      map.setView([-34.61, -58.44], 10, { animate: false });
      return;
    }

    const fitBounds: L.LatLngBounds[] = [];

    for (const zoneId of uniqueZoneIds) {
      const zone = zoneById.get(zoneId);
      if (!zone) continue;
      const bounds = boundsForMlZone(zone, barrios);
      if (!bounds) continue;

      const color = ML_FLEX_CORDON_COLORS[zone.cordon];
      const rect = L.rectangle(
        [
          [bounds.south, bounds.west],
          [bounds.north, bounds.east],
        ],
        {
          color,
          weight: 2,
          fillColor: color,
          fillOpacity: 0.28,
          opacity: 0.9,
        }
      )
        .bindTooltip(zone.label, { sticky: true, className: 'coverage-zone-tooltip' })
        .addTo(map);

      layersRef.current.push(rect);
      fitBounds.push(rect.getBounds());
    }

    if (fitBounds.length > 0) {
      const combined = fitBounds.reduce((acc, b) => acc.extend(b));
      map.fitBounds(combined.pad(0.08), { animate: false, maxZoom: 11 });
    }

    requestAnimationFrame(() => map.invalidateSize());
  }, [barrios, uniqueZoneIds, zoneById]);

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
      <div ref={containerRef} className="h-44 sm:h-52 w-full z-0" />
      {uniqueZoneIds.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-[var(--surface-panel-2)]/85 z-[1]">
          <p className="text-[10px] font-mono text-[var(--color-text-muted)] px-4 text-center">
            Seleccioná zonas Flex para ver la cobertura en el mapa
          </p>
        </div>
      )}
      {activeCordons.length > 0 && (
        <div className="absolute bottom-2 left-2 right-2 z-[2] flex flex-wrap gap-1.5 pointer-events-none">
          {activeCordons.map((cordon) => (
            <span
              key={cordon}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wide bg-[var(--panel)]/90 border border-[var(--surface-border)] text-[var(--color-text-muted)]"
            >
              <span
                className="w-2 h-2 rounded-sm shrink-0"
                style={{ backgroundColor: ML_FLEX_CORDON_COLORS[cordon] }}
              />
              {cordonLabels[cordon]}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
