import { apiUrl } from './config';
import {
  AppNotification,
  GeocodeResult,
  IntegrationsStatus,
  AgencyIntegrationsStatus,
  MlFlexMode,
  RepartidorMercadoLibreStatus,
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

export interface AppVersionInfo {
  version: string;
  minVersion: string;
  versionCode?: number;
  minVersionCode?: number;
  downloadUrl: string;
  message?: string;
}

class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request<T>(
  path: string,
  options: {
    method?: string;
    token?: string | null;
    body?: unknown;
    timeoutMs?: number;
  } = {}
): Promise<T> {
  const { method = 'GET', token, body, timeoutMs = 60_000 } = options;

  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(apiUrl(path), {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    if (!res.ok) {
      let message = 'Error de servidor';
      let code: string | undefined;
      try {
        const data = await res.json();
        message = data.error || message;
        code = data.code;
      } catch {
        // respuesta no-JSON
      }
      throw new ApiError(message, res.status, code);
    }

    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ApiError(
        'La operación tardó demasiado. Verificá tu conexión e intentá de nuevo.',
        0,
        'TIMEOUT'
      );
    }
    const message = err instanceof Error ? err.message : String(err);
    if (/network|failed to fetch|fetch/i.test(message)) {
      throw new ApiError(
        'Sin conexión con el servidor. Verificá internet o intentá en unos segundos.',
        0,
        'NETWORK'
      );
    }
    throw err instanceof Error ? err : new Error(message);
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  login(
    username: string,
    password: string,
    options?: { replaceSession?: boolean }
  ): Promise<LoginResponse> {
    return request<LoginResponse>('/api/auth/login', {
      method: 'POST',
      body: { username, password, replaceSession: options?.replaceSession === true },
    });
  },

  me(token: string): Promise<User> {
    return request<User>('/api/auth/me', { token });
  },

  logout(token: string): Promise<void> {
    return request<void>('/api/auth/logout', { method: 'POST', token });
  },

  getAppVersion(): Promise<AppVersionInfo> {
    return request<AppVersionInfo>('/api/app/version');
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

  registerPushToken(token: string, expoPushToken: string, platform?: string): Promise<void> {
    return request<void>('/api/notifications/push-token', {
      method: 'POST',
      token,
      body: { expoPushToken, platform },
    });
  },

  unregisterPushToken(token: string, expoPushToken: string): Promise<void> {
    return request<void>('/api/notifications/push-token', {
      method: 'DELETE',
      token,
      body: { expoPushToken },
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

  getAgencyCourierStatus(token: string): Promise<AgencyIntegrationsStatus> {
    return request<AgencyIntegrationsStatus>('/api/integrations/agency/status', { token });
  },

  updateAgencyMlFlexMode(token: string, mlFlexMode: MlFlexMode): Promise<{ mlFlexMode: MlFlexMode }> {
    return request<{ mlFlexMode: MlFlexMode }>('/api/accounts/agency/ml-flex-mode', {
      method: 'PUT',
      token,
      body: { mlFlexMode },
    });
  },

  getRepartidorMlStatus(token: string): Promise<RepartidorMercadoLibreStatus> {
    return request<RepartidorMercadoLibreStatus>('/api/integrations/repartidor/status', { token });
  },

  getIntegrationConnectUrl(
    token: string,
    platform: MarketplacePlatform,
    client: 'mobile' | 'web' = 'web',
    redirectUri?: string
  ): Promise<{ url: string }> {
    const params = new URLSearchParams();
    if (client === 'mobile') params.set('client', 'mobile');
    if (redirectUri) params.set('redirect_uri', redirectUri);
    const qs = params.toString() ? `?${params}` : '';
    return request<{ url: string }>(`/api/integrations/${platform}/connect${qs}`, { token });
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

export { ApiError };
