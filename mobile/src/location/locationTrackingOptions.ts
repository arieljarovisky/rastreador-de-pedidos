import * as Location from 'expo-location';
import { GPS_HEARTBEAT_MS } from '../config';

/** Opciones compartidas: reportar por tiempo aunque no haya movimiento. */
export const locationWatchOptions: Location.LocationOptions = {
  accuracy: Location.Accuracy.High,
  distanceInterval: 0,
  timeInterval: GPS_HEARTBEAT_MS,
};

export const backgroundLocationOptions: Location.LocationTaskOptions = {
  accuracy: Location.Accuracy.High,
  distanceInterval: 0,
  timeInterval: GPS_HEARTBEAT_MS,
  showsBackgroundLocationIndicator: true,
  pausesUpdatesAutomatically: false,
  activityType: Location.ActivityType.AutomotiveNavigation,
  foregroundService: {
    notificationTitle: 'Posta Repartidor',
    notificationBody: 'Compartiendo tu ubicación para el seguimiento del envío.',
    notificationColor: '#3B82F6',
  },
};
