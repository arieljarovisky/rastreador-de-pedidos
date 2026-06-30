import { apiUrl } from './config';
import {
  AppNotification,
  GeocodeResult,
  IntegrationsStatus,
  MarketplaceImportResult,
  MarketplacePlatform,
  MarketplaceShipmentPreview,
  Order,
  OrderStatus,
  PickupPoint,
  User,
} from './types';
import type { DeliveryZone } from './config/deliveryZones';
import type { Barrio } from './config/deliveryZones';

export interface LoginResponse {
  user: User;
  token: string;
}

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(
  path: string,
  options: { method?: string; token?: string | null; body?: unknown } = {}
): Promise<T> {
  const { method = 'GET', token, body } = options;

  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(apiUrl(path), {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let message = 'Error de servidor';
    try {
      const data = await res.json();
      message = data.error || message;
    } catch {
      // respuesta no-JSON
    }
    throw new ApiError(message, res.status);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  login(username: string, password: string): Promise<LoginResponse> {
    return request<LoginResponse>('/api/auth/login', {
      method: 'POST',
      body: { username, password },
    });
  },

  me(token: string): Promise<User> {
    return request<User>('/api/auth/me', { token });
  },

  /** Repartidor: ve sus pedidos asignados/en curso + pendientes libres. */
  getOrders(token: string): Promise<Order[]> {
    return request<Order[]>('/api/orders', { token });
  },

  getRepartidores(token: string): Promise<User[]> {
    return request<User[]>('/api/repartidores', { token });
  },

  getOrder(token: string, orderId: string): Promise<Order> {
    return request<Order>(`/api/orders/${orderId}`, { token });
  },

  /** Cambia el estado de un pedido (tomar, iniciar viaje, entregar). */
  updateOrderStatus(
    token: string,
    orderId: string,
    status: OrderStatus,
    opts: { repartidorId?: string; comment?: string } = {}
  ): Promise<Order> {
    return request<Order>(`/api/orders/${orderId}/status`, {
      method: 'PUT',
      token,
      body: { status, repartidorId: opts.repartidorId, comment: opts.comment },
    });
  },

  /** Reporta el GPS asociado a un pedido en viaje. */
  reportOrderLocation(
    token: string,
    orderId: string,
    lat: number,
    lng: number,
    timestamp?: string
  ): Promise<void> {
    return request<void>(`/api/orders/${orderId}/location`, {
      method: 'POST',
      token,
      body: { lat, lng, timestamp },
    });
  },

  /** Sincroniza varios puntos de ruta acumulados sin conexión. */
  reportOrderLocationsBatch(
    token: string,
    orderId: string,
    points: { lat: number; lng: number; timestamp: string }[]
  ): Promise<void> {
    return request<void>(`/api/orders/${orderId}/locations/batch`, {
      method: 'POST',
      token,
      body: { points },
    });
  },

  /** Reporta ubicación general del repartidor (sin pedido activo). */
  reportUserLocation(
    token: string,
    lat: number,
    lng: number,
    timestamp?: string
  ): Promise<void> {
    return request<void>('/api/users/location', {
      method: 'POST',
      token,
      body: { lat, lng, timestamp },
    });
  },

  getNotifications(token: string): Promise<AppNotification[]> {
    return request<AppNotification[]>('/api/notifications', { token });
  },

  markNotificationsRead(token: string): Promise<void> {
    return request<void>('/api/notifications/read', { method: 'POST', token });
  },

  /** Escaneo de etiqueta Mercado Libre Flex (colecta / re-escaneo). */
  scanMercadoLibreLabel(
    token: string,
    code: string,
    lat?: number,
    lng?: number,
    sellerId?: string
  ): Promise<MercadoLibreScanImportResult> {
    return request<MercadoLibreScanImportResult>('/api/integrations/mercadolibre/scan-import', {
      method: 'POST',
      token,
      body: {
        code,
        lat,
        lng,
        sellerId,
      },
    });
  },

  getSellers(token: string): Promise<User[]> {
    return request<User[]>('/api/accounts/sellers', { token });
  },

  getDeliveryZones(token: string): Promise<DeliveryZone[]> {
    return request<DeliveryZone[]>('/api/delivery-zones', { token });
  },

  getBarrios(token: string): Promise<Barrio[]> {
    return request<Barrio[]>('/api/delivery-zones/barrios', { token });
  },

  assignOrderSeller(token: string, orderId: string, sellerId: string): Promise<Order> {
    return request<Order>(`/api/orders/${orderId}/seller`, {
      method: 'PUT',
      token,
      body: { sellerId },
    });
  },

  /** Vendedor: geocodificar dirección de entrega. */
  geocodeAddress(token: string, address: string): Promise<GeocodeResult> {
    return request<GeocodeResult>(
      `/api/geocode?address=${encodeURIComponent(address.trim())}`,
      { token }
    );
  },

  /** Vendedor: crear envío manual. */
  createOrder(
    token: string,
    data: {
      clientName: string;
      clientPhone?: string;
      address: string;
      lat: number;
      lng: number;
      notes?: string;
    }
  ): Promise<Order> {
    return request<Order>('/api/orders', {
      method: 'POST',
      token,
      body: data,
    });
  },

  /** Vendedor: cancelar (pending) u otros cambios permitidos. */
  cancelOrder(token: string, orderId: string, comment?: string): Promise<Order> {
    return request<Order>(`/api/orders/${orderId}/status`, {
      method: 'PUT',
      token,
      body: { status: OrderStatus.CANCELLED, comment: comment ?? 'Cancelado por el vendedor' },
    });
  },

  deleteOrder(token: string, orderId: string): Promise<void> {
    return request<void>(`/api/orders/${orderId}`, { method: 'DELETE', token });
  },

  archiveOrder(token: string, orderId: string, archived: boolean): Promise<Order> {
    return request<Order>(`/api/orders/${orderId}/archive`, {
      method: 'PUT',
      token,
      body: { archived },
    });
  },

  getIntegrationsStatus(token: string): Promise<IntegrationsStatus> {
    return request<IntegrationsStatus>('/api/integrations/status', { token });
  },

  getIntegrationConnectUrl(token: string, platform: MarketplacePlatform): Promise<{ url: string }> {
    return request<{ url: string }>(`/api/integrations/${platform}/connect`, { token });
  },

  disconnectIntegration(token: string, platform: MarketplacePlatform): Promise<void> {
    return request<void>(`/api/integrations/${platform}`, { method: 'DELETE', token });
  },

  listMarketplaceShipments(
    token: string,
    platform: MarketplacePlatform
  ): Promise<MarketplaceShipmentPreview[]> {
    return request<MarketplaceShipmentPreview[]>(`/api/integrations/${platform}/shipments`, {
      token,
    });
  },

  importMarketplaceShipments(
    token: string,
    platform: MarketplacePlatform,
    externalIds: string[]
  ): Promise<MarketplaceImportResult> {
    return request<MarketplaceImportResult>(`/api/integrations/${platform}/import`, {
      method: 'POST',
      token,
      body: { externalIds },
    });
  },

  getPickupPoints(token: string): Promise<PickupPoint[]> {
    return request<PickupPoint[]>('/api/accounts/pickup-points', { token });
  },

  /** URL autenticada para abrir etiqueta ML (requiere token en header al descargar). */
  mercadoLibreLabelUrl(orderId: string): string {
    return apiUrl(`/api/orders/${orderId}/mercadolibre-label`);
  },
};

export interface MercadoLibreScanImportResult {
  order: Order;
  alreadyImported: boolean;
  sellerId: string;
  sellerName: string;
  externalOrderId: string;
}

export { ApiError };
