import { apiUrl } from './config';
import { AppNotification, Order, OrderStatus, User } from './types';

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
    lng: number
  ): Promise<void> {
    return request<void>(`/api/orders/${orderId}/location`, {
      method: 'POST',
      token,
      body: { lat, lng },
    });
  },

  /** Reporta ubicación general del repartidor (sin pedido activo). */
  reportUserLocation(token: string, lat: number, lng: number): Promise<void> {
    return request<void>('/api/users/location', {
      method: 'POST',
      token,
      body: { lat, lng },
    });
  },

  getNotifications(token: string): Promise<AppNotification[]> {
    return request<AppNotification[]>('/api/notifications', { token });
  },

  markNotificationsRead(token: string): Promise<void> {
    return request<void>('/api/notifications/read', { method: 'POST', token });
  },
};

export { ApiError };
