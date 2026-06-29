import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GPS_THROTTLE_MS } from '../config';
import { getActiveOrderId } from './locationQueue';
import { flushLocationQueue, reportOrEnqueue } from './locationSync';

export const BACKGROUND_LOCATION_TASK = 'posta-background-location';

const TOKEN_KEY = 'lupo_token';
const LAST_SENT_KEY = 'lupo_location_last_sent_at';

TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) return;
  if (!data) return;

  const { locations } = data as { locations: Location.LocationObject[] };
  const latest = locations[locations.length - 1];
  if (!latest) return;

  const token = await AsyncStorage.getItem(TOKEN_KEY);
  if (!token) return;

  const now = Date.now();
  const lastSentRaw = await AsyncStorage.getItem(LAST_SENT_KEY);
  const lastSent = lastSentRaw ? Number(lastSentRaw) : 0;
  if (now - lastSent < GPS_THROTTLE_MS) return;
  await AsyncStorage.setItem(LAST_SENT_KEY, String(now));

  const activeOrderId = await getActiveOrderId();
  await reportOrEnqueue(token, {
    lat: latest.coords.latitude,
    lng: latest.coords.longitude,
    timestamp: new Date(latest.timestamp).toISOString(),
    orderId: activeOrderId ?? undefined,
  });

  await flushLocationQueue();
});

export async function startBackgroundLocation(): Promise<boolean> {
  const { status: fg } = await Location.requestForegroundPermissionsAsync();
  if (fg !== 'granted') return false;

  await Location.requestBackgroundPermissionsAsync();

  const started = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  if (started) return true;

  await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
    accuracy: Location.Accuracy.High,
    distanceInterval: 8,
    timeInterval: 3000,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'Posta Repartidor',
      notificationBody: 'Compartiendo tu ubicación para el seguimiento del envío.',
      notificationColor: '#3B82F6',
    },
  });

  return true;
}

export async function stopBackgroundLocation(): Promise<void> {
  const started = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  if (started) {
    await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  }
}
