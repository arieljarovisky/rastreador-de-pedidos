import React, { useMemo } from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import PostaMap, { MapMarker, MapPoint } from './PostaMap';
import { readLiveLocation, useLiveFleetVersion } from '../utils/liveFleet';

const MAP_COLORS = {
  destination: '#E8431F',
  driver: '#5C87EB',
  route: '#E69A2E',
};

interface Props {
  destination: MapPoint;
  trail?: MapPoint[];
  driver?: MapPoint | null;
  /** Si viene, el pin del repartidor se mueve sin re-renderizar la pantalla. */
  repartidorId?: string | null;
  style?: StyleProp<ViewStyle>;
  /** Centra el mapa en el repartidor mientras se mueve (estilo Uber/Rappi). */
  followDriver?: boolean;
}

/** Mapa de seguimiento de un pedido (destino + repartidor animado + ruta recorrida). */
export default function OrderTrackingMap({
  destination,
  trail = [],
  driver,
  repartidorId,
  style,
  followDriver = true,
}: Props) {
  const liveVersion = useLiveFleetVersion();
  const markers = useMemo(() => {
    const live = readLiveLocation(repartidorId);
    const driverPoint = live
      ? {
          lat: live.lat,
          lng: live.lng,
          label: driver?.label ?? 'Repartidor',
        }
      : driver;
    const list: MapMarker[] = [
      {
        id: 'destination',
        lat: destination.lat,
        lng: destination.lng,
        label: destination.label ?? 'Destino',
        color: MAP_COLORS.destination,
      },
    ];
    if (driverPoint) {
      list.push({
        id: repartidorId ? `rep_${repartidorId.trim().toLowerCase()}` : 'driver',
        lat: driverPoint.lat,
        lng: driverPoint.lng,
        label: driverPoint.label ?? 'Repartidor',
        color: MAP_COLORS.driver,
        animated: true,
      });
    }
    return list;
  }, [destination, driver, repartidorId, liveVersion]);

  const polylines = useMemo(() => {
    const points = trail.length > 40 ? trail.slice(-40) : trail;
    return points.length > 1
      ? [{ id: 'trail', points, color: MAP_COLORS.route }]
      : [];
  }, [trail]);

  return (
    <PostaMap
      markers={markers}
      polylines={polylines}
      style={style}
      followDriver={followDriver && markers.some((marker) => marker.animated)}
      emptyLabel="Sin coordenadas de entrega."
    />
  );
}
