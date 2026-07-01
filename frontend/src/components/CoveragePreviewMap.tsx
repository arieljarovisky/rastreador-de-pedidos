/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import * as L from 'leaflet';
import type { GeoJSON } from 'geojson';
import {
  ML_FLEX_CORDON_COLORS,
  type MlFlexCordon,
  type MlFlexZone,
} from '../config/mlFlexZones.js';
import { MAP_TILE_URLS } from '../theme/colors.ts';
import { readPostaTheme } from '../theme/usePostaTheme.ts';

interface CoveragePreviewMapProps {
  mlZones: MlFlexZone[];
  selectedMlZoneIds: string[];
  cordonLabels: Record<MlFlexCordon, string>;
  className?: string;
}

const GBA_BOUNDS = L.latLngBounds([-34.95, -59.0], [-34.25, -57.9]);
const GEO_URL = '/geo/ml-flex-zones.geojson';

let geoCache: GeoJSON.FeatureCollection | null = null;
let geoPromise: Promise<GeoJSON.FeatureCollection> | null = null;

function loadZoneGeo(): Promise<GeoJSON.FeatureCollection> {
  if (geoCache) return Promise.resolve(geoCache);
  if (!geoPromise) {
    geoPromise = fetch(GEO_URL)
      .then((res) => {
        if (!res.ok) throw new Error('GEO_LOAD_FAILED');
        return res.json() as Promise<GeoJSON.FeatureCollection>;
      })
      .then((data) => {
        geoCache = data;
        return data;
      });
  }
  return geoPromise;
}

export default function CoveragePreviewMap({
  mlZones,
  selectedMlZoneIds,
  cordonLabels,
  className = '',
}: CoveragePreviewMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.GeoJSON | null>(null);
  const [geo, setGeo] = useState<GeoJSON.FeatureCollection | null>(geoCache);
  const [geoError, setGeoError] = useState(false);

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
    if (geo) return;
    let cancelled = false;
    void loadZoneGeo()
      .then((data) => {
        if (!cancelled) setGeo(data);
      })
      .catch(() => {
        if (!cancelled) setGeoError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [geo]);

  useEffect(() => {
    if (!containerRef.current || !geo) return;

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
    if (layerGroupRef.current) {
      layerGroupRef.current.remove();
      layerGroupRef.current = null;
    }

    if (uniqueZoneIds.length === 0) {
      map.setView([-34.61, -58.44], 10, { animate: false });
      requestAnimationFrame(() => map.invalidateSize());
      return;
    }

    const selectedSet = new Set(uniqueZoneIds);
    const filtered: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: geo.features.filter((f) => {
        const id = f.properties?.mlZoneId;
        return typeof id === 'string' && selectedSet.has(id);
      }),
    };

    const layer = L.geoJSON(filtered, {
      style: (feature) => {
        const mlZoneId = feature?.properties?.mlZoneId as string | undefined;
        const cordon = mlZoneId ? zoneById.get(mlZoneId)?.cordon : undefined;
        const color = cordon ? ML_FLEX_CORDON_COLORS[cordon] : '#3b82f6';
        return {
          color,
          weight: 2,
          fillColor: color,
          fillOpacity: 0.32,
          opacity: 0.95,
        };
      },
      onEachFeature: (feature, layer) => {
        const label =
          (feature.properties?.label as string | undefined) ??
          zoneById.get(String(feature.properties?.mlZoneId))?.label;
        if (label) layer.bindTooltip(label, { sticky: true, className: 'coverage-zone-tooltip' });
      },
    }).addTo(map);

    layerGroupRef.current = layer;
    const bounds = layer.getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds.pad(0.06), { animate: false, maxZoom: 11 });
    }
    requestAnimationFrame(() => map.invalidateSize());
  }, [geo, uniqueZoneIds, zoneById]);

  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        layerGroupRef.current = null;
      }
    };
  }, []);

  return (
    <div
      className={`relative rounded-lg border border-[var(--surface-border)] overflow-hidden bg-[var(--surface-panel-2)] ${className}`}
    >
      <div ref={containerRef} className="h-44 sm:h-52 w-full z-0" />
      {!geo && !geoError && uniqueZoneIds.length > 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-[var(--surface-panel-2)]/85 z-[1]">
          <p className="text-[10px] font-mono text-[var(--color-text-muted)]">Cargando mapa…</p>
        </div>
      )}
      {uniqueZoneIds.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-[var(--surface-panel-2)]/85 z-[1]">
          <p className="text-[10px] font-mono text-[var(--color-text-muted)] px-4 text-center">
            Seleccioná zonas Flex para ver la cobertura en el mapa
          </p>
        </div>
      )}
      {geoError && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-[var(--surface-panel-2)]/85 z-[1]">
          <p className="text-[10px] font-mono text-[var(--color-danger)] px-4 text-center">
            No se pudo cargar el mapa de límites oficiales
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
