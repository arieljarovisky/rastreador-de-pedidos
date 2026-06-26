import bcrypt from 'bcryptjs';
import { pool } from '../config/database.js';
import { OrderStatus, UserRole } from '../types/index.js';

const now = Date.now();

async function hash(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function seedDatabase(): Promise<void> {
  const users = [
    { id: 'u1', username: 'admin', name: 'Lupo Ventas (Local)', role: UserRole.STORE_ADMIN, password: 'admin123', lat: null, lng: null, zone: null },
    { id: 'u5', username: 'logistica', name: 'Lupo Logística (Envíos)', role: UserRole.SUPER_ADMIN, password: 'logistica123', lat: null, lng: null, zone: null },
    { id: 'u2', username: 'carlos', name: 'Carlos Gómez', role: UserRole.REPARTIDOR, password: 'carlos123', lat: -34.5901, lng: -58.4215, zone: 'zona_sur' },
    { id: 'u3', username: 'maria', name: 'María Rodríguez', role: UserRole.REPARTIDOR, password: 'maria123', lat: -34.5712, lng: -58.4412, zone: 'zona_norte' },
    { id: 'u4', username: 'juan', name: 'Juan Pérez', role: UserRole.REPARTIDOR, password: 'juan123', lat: -34.6, lng: -58.41, zone: 'zona_oeste' },
  ];

  for (const u of users) {
    const passwordHash = await hash(u.password);
    const locTime = u.lat != null ? new Date(now) : null;
    const departure =
      u.id === 'u5'
        ? {
            address: 'Av. Santa Fe 3200, Palermo, CABA',
            lat: -34.5885,
            lng: -58.4306,
          }
        : null;
    await pool.query(
      `INSERT INTO users (id, username, password_hash, name, role, current_lat, current_lng, location_updated_at,
        departure_address, departure_lat, departure_lng, delivery_zone)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE username = VALUES(username), password_hash = VALUES(password_hash), name = VALUES(name), role = VALUES(role),
         departure_address = VALUES(departure_address), departure_lat = VALUES(departure_lat), departure_lng = VALUES(departure_lng),
         delivery_zone = VALUES(delivery_zone)`,
      [
        u.id,
        u.username,
        passwordHash,
        u.name,
        u.role,
        u.lat,
        u.lng,
        locTime,
        departure?.address ?? null,
        departure?.lat ?? null,
        departure?.lng ?? null,
        u.zone ?? null,
      ]
    );
  }

  const pickupPoints = [
    {
      id: 'pp1',
      userId: 'u1',
      label: 'Depósito principal',
      address: 'Av. Rivadavia 4500, Caballito, CABA',
      lat: -34.6186,
      lng: -58.4352,
    },
    {
      id: 'pp2',
      userId: 'u1',
      label: 'Sucursal norte',
      address: 'Av. Cabildo 1500, Belgrano, CABA',
      lat: -34.555,
      lng: -58.455,
    },
  ];

  for (const p of pickupPoints) {
    await pool.query(
      `INSERT INTO pickup_points (id, user_id, label, address, lat, lng, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE label = VALUES(label), address = VALUES(address), lat = VALUES(lat), lng = VALUES(lng)`,
      [p.id, p.userId, p.label, p.address, p.lat, p.lng, new Date(now)]
    );
  }

  const orders = [
    {
      id: 'PED-2001',
      clientName: 'Alejandro Rossi',
      clientPhone: '+54 11 5555-1234',
      address: 'Av. Callao 1500, Recoleta, CABA',
      lat: -34.5895,
      lng: -58.3974,
      status: OrderStatus.DELIVERING,
      repartidorId: 'u2',
      createdAt: new Date(now - 3600000),
      updatedAt: new Date(now - 1800000),
      notes: 'Entregar en portería del edificio. Tocar timbre 5B.',
      history: [
        { status: OrderStatus.PENDING, offset: -3600000, by: 'Lupo Administración' },
        { status: OrderStatus.ASSIGNED, offset: -2700000, by: 'Lupo Administración' },
        { status: OrderStatus.DELIVERING, offset: -1800000, by: 'Carlos Gómez' },
      ],
      locations: [
        { lat: -34.5885, lng: -58.4306, offset: -1800000 },
        { lat: -34.589, lng: -58.426, offset: -1200000 },
        { lat: -34.5901, lng: -58.4215, offset: -600000 },
      ],
    },
    {
      id: 'PED-2002',
      clientName: 'Sofía Martínez',
      clientPhone: '+54 11 5555-5678',
      address: 'Av. Cabildo 2200, Belgrano, CABA',
      lat: -34.5621,
      lng: -58.4565,
      status: OrderStatus.ASSIGNED,
      repartidorId: 'u3',
      createdAt: new Date(now - 1800000),
      updatedAt: new Date(now - 1200000),
      notes: 'Dejar en recepción de planta baja.',
      history: [
        { status: OrderStatus.PENDING, offset: -1800000, by: 'Lupo Administración' },
        { status: OrderStatus.ASSIGNED, offset: -1200000, by: 'Lupo Administración' },
      ],
      locations: [] as { lat: number; lng: number; offset: number }[],
    },
    {
      id: 'PED-2003',
      clientName: 'Matías Fernández',
      clientPhone: '+54 11 5555-9012',
      address: 'Av. Medrano 400, Almagro, CABA',
      lat: -34.6162,
      lng: -58.4194,
      status: OrderStatus.PENDING,
      repartidorId: null,
      createdAt: new Date(now - 900000),
      updatedAt: new Date(now - 900000),
      notes: 'Llamar antes de llegar para bajar.',
      history: [{ status: OrderStatus.PENDING, offset: -900000, by: 'Lupo Administración' }],
      locations: [],
    },
    {
      id: 'PED-2004',
      clientName: 'Lucía Benítez',
      clientPhone: '+54 11 5555-3456',
      address: 'Alicia Moreau de Justo 1200, Puerto Madero, CABA',
      lat: -34.6118,
      lng: -58.3647,
      status: OrderStatus.DELIVERED,
      repartidorId: 'u4',
      createdAt: new Date(now - 7200000),
      updatedAt: new Date(now - 3600000),
      notes: 'Entregado en mano en piso 4.',
      history: [
        { status: OrderStatus.PENDING, offset: -7200000, by: 'Lupo Administración' },
        { status: OrderStatus.ASSIGNED, offset: -6300000, by: 'Lupo Administración' },
        { status: OrderStatus.DELIVERING, offset: -5400000, by: 'Juan Pérez' },
        { status: OrderStatus.DELIVERED, offset: -3600000, by: 'Juan Pérez' },
      ],
      locations: [
        { lat: -34.5885, lng: -58.4306, offset: -5400000 },
        { lat: -34.6, lng: -58.4, offset: -4800000 },
        { lat: -34.6118, lng: -58.3647, offset: -3600000 },
      ],
    },
  ];

  for (const o of orders) {
    await pool.query(
      `INSERT INTO orders (id, seller_id, client_name, client_phone, address, lat, lng, status, repartidor_id, notes, created_at, updated_at)
       VALUES (?, 'u1', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE client_name = VALUES(client_name), status = VALUES(status), repartidor_id = VALUES(repartidor_id)`,
      [o.id, o.clientName, o.clientPhone, o.address, o.lat, o.lng, o.status, o.repartidorId, o.notes, o.createdAt, o.updatedAt]
    );

    await pool.query('DELETE FROM order_history WHERE order_id = ?', [o.id]);
    await pool.query('DELETE FROM order_location_history WHERE order_id = ?', [o.id]);

    for (const h of o.history) {
      await pool.query(
        `INSERT INTO order_history (order_id, status, updated_by, comment, created_at) VALUES (?, ?, ?, '', ?)`,
        [o.id, h.status, h.by, new Date(now + h.offset)]
      );
    }

    for (const loc of o.locations) {
      await pool.query(
        `INSERT INTO order_location_history (order_id, lat, lng, created_at) VALUES (?, ?, ?, ?)`,
        [o.id, loc.lat, loc.lng, new Date(now + loc.offset)]
      );
    }
  }

  const notifications = [
    {
      id: 'n1',
      userId: 'all',
      title: '¡Bienvenido al sistema Lupo!',
      body: 'Nueva PWA de rastreo de pedidos activa. Repartidores, recuerden activar el GPS al iniciar un envío.',
      createdAt: new Date(now - 7200000),
      type: 'info' as const,
      orderId: null,
    },
    {
      id: 'n2',
      userId: 'u3',
      title: 'Nuevo pedido asignado',
      body: 'Se te ha asignado el pedido PED-2002 para Sofía Martínez.',
      createdAt: new Date(now - 1200000),
      type: 'order_assigned' as const,
      orderId: 'PED-2002',
    },
  ];

  for (const n of notifications) {
    await pool.query(
      `INSERT INTO notifications (id, user_id, title, body, type, order_id, is_read, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?)
       ON DUPLICATE KEY UPDATE title = VALUES(title), body = VALUES(body)`,
      [n.id, n.userId, n.title, n.body, n.type, n.orderId, n.createdAt]
    );
  }

  console.log('Seed completado: usuarios, puntos de colecta, pedidos y notificaciones demo.');
}
