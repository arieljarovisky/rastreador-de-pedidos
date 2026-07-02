import React, { useMemo } from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import PostaMap, { MapMarker, MapPoint } from './PostaMap';

const MAP_COLORS = {
  destination: '#E8431F',
  driver: '#5C87EB',
  route: '#E69A2E',
};

interface Props {
  destination: MapPoint;
  trail?: MapPoint[];
  driver?: MapPoint | null;
  style?: StyleProp<ViewStyle>;
  /** Centra el mapa en el repartidor mientras se mueve (estilo Uber/Rappi). */
  followDriver?: boolean;
}

/** Mapa de seguimiento de un pedido (destino + repartidor animado + ruta recorrida). */
export default function OrderTrackingMap({
  destination,
  trail = [],
  driver,
  style,
  followDriver = true,
}: Props) {
  const markers = useMemo(() => {
    const list: MapMarker[] = [
      {
        id: 'destination',
        lat: destination.lat,
        lng: destination.lng,
        label: destination.label ?? 'Destino',
        color: MAP_COLORS.destination,
      },
    ];
    if (driver) {
      list.push({
        id: 'driver',
        lat: driver.lat,
        lng: driver.lng,
        label: driver.label ?? 'Repartidor',
        color: MAP_COLORS.driver,
        animated: true,
      });
    }
    return list;
  }, [destination, driver]);

  const polylines = useMemo(
    () =>
      trail.length > 1
        ? [{ id: 'trail', points: trail, color: MAP_COLORS.route }]
        : [],
    [trail]
  );

  return (
    <PostaMap
      markers={markers}
      polylines={polylines}
      style={style}
      followDriver={followDriver && Boolean(driver)}
      emptyLabel="Sin coordenadas de entrega."
    />
  );
}
