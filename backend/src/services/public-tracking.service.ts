import { Order, OrderStatus } from '../types/index.js';
import { extractMlOrderIdFromNotes } from './mercadolibre.service.js';
import { findMercadoLibreOrderByPublicRef } from './orders.service.js';
import { getRepartidorById } from './users.service.js';

export interface PublicTrackingTimelineEvent {
  status: OrderStatus;
  timestamp: string;
  label: string;
}

export interface PublicTrackingResult {
  status: OrderStatus;
  updatedAt: string;
  deliveryDeadline?: string;
  address: string;
  destination: { lat: number; lng: number };
  driver: { lat: number; lng: number; timestamp: string } | null;
  trail: Array<{ lat: number; lng: number; timestamp: string }>;
  timeline: PublicTrackingTimelineEvent[];
  mercadolibre: {
    shipmentId: string | null;
    orderId: string | null;
  };
}

const PUBLIC_STATUS_LABELS: Record<OrderStatus, string> = {
  [OrderStatus.PENDING]: 'En preparación',
  [OrderStatus.ASSIGNED]: 'Asignado a repartidor',
  [OrderStatus.DELIVERING]: 'En camino a tu domicilio',
  [OrderStatus.DELIVERED]: 'Entregado',
  [OrderStatus.CANCELLED]: 'Cancelado',
};

const MAX_TRAIL_POINTS = 80;

function buildTimeline(order: Order): PublicTrackingTimelineEvent[] {
  const events = order.history.length > 0 ? order.history : [{ status: order.status, timestamp: order.createdAt, updatedBy: 'Posta' }];
  return events.map((event) => ({
    status: event.status,
    timestamp: event.timestamp,
    label: PUBLIC_STATUS_LABELS[event.status],
  }));
}

async function resolveDriverLocation(
  order: Order
): Promise<{ lat: number; lng: number; timestamp: string } | null> {
  if (order.status !== OrderStatus.ASSIGNED && order.status !== OrderStatus.DELIVERING) {
    return null;
  }

  if (order.locationHistory.length > 0) {
    const last = order.locationHistory[order.locationHistory.length - 1];
    return { lat: last.lat, lng: last.lng, timestamp: last.timestamp };
  }

  if (order.repartidorId) {
    const rep = await getRepartidorById(order.repartidorId);
    if (rep?.currentLocation) {
      return rep.currentLocation;
    }
  }

  return null;
}

function buildTrail(order: Order): PublicTrackingResult['trail'] {
  if (order.status !== OrderStatus.DELIVERING || order.locationHistory.length < 2) {
    return [];
  }
  return order.locationHistory.slice(-MAX_TRAIL_POINTS);
}

export function toPublicTracking(order: Order): PublicTrackingResult {
  const mlOrderId = extractMlOrderIdFromNotes(order.notes) ?? null;

  return {
    status: order.status,
    updatedAt: order.updatedAt,
    deliveryDeadline: order.deliveryDeadline,
    address: order.address,
    destination: { lat: order.lat, lng: order.lng },
    driver: null,
    trail: buildTrail(order),
    timeline: buildTimeline(order),
    mercadolibre: {
      shipmentId: order.externalOrderId ?? null,
      orderId: mlOrderId,
    },
  };
}

export async function getPublicTrackingByMercadoLibreRef(
  ref: string
): Promise<PublicTrackingResult | null> {
  const order = await findMercadoLibreOrderByPublicRef(ref);
  if (!order) return null;

  const tracking = toPublicTracking(order);
  tracking.driver = await resolveDriverLocation(order);
  return tracking;
}
