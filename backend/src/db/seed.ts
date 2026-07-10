import bcrypt from 'bcryptjs';
import { pool } from '../config/database.js';
import { seedDefaultZonesForAgency, ensureCordonZonesForAgency } from '../services/delivery-zones.service.js';
import { OrderStatus, UserRole } from '../types/index.js';
import { computeDeliveryDeadline } from '../utils/delivery-deadline.js';

const now = Date.now();
const agencyId = 'ag_demo';
const DEPOT = { lat: -34.5885, lng: -58.4306 };

const REPARTIDORES = [
  { id: 'u2', name: 'Carlos Gómez' },
  { id: 'u3', name: 'María Rodríguez' },
  { id: 'u4', name: 'Juan Pérez' },
] as const;

const VENDORS = [
  { id: 'u1', username: 'admin', name: 'Lupo Ventas (Local)', password: 'admin123' },
  { id: 'u6', username: 'moda-norte', name: 'Moda Norte Boutique', password: 'vendor123' },
  { id: 'u7', username: 'tech-ba', name: 'TechBA Electro', password: 'vendor123' },
  { id: 'u8', username: 'hogar-shop', name: 'Hogar & Deco Shop', password: 'vendor123' },
  { id: 'u9', username: 'fitness-pro', name: 'Fitness Pro Store', password: 'vendor123' },
  { id: 'u10', username: 'gourmet-ba', name: 'Gourmet BA', password: 'vendor123' },
  { id: 'u11', username: 'pet-corner', name: 'Pet Corner', password: 'vendor123' },
] as const;

const DEMO_ADDRESSES = [
  { address: 'Av. Callao 1500, Recoleta, CABA', lat: -34.5895, lng: -58.3974 },
  { address: 'Av. Cabildo 2200, Belgrano, CABA', lat: -34.5621, lng: -58.4565 },
  { address: 'Av. Medrano 400, Almagro, CABA', lat: -34.6162, lng: -58.4194 },
  { address: 'Alicia Moreau de Justo 1200, Puerto Madero, CABA', lat: -34.6118, lng: -58.3647 },
  { address: 'Av. Corrientes 4500, Almagro, CABA', lat: -34.6035, lng: -58.4258 },
  { address: 'Av. Rivadavia 5500, Caballito, CABA', lat: -34.6245, lng: -58.4412 },
  { address: 'Av. Santa Fe 2800, Palermo, CABA', lat: -34.5872, lng: -58.4051 },
  { address: 'Av. del Libertador 5800, Núñez, CABA', lat: -34.5489, lng: -58.4567 },
  { address: 'Av. San Juan 2200, San Cristóbal, CABA', lat: -34.6218, lng: -58.3987 },
  { address: 'Av. Córdoba 4200, Palermo, CABA', lat: -34.5956, lng: -58.4213 },
  { address: 'Av. Independencia 3100, Boedo, CABA', lat: -34.6289, lng: -58.4123 },
  { address: 'Av. Scalabrini Ortiz 1200, Villa Crespo, CABA', lat: -34.5987, lng: -58.4312 },
  { address: 'Av. Directorio 1200, Parque Chacabuco, CABA', lat: -34.6345, lng: -58.4289 },
  { address: 'Av. La Plata 800, Barracas, CABA', lat: -34.6412, lng: -58.3789 },
  { address: 'Av. Entre Ríos 1100, Constitución, CABA', lat: -34.6278, lng: -58.3845 },
  { address: 'Av. Pueyrredón 900, Balvanera, CABA', lat: -34.6089, lng: -58.4012 },
  { address: 'Av. Triunvirato 3200, Villa Urquiza, CABA', lat: -34.5712, lng: -58.4789 },
  { address: 'Av. Monroe 4500, Belgrano R, CABA', lat: -34.5567, lng: -58.4456 },
  { address: 'Av. Caseros 2500, Parque Patricios, CABA', lat: -34.6389, lng: -58.4012 },
  { address: 'Av. Jujuy 1800, Parque Centenario, CABA', lat: -34.6156, lng: -58.4345 },
] as const;

const CLIENT_NAMES = [
  'Alejandro Rossi', 'Sofía Martínez', 'Matías Fernández', 'Lucía Benítez',
  'Valentina Acosta', 'Diego Romero', 'Camila Suárez', 'Nicolás Herrera',
  'Florencia Díaz', 'Martín Castillo', 'Julieta Morales', 'Facundo Ríos',
  'Agustina Vega', 'Tomás Navarro', 'Paula Campos', 'Sebastián Luna',
  'Carolina Méndez', 'Gonzalo Paredes', 'Daniela Fuentes', 'Emilio Torres',
  'Mariana Iglesias', 'Lucas Cabrera', 'Romina Soto', 'Pablo Aguirre',
  'Andrea Blanco', 'Federico Cruz', 'Natalia Ponce', 'Hernán Salinas',
  'Gabriela Ruiz', 'Maximiliano Ortiz', 'Verónica Silva', 'Rodrigo Méndez',
  'Claudia Ramos', 'Ezequiel Vargas', 'Laura Giménez', 'Ignacio Peña',
  'Silvia Conti', 'Bruno Ferreyra', 'Patricia Molina', 'Ricardo Domínguez',
  'Elena Vidal', 'Oscar Benítez', 'Cecilia Arias', 'Hugo Delgado',
  'Mónica Reyes', 'Alberto Castro', 'Susana Núñez', 'Raúl Espinoza',
  'Graciela Peralta', 'Jorge Montoya', 'Liliana Cabral', 'Sergio Ibarra',
  'Norma Escobar', 'Walter Cáceres', 'Adriana Figueroa', 'Miguel Barrios',
] as const;

const DELIVERY_NOTES = [
  'Entregar en portería del edificio.',
  'Dejar en recepción de planta baja.',
  'Llamar antes de llegar para bajar.',
  'Entregar en mano, timbre 3A.',
  'Dejar con encargado si no hay nadie.',
  'Pedido frágil, manejar con cuidado.',
  'Cliente prefiere entrega por la tarde.',
  'Acceso por calle lateral, portón verde.',
  'Tocar timbre y esperar en la vereda.',
  'Entregar solo al titular del pedido.',
  '',
  'Departamento 8B, ascensor al fondo.',
  'Local comercial, horario 10 a 18 hs.',
] as const;

type OrderSeed = {
  id: string;
  sellerId: string;
  clientName: string;
  clientPhone: string;
  address: string;
  lat: number;
  lng: number;
  status: OrderStatus;
  repartidorId: string | null;
  createdAt: Date;
  updatedAt: Date;
  notes: string;
  history: { status: OrderStatus; offset: number; by: string }[];
  locations: { lat: number; lng: number; offset: number }[];
};

async function hash(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

function pick<T>(arr: readonly T[], index: number): T {
  return arr[index % arr.length];
}

function buildHistory(
  status: OrderStatus,
  repartidorName: string | null,
  ageMs: number
): { status: OrderStatus; offset: number; by: string }[] {
  const admin = 'Lupo Administración';
  const steps: OrderStatus[] = [OrderStatus.PENDING];
  if (status === OrderStatus.ASSIGNED || status === OrderStatus.DELIVERING || status === OrderStatus.DELIVERED) {
    steps.push(OrderStatus.ASSIGNED);
  }
  if (status === OrderStatus.DELIVERING || status === OrderStatus.DELIVERED) {
    steps.push(OrderStatus.DELIVERING);
  }
  if (status === OrderStatus.DELIVERED) {
    steps.push(OrderStatus.DELIVERED);
  }
  if (status === OrderStatus.CANCELLED) {
    return [
      { status: OrderStatus.PENDING, offset: -ageMs, by: admin },
      { status: OrderStatus.CANCELLED, offset: -Math.floor(ageMs * 0.3), by: admin },
    ];
  }

  const span = ageMs;
  return steps.map((s, i) => {
    const fraction = steps.length === 1 ? 1 : i / (steps.length - 1);
    const offset = -Math.floor(span * (1 - fraction * 0.85));
    const by =
      s === OrderStatus.DELIVERING || s === OrderStatus.DELIVERED
        ? repartidorName ?? admin
        : admin;
    return { status: s, offset, by };
  });
}

function buildLocations(
  destLat: number,
  destLng: number,
  ageMs: number
): { lat: number; lng: number; offset: number }[] {
  return [
    { lat: DEPOT.lat, lng: DEPOT.lng, offset: -ageMs },
    {
      lat: DEPOT.lat + (destLat - DEPOT.lat) * 0.45,
      lng: DEPOT.lng + (destLng - DEPOT.lng) * 0.45,
      offset: -Math.floor(ageMs * 0.55),
    },
    { lat: destLat, lng: destLng, offset: -Math.floor(ageMs * 0.15) },
  ];
}

function statusForIndex(i: number): OrderStatus {
  const r = i % 20;
  if (r < 7) return OrderStatus.PENDING;
  if (r < 12) return OrderStatus.ASSIGNED;
  if (r < 16) return OrderStatus.DELIVERING;
  if (r < 19) return OrderStatus.DELIVERED;
  return OrderStatus.CANCELLED;
}

function generateDemoOrders(): OrderSeed[] {
  const orders: OrderSeed[] = [];
  const total = 60;
  const featured: Partial<OrderSeed>[] = [
    {
      id: 'PED-2001',
      sellerId: 'u6',
      clientName: 'Alejandro Rossi',
      clientPhone: '+54 11 5555-1234',
      address: DEMO_ADDRESSES[0].address,
      lat: DEMO_ADDRESSES[0].lat,
      lng: DEMO_ADDRESSES[0].lng,
      status: OrderStatus.DELIVERING,
      repartidorId: 'u2',
      notes: 'Entregar en portería del edificio. Tocar timbre 5B.',
    },
    {
      id: 'PED-2002',
      sellerId: 'u7',
      clientName: 'Sofía Martínez',
      clientPhone: '+54 11 5555-5678',
      address: DEMO_ADDRESSES[1].address,
      lat: DEMO_ADDRESSES[1].lat,
      lng: DEMO_ADDRESSES[1].lng,
      status: OrderStatus.ASSIGNED,
      repartidorId: 'u3',
      notes: 'Dejar en recepción de planta baja.',
    },
    {
      id: 'PED-2003',
      sellerId: 'u8',
      clientName: 'Matías Fernández',
      clientPhone: '+54 11 5555-9012',
      address: DEMO_ADDRESSES[2].address,
      lat: DEMO_ADDRESSES[2].lat,
      lng: DEMO_ADDRESSES[2].lng,
      status: OrderStatus.PENDING,
      repartidorId: null,
      notes: 'Llamar antes de llegar para bajar.',
    },
    {
      id: 'PED-2004',
      sellerId: 'u9',
      clientName: 'Lucía Benítez',
      clientPhone: '+54 11 5555-3456',
      address: DEMO_ADDRESSES[3].address,
      lat: DEMO_ADDRESSES[3].lat,
      lng: DEMO_ADDRESSES[3].lng,
      status: OrderStatus.DELIVERED,
      repartidorId: 'u4',
      notes: 'Entregado en mano en piso 4.',
    },
  ];

  for (let i = 0; i < total; i++) {
    const orderNum = 2001 + i;
    const id = `PED-${orderNum}`;
    const featuredOrder = featured.find((f) => f.id === id);
    const addr = pick(DEMO_ADDRESSES, i);
    const seller = pick(VENDORS, i);
    const status = featuredOrder?.status ?? statusForIndex(i);
    const ageMs = 3_600_000 + (i % 48) * 1_800_000;
    const repartidor =
      status === OrderStatus.PENDING || status === OrderStatus.CANCELLED
        ? null
        : pick(REPARTIDORES, i);
    const repartidorName = repartidor?.name ?? null;
    const createdAt = new Date(now - ageMs);
    const updatedAt = new Date(now - Math.floor(ageMs * 0.25));

    const order: OrderSeed = {
      id,
      sellerId: featuredOrder?.sellerId ?? seller.id,
      clientName: featuredOrder?.clientName ?? pick(CLIENT_NAMES, i),
      clientPhone: featuredOrder?.clientPhone ?? `+54 11 5555-${String(1000 + (i % 9000)).padStart(4, '0')}`,
      address: featuredOrder?.address ?? addr.address,
      lat: featuredOrder?.lat ?? addr.lat,
      lng: featuredOrder?.lng ?? addr.lng,
      status,
      repartidorId: featuredOrder?.repartidorId !== undefined ? featuredOrder.repartidorId : repartidor?.id ?? null,
      createdAt,
      updatedAt,
      notes: featuredOrder?.notes ?? pick(DELIVERY_NOTES, i),
      history: buildHistory(status, repartidorName, ageMs),
      locations:
        status === OrderStatus.DELIVERING || status === OrderStatus.DELIVERED
          ? buildLocations(featuredOrder?.lat ?? addr.lat, featuredOrder?.lng ?? addr.lng, ageMs)
          : [],
    };
    orders.push(order);
  }

  return orders;
}

export async function seedDatabase(): Promise<void> {
  await pool.query(
    `INSERT INTO agencies (id, name, departure_address, departure_lat, departure_lng, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE name = VALUES(name), departure_address = VALUES(departure_address),
       departure_lat = VALUES(departure_lat), departure_lng = VALUES(departure_lng)`,
    [
      agencyId,
      'Lupo Logística (Envíos)',
      'Av. Santa Fe 3200, Palermo, CABA',
      DEPOT.lat,
      DEPOT.lng,
      new Date(now),
    ]
  );

  const adminUsers = [
    { id: 'u5', username: 'logistica', name: 'Lupo Logística (Envíos)', role: UserRole.SUPER_ADMIN, password: 'logistica123', lat: null, lng: null, zone: null },
    { id: 'u2', username: 'carlos', name: 'Carlos Gómez', role: UserRole.REPARTIDOR, password: 'carlos123', lat: -34.5901, lng: -58.4215, zone: 'zona_sur' },
    { id: 'u3', username: 'maria', name: 'María Rodríguez', role: UserRole.REPARTIDOR, password: 'maria123', lat: -34.5712, lng: -58.4412, zone: 'zona_norte' },
    { id: 'u4', username: 'juan', name: 'Juan Pérez', role: UserRole.REPARTIDOR, password: 'juan123', lat: -34.6, lng: -58.41, zone: 'zona_oeste' },
  ];

  for (const v of VENDORS) {
    const passwordHash = await hash(v.password);
    await pool.query(
      `INSERT INTO users (id, username, password_hash, name, role, agency_id, current_lat, current_lng, location_updated_at,
        departure_address, departure_lat, departure_lng, delivery_zone)
       VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL)
       ON DUPLICATE KEY UPDATE username = VALUES(username), password_hash = VALUES(password_hash), name = VALUES(name),
         role = VALUES(role), agency_id = VALUES(agency_id)`,
      [v.id, v.username, passwordHash, v.name, UserRole.STORE_ADMIN, agencyId]
    );
  }

  for (const u of adminUsers) {
    const passwordHash = await hash(u.password);
    const locTime = u.lat != null ? new Date(now) : null;
    const departure =
      u.id === 'u5'
        ? { address: 'Av. Santa Fe 3200, Palermo, CABA', lat: DEPOT.lat, lng: DEPOT.lng }
        : null;
    await pool.query(
      `INSERT INTO users (id, username, password_hash, name, role, agency_id, current_lat, current_lng, location_updated_at,
        departure_address, departure_lat, departure_lng, delivery_zone)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE username = VALUES(username), password_hash = VALUES(password_hash), name = VALUES(name), role = VALUES(role),
         agency_id = VALUES(agency_id), departure_address = VALUES(departure_address), departure_lat = VALUES(departure_lat),
         departure_lng = VALUES(departure_lng), delivery_zone = VALUES(delivery_zone)`,
      [
        u.id, u.username, passwordHash, u.name, u.role, agencyId,
        u.lat, u.lng, locTime,
        departure?.address ?? null, departure?.lat ?? null, departure?.lng ?? null,
        u.zone ?? null,
      ]
    );
  }

  const pickupPoints = [
    { id: 'pp1', userId: 'u1', label: 'Depósito principal', address: 'Av. Rivadavia 4500, Caballito, CABA', lat: -34.6186, lng: -58.4352 },
    { id: 'pp2', userId: 'u1', label: 'Sucursal norte', address: 'Av. Cabildo 1500, Belgrano, CABA', lat: -34.555, lng: -58.455 },
    { id: 'pp3', userId: 'u6', label: 'Showroom Palermo', address: 'Honduras 4800, Palermo, CABA', lat: -34.5912, lng: -58.4289 },
    { id: 'pp4', userId: 'u7', label: 'Depósito tech', address: 'Av. Córdoba 5100, Villa Crespo, CABA', lat: -34.5978, lng: -58.4356 },
    { id: 'pp5', userId: 'u8', label: 'Centro de distribución', address: 'Av. San Martín 2200, Flores, CABA', lat: -34.6312, lng: -58.4456 },
    { id: 'pp6', userId: 'u9', label: 'Local Belgrano', address: 'Av. Cabildo 2800, Belgrano, CABA', lat: -34.5589, lng: -58.4612 },
    { id: 'pp7', userId: 'u10', label: 'Cocina central', address: 'Defensa 1200, San Telmo, CABA', lat: -34.6212, lng: -58.3712 },
    { id: 'pp8', userId: 'u11', label: 'Tienda mascotas', address: 'Av. Forest 1200, Colegiales, CABA', lat: -34.5789, lng: -58.4512 },
  ];

  for (const p of pickupPoints) {
    await pool.query(
      `INSERT INTO pickup_points (id, user_id, label, address, lat, lng, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE label = VALUES(label), address = VALUES(address), lat = VALUES(lat), lng = VALUES(lng)`,
      [p.id, p.userId, p.label, p.address, p.lat, p.lng, new Date(now)]
    );
  }

  await seedDefaultZonesForAgency(agencyId);
  await ensureCordonZonesForAgency(agencyId);

  const orders = generateDemoOrders();

  for (const o of orders) {
    const deadline = computeDeliveryDeadline(o.createdAt);
    await pool.query(
      `INSERT INTO orders (id, agency_id, seller_id, client_name, client_phone, address, lat, lng, status, repartidor_id, notes, created_at, updated_at, delivery_deadline)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE client_name = VALUES(client_name), seller_id = VALUES(seller_id), status = VALUES(status),
         repartidor_id = VALUES(repartidor_id), agency_id = VALUES(agency_id), delivery_deadline = VALUES(delivery_deadline)`,
      [
        o.id, agencyId, o.sellerId, o.clientName, o.clientPhone, o.address, o.lat, o.lng,
        o.status, o.repartidorId, o.notes, o.createdAt, o.updatedAt, deadline,
      ]
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
      body: 'Se te ha asignado el pedido PED-2002 para Sofía Martínez (TechBA Electro).',
      createdAt: new Date(now - 1200000),
      type: 'order_assigned' as const,
      orderId: 'PED-2002',
    },
    {
      id: 'n3',
      userId: 'u2',
      title: 'Pedido en camino',
      body: 'PED-2001 de Moda Norte Boutique está en reparto hacia Recoleta.',
      createdAt: new Date(now - 1800000),
      type: 'order_assigned' as const,
      orderId: 'PED-2001',
    },
    {
      id: 'n4',
      userId: 'all',
      title: 'Demo multi-vendedor activa',
      body: '60 pedidos de 7 vendedores cargados para la demostración. Usá logistica / logistica123 para ver el panel completo.',
      createdAt: new Date(now - 300000),
      type: 'info' as const,
      orderId: null,
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

  console.log(
    `Seed completado: ${VENDORS.length} vendedores, ${orders.length} pedidos, ${REPARTIDORES.length} repartidores, zonas y notificaciones demo.`
  );
}
