import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { api, ApiError } from '../api';
import {
  enqueueLocation,
  getQueue,
  QueuedLocationPoint,
  setQueue,
} from './locationQueue';

const TOKEN_KEY = 'lupo_token';

function isRetryableError(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  if (err instanceof ApiError && err.status >= 500) return true;
  return false;
}

async function sendPoint(token: string, point: QueuedLocationPoint): Promise<void> {
  if (point.orderId) {
    await api.reportOrderLocation(
      token,
      point.orderId,
      point.lat,
      point.lng,
      point.timestamp
    );
  } else {
    await api.reportUserLocation(token, point.lat, point.lng, point.timestamp);
  }
}

/** Siempre actualiza la flota; además registra ruta del pedido si hay envío en curso. */
export async function reportLocationPoint(
  token: string,
  point: Omit<QueuedLocationPoint, 'orderId'>,
  orderId?: string | null
): Promise<void> {
  await reportOrEnqueue(token, point);
  if (orderId) {
    await reportOrEnqueue(token, { ...point, orderId });
  }
}

export async function reportOrEnqueue(
  token: string,
  point: QueuedLocationPoint
): Promise<void> {
  const net = await NetInfo.fetch();
  if (!net.isConnected) {
    await enqueueLocation(point);
    return;
  }

  try {
    await sendPoint(token, point);
  } catch (err) {
    if (isRetryableError(err)) {
      await enqueueLocation(point);
    }
  }
}

let flushing = false;

export async function flushLocationQueue(): Promise<void> {
  if (flushing) return;

  const token = await AsyncStorage.getItem(TOKEN_KEY);
  if (!token) return;

  const net = await NetInfo.fetch();
  if (!net.isConnected) return;

  const queue = await getQueue();
  if (queue.length === 0) return;

  flushing = true;
  try {
    const remaining: QueuedLocationPoint[] = [];

    const userPoints = queue.filter((p) => !p.orderId);
    const orderPoints = queue.filter((p) => p.orderId);

    if (userPoints.length > 0) {
      const latest = userPoints[userPoints.length - 1];
      try {
        await api.reportUserLocation(token, latest.lat, latest.lng, latest.timestamp);
      } catch (err) {
        if (isRetryableError(err)) {
          remaining.push(...userPoints);
        }
      }
    }

    const byOrder = new Map<string, QueuedLocationPoint[]>();
    for (const point of orderPoints) {
      const id = point.orderId!;
      const group = byOrder.get(id) ?? [];
      group.push(point);
      byOrder.set(id, group);
    }

    for (const [orderId, points] of byOrder) {
      points.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      try {
        if (points.length === 1) {
          await sendPoint(token, points[0]);
        } else {
          await api.reportOrderLocationsBatch(token, orderId, points);
        }
      } catch (err) {
        if (isRetryableError(err)) {
          remaining.push(...points);
        }
      }
    }

    await setQueue(remaining);
  } finally {
    flushing = false;
  }
}

export function startLocationSyncListeners(): () => void {
  const unsubscribe = NetInfo.addEventListener((state) => {
    if (state.isConnected) {
      void flushLocationQueue();
    }
  });

  return unsubscribe;
}
