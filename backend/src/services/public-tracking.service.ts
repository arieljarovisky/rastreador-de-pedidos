import { Order, OrderStatus } from '../types/index.js';
import { extractMlOrderIdFromNotes } from './mercadolibre.service.js';
import {
  findOrderByPublicRef,
  isPublicTrackingSource,
  type PublicTrackingSource,
} from './orders.service.js';
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
  source: PublicTrackingSource | 'manual' | string;
  reference: {
    label: string;
    value: string;
  };
  /** @deprecated Usar `source` + `reference`. Se mantiene por compatibilidad. */
  mercadolibre: {
    shipmentId: string | null;
    orderId: string | null;
  };
}

export type GetPublicTrackingResult =
  | { status: 'ok'; tracking: PublicTrackingResult }
  | { status: 'not_found' }
  | { status: 'ambiguous' };

const PUBLIC_STATUS_LABELS: Record<OrderStatus, string> = {
  [OrderStatus.PENDING]: 'En preparación',
  [OrderStatus.ASSIGNED]: 'Asignado a repartidor',
  [OrderStatus.DELIVERING]: 'En camino a tu domicilio',
  [OrderStatus.DELIVERED]: 'Entregado',
  [OrderStatus.CANCELLED]: 'Cancelado',
};

const SOURCE_LABELS: Record<string, string> = {
  mercadolibre: 'Mercado Libre',
  tiendanube: 'Tienda Nube',
  shopify: 'Shopify',
  woocommerce: 'WooCommerce',
  manual: 'Pedido',
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

function extractEcommerceOrderNumber(notes?: string | null): string | null {
  if (!notes) return null;
  const withHash = notes.match(/Pedido\s+#([A-Za-z0-9-]+)/i);
  if (withHash?.[1]) return withHash[1];
  const plain = notes.match(/Pedido\s+([A-Za-z0-9#-]+)\s*·/i);
  if (plain?.[1]) return plain[1].replace(/^#/, '');
  return null;
}

function buildReference(order: Order): PublicTrackingResult['reference'] {
  const source = order.externalSource ?? 'manual';
  const sourceLabel = SOURCE_LABELS[source] ?? 'Pedido';

  if (source === 'mercadolibre') {
    const mlOrderId = extractMlOrderIdFromNotes(order.notes);
    if (mlOrderId) {
      return { label: 'Venta Mercado Libre', value: mlOrderId };
    }
    if (order.externalOrderId) {
      return { label: 'Envío Mercado Libre', value: order.externalOrderId };
    }
  }

  const orderNumber = extractEcommerceOrderNumber(order.notes);
  if (orderNumber) {
    return { label: `Pedido ${sourceLabel}`, value: orderNumber };
  }

  if (order.externalOrderId) {
    return { label: `Pedido ${sourceLabel}`, value: order.externalOrderId };
  }

  return { label: sourceLabel, value: order.id };
}

export function toPublicTracking(order: Order): PublicTrackingResult {
  const mlOrderId = extractMlOrderIdFromNotes(order.notes) ?? null;
  const source = order.externalSource ?? 'manual';

  return {
    status: order.status,
    updatedAt: order.updatedAt,
    deliveryDeadline: order.deliveryDeadline,
    address: order.address,
    destination: { lat: order.lat, lng: order.lng },
    driver: null,
    trail: buildTrail(order),
    timeline: buildTimeline(order),
    source,
    reference: buildReference(order),
    mercadolibre: {
      shipmentId: source === 'mercadolibre' ? order.externalOrderId ?? null : null,
      orderId: source === 'mercadolibre' ? mlOrderId : null,
    },
  };
}

export async function getPublicTrackingByRef(
  ref: string,
  options?: { source?: string }
): Promise<GetPublicTrackingResult> {
  const source =
    options?.source && isPublicTrackingSource(options.source) ? options.source : undefined;

  const lookup = await findOrderByPublicRef(ref, { source });
  if (lookup.status === 'ambiguous') return { status: 'ambiguous' };
  if (lookup.status === 'not_found') return { status: 'not_found' };

  const tracking = toPublicTracking(lookup.order);
  tracking.driver = await resolveDriverLocation(lookup.order);
  return { status: 'ok', tracking };
}

/** @deprecated Usar getPublicTrackingByRef */
export async function getPublicTrackingByMercadoLibreRef(
  ref: string
): Promise<PublicTrackingResult | null> {
  const result = await getPublicTrackingByRef(ref, { source: 'mercadolibre' });
  return result.status === 'ok' ? result.tracking : null;
}
