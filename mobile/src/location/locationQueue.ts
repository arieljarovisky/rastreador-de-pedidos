import AsyncStorage from '@react-native-async-storage/async-storage';

export interface QueuedLocationPoint {
  lat: number;
  lng: number;
  timestamp: string;
  orderId?: string;
}

const QUEUE_KEY = 'lupo_location_queue';
const ACTIVE_ORDER_KEY = 'lupo_active_order_id';
const MAX_QUEUE_SIZE = 500;

export async function setActiveOrderId(orderId: string | null): Promise<void> {
  if (orderId) {
    await AsyncStorage.setItem(ACTIVE_ORDER_KEY, orderId);
  } else {
    await AsyncStorage.removeItem(ACTIVE_ORDER_KEY);
  }
}

export async function getActiveOrderId(): Promise<string | null> {
  return AsyncStorage.getItem(ACTIVE_ORDER_KEY);
}

export async function getQueue(): Promise<QueuedLocationPoint[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as QueuedLocationPoint[];
  } catch {
    return [];
  }
}

export async function setQueue(queue: QueuedLocationPoint[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export async function enqueueLocation(point: QueuedLocationPoint): Promise<void> {
  const queue = await getQueue();
  queue.push(point);
  if (queue.length > MAX_QUEUE_SIZE) {
    queue.splice(0, queue.length - MAX_QUEUE_SIZE);
  }
  await setQueue(queue);
}

export async function clearQueue(): Promise<void> {
  await AsyncStorage.removeItem(QUEUE_KEY);
}
