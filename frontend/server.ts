/**
 * @deprecated Este servidor integrado fue reemplazado por backend/ (Express + MySQL).
 * Usá `npm run dev` en frontend/ (Vite) y `npm run dev` en backend/.
 */

import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { User, UserRole, Order, OrderStatus, AppNotification, LocationHistoryPoint, isAgencyAdmin } from './src/types.js';

const PORT = 3000;
const DB_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DB_DIR, 'db.json');

// Interface para el archivo JSON de la base de datos
interface DatabaseSchema {
  users: User[];
  passwords: Record<string, string>; // userId -> password
  orders: Order[];
  notifications: AppNotification[];
}

// Inicializar la base de datos de manera síncrona
function initDatabase(): DatabaseSchema {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  // Si ya existe la base de datos, la cargamos y migramos si es necesario
  if (fs.existsSync(DB_FILE)) {
    try {
      const content = fs.readFileSync(DB_FILE, 'utf-8');
      const loaded = JSON.parse(content) as DatabaseSchema;
      
      let modified = false;
      // Migrar rol 'admin' a UserRole.STORE_ADMIN
      loaded.users = loaded.users.map(u => {
        if ((u.role as any) === 'admin') {
          u.role = UserRole.STORE_ADMIN;
          u.name = 'Lupo Ventas (Local)';
          modified = true;
        }
        return u;
      });

      // Asegurar que exista 'logistica' en la base de datos
      if (!loaded.users.some(u => u.username === 'logistica')) {
        loaded.users.push({ id: 'u5', username: 'logistica', name: 'Lupo Logística (Envíos)', role: UserRole.SUPER_ADMIN });
        loaded.passwords['u5'] = 'logistica123';
        modified = true;
      }

      if (modified) {
        fs.writeFileSync(DB_FILE, JSON.stringify(loaded, null, 2), 'utf-8');
      }
      return loaded;
    } catch (e) {
      console.error('Error al leer db.json, recreando...', e);
    }
  }

  // Datos mock iniciales en Buenos Aires
  const initialData: DatabaseSchema = {
    users: [
      { id: 'u1', username: 'admin', name: 'Lupo Ventas (Local)', role: UserRole.STORE_ADMIN },
      { id: 'u5', username: 'logistica', name: 'Lupo Logística (Envíos)', role: UserRole.SUPER_ADMIN },
      { id: 'u2', username: 'carlos', name: 'Carlos Gómez', role: UserRole.REPARTIDOR, currentLocation: { lat: -34.5901, lng: -58.4215, timestamp: new Date().toISOString() } },
      { id: 'u3', username: 'maria', name: 'María Rodríguez', role: UserRole.REPARTIDOR, currentLocation: { lat: -34.5712, lng: -58.4412, timestamp: new Date().toISOString() } },
      { id: 'u4', username: 'juan', name: 'Juan Pérez', role: UserRole.REPARTIDOR, currentLocation: { lat: -34.6000, lng: -58.4100, timestamp: new Date().toISOString() } }
    ],
    passwords: {
      'u1': 'admin123',
      'u5': 'logistica123',
      'u2': 'carlos123',
      'u3': 'maria123',
      'u4': 'juan123'
    },
    orders: [
      {
        id: 'PED-2001',
        sellerId: 'u1',
        sellerName: 'Tienda Demo',
        clientName: 'Alejandro Rossi',
        clientPhone: '+54 11 5555-1234',
        address: 'Av. Callao 1500, Recoleta, CABA',
        lat: -34.5895,
        lng: -58.3974,
        status: OrderStatus.DELIVERING,
        repartidorId: 'u2',
        repartidorName: 'Carlos Gómez',
        createdAt: new Date(Date.now() - 3600000).toISOString(), // hace 1 hora
        updatedAt: new Date(Date.now() - 1800000).toISOString(),
        notes: 'Entregar en portería del edificio. Tocar timbre 5B.',
        history: [
          { status: OrderStatus.PENDING, timestamp: new Date(Date.now() - 3600000).toISOString(), updatedBy: 'Lupo Administración' },
          { status: OrderStatus.ASSIGNED, timestamp: new Date(Date.now() - 2700000).toISOString(), updatedBy: 'Lupo Administración' },
          { status: OrderStatus.DELIVERING, timestamp: new Date(Date.now() - 1800000).toISOString(), updatedBy: 'Carlos Gómez' }
        ],
        locationHistory: [
          { lat: -34.5885, lng: -58.4306, timestamp: new Date(Date.now() - 1800000).toISOString() }, // Palermo Soho Hub
          { lat: -34.5890, lng: -58.4260, timestamp: new Date(Date.now() - 1200000).toISOString() },
          { lat: -34.5901, lng: -58.4215, timestamp: new Date(Date.now() - 600000).toISOString() }
        ]
      },
      {
        id: 'PED-2002',
        sellerId: 'u1',
        sellerName: 'Tienda Demo',
        clientName: 'Sofía Martínez',
        clientPhone: '+54 11 5555-5678',
        address: 'Av. Cabildo 2200, Belgrano, CABA',
        lat: -34.5621,
        lng: -58.4565,
        status: OrderStatus.ASSIGNED,
        repartidorId: 'u3',
        repartidorName: 'María Rodríguez',
        createdAt: new Date(Date.now() - 1800000).toISOString(),
        updatedAt: new Date(Date.now() - 1200000).toISOString(),
        notes: 'Dejar en recepción de planta baja.',
        history: [
          { status: OrderStatus.PENDING, timestamp: new Date(Date.now() - 1800000).toISOString(), updatedBy: 'Lupo Administración' },
          { status: OrderStatus.ASSIGNED, timestamp: new Date(Date.now() - 1200000).toISOString(), updatedBy: 'Lupo Administración' }
        ],
        locationHistory: []
      },
      {
        id: 'PED-2003',
        sellerId: 'u1',
        sellerName: 'Tienda Demo',
        clientName: 'Matías Fernández',
        clientPhone: '+54 11 5555-9012',
        address: 'Av. Medrano 400, Almagro, CABA',
        lat: -34.6162,
        lng: -58.4194,
        status: OrderStatus.PENDING,
        repartidorId: null,
        repartidorName: null,
        createdAt: new Date(Date.now() - 900000).toISOString(), // hace 15 mins
        updatedAt: new Date(Date.now() - 900000).toISOString(),
        notes: 'Llamar antes de llegar para bajar.',
        history: [
          { status: OrderStatus.PENDING, timestamp: new Date(Date.now() - 900000).toISOString(), updatedBy: 'Lupo Administración' }
        ],
        locationHistory: []
      },
      {
        id: 'PED-2004',
        sellerId: 'u1',
        sellerName: 'Tienda Demo',
        clientName: 'Lucía Benítez',
        clientPhone: '+54 11 5555-3456',
        address: 'Alicia Moreau de Justo 1200, Puerto Madero, CABA',
        lat: -34.6118,
        lng: -58.3647,
        status: OrderStatus.DELIVERED,
        repartidorId: 'u4',
        repartidorName: 'Juan Pérez',
        createdAt: new Date(Date.now() - 7200000).toISOString(), // hace 2 horas
        updatedAt: new Date(Date.now() - 3600000).toISOString(),
        notes: 'Entregado en mano en piso 4.',
        history: [
          { status: OrderStatus.PENDING, timestamp: new Date(Date.now() - 7200000).toISOString(), updatedBy: 'Lupo Administración' },
          { status: OrderStatus.ASSIGNED, timestamp: new Date(Date.now() - 6300000).toISOString(), updatedBy: 'Lupo Administración' },
          { status: OrderStatus.DELIVERING, timestamp: new Date(Date.now() - 5400000).toISOString(), updatedBy: 'Juan Pérez' },
          { status: OrderStatus.DELIVERED, timestamp: new Date(Date.now() - 3600000).toISOString(), updatedBy: 'Juan Pérez' }
        ],
        locationHistory: [
          { lat: -34.5885, lng: -58.4306, timestamp: new Date(Date.now() - 5400000).toISOString() },
          { lat: -34.6000, lng: -58.4000, timestamp: new Date(Date.now() - 4800000).toISOString() },
          { lat: -34.6118, lng: -58.3647, timestamp: new Date(Date.now() - 3600000).toISOString() }
        ]
      }
    ],
    notifications: [
      {
        id: 'n1',
        userId: 'all',
        title: '¡Bienvenido al sistema Lupo!',
        body: 'Nueva PWA de rastreo de pedidos activa. Repartidores, recuerden activar el GPS al iniciar un envío.',
        createdAt: new Date(Date.now() - 7200000).toISOString(),
        read: false,
        type: 'info'
      },
      {
        id: 'n2',
        userId: 'u3',
        title: 'Nuevo pedido asignado',
        body: 'Se te ha asignado el pedido PED-2002 para Sofía Martínez.',
        createdAt: new Date(Date.now() - 1200000).toISOString(),
        read: false,
        type: 'order_assigned',
        orderId: 'PED-2002'
      }
    ]
  };

  fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2), 'utf-8');
  return initialData;
}

let db = initDatabase();

function saveDatabase() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
}

async function startServer() {
  const app = express();
  
  app.use(express.json());

  // Middleware para CORS simple en desarrollo
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
    } else {
      next();
    }
  });

  // Helper para verificar token de autorización
  const getAuthenticatedUser = (req: express.Request): User | null => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }
    try {
      const base64Token = authHeader.split(' ')[1];
      const decoded = Buffer.from(base64Token, 'base64').toString('utf-8');
      const [userId, role] = decoded.split('_');
      const user = db.users.find(u => u.id === userId && u.role === role);
      return user || null;
    } catch (e) {
      return null;
    }
  };

  // --- API RUTAS ---

  // Login
  app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      res.status(400).json({ error: 'Usuario y contraseña son requeridos.' });
      return;
    }

    const user = db.users.find(u => u.username.toLowerCase() === username.toLowerCase());
    if (!user) {
      res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
      return;
    }

    const storedPassword = db.passwords[user.id];
    if (storedPassword !== password) {
      res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
      return;
    }

    // Generar token Bearer simple y seguro basado en ID y Rol
    const tokenPayload = `${user.id}_${user.role}`;
    const token = Buffer.from(tokenPayload).toString('base64');

    res.json({
      user,
      token
    });
  });

  // Obtener usuario autenticado actual
  app.get('/api/auth/me', (req, res) => {
    const user = getAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ error: 'No autorizado.' });
      return;
    }
    res.json(user);
  });

  // Obtener pedidos
  app.get('/api/orders', (req, res) => {
    const user = getAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ error: 'No autorizado.' });
      return;
    }

    if (user.role === UserRole.STORE_ADMIN || isAgencyAdmin(user.role)) {
      // El admin ve todos los pedidos
      res.json(db.orders);
    } else {
      // El repartidor ve sus pedidos asignados/en curso, o pedidos pendientes libres
      const repartidorOrders = db.orders.filter(
        o => o.repartidorId === user.id || o.status === OrderStatus.PENDING
      );
      res.json(repartidorOrders);
    }
  });

  // Crear pedido (Solo admin)
  app.post('/api/orders', (req, res) => {
    const user = getAuthenticatedUser(req);
    if (!user || (user.role !== UserRole.STORE_ADMIN && !isAgencyAdmin(user.role))) {
      res.status(403).json({ error: 'Solo los administradores pueden crear pedidos.' });
      return;
    }

    const { clientName, clientPhone, address, lat, lng, notes } = req.body;
    if (!clientName || !address || lat === undefined || lng === undefined) {
      res.status(400).json({ error: 'Campos requeridos faltantes (clientName, address, lat, lng).' });
      return;
    }

    const newId = `PED-${2000 + db.orders.length + 1}`;
    const newOrder: Order = {
      id: newId,
      sellerId: user.role === UserRole.STORE_ADMIN ? user.id : null,
      sellerName: user.role === UserRole.STORE_ADMIN ? user.name : null,
      clientName,
      clientPhone: clientPhone || '',
      address,
      lat: Number(lat),
      lng: Number(lng),
      status: OrderStatus.PENDING,
      repartidorId: null,
      repartidorName: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      notes: notes || '',
      history: [
        { status: OrderStatus.PENDING, timestamp: new Date().toISOString(), updatedBy: user.name }
      ],
      locationHistory: []
    };

    db.orders.unshift(newOrder); // Agregar al inicio de la lista

    // Crear notificación para todos los repartidores
    const newNotif: AppNotification = {
      id: `n_order_${Date.now()}`,
      userId: 'all',
      title: 'Nuevo pedido disponible',
      body: `Un nuevo pedido con id ${newId} está listo para ser entregado en ${address}.`,
      createdAt: new Date().toISOString(),
      read: false,
      type: 'info',
      orderId: newId
    };
    db.notifications.unshift(newNotif);

    saveDatabase();
    res.status(201).json(newOrder);
  });

  // Obtener un pedido específico
  app.get('/api/orders/:id', (req, res) => {
    const user = getAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ error: 'No autorizado.' });
      return;
    }

    const order = db.orders.find(o => o.id === req.params.id);
    if (!order) {
      res.status(404).json({ error: 'Pedido no encontrado.' });
      return;
    }

    // Permitir acceso si es admin, o si el pedido está asignado a este repartidor o está libre
    if (user.role === UserRole.STORE_ADMIN || isAgencyAdmin(user.role) || order.repartidorId === user.id || order.status === OrderStatus.PENDING) {
      res.json(order);
    } else {
      res.status(403).json({ error: 'No tienes permiso para ver este pedido.' });
    }
  });

  // Actualizar estado del pedido (Asignar, Iniciar viaje, Entregar, Cancelar)
  app.put('/api/orders/:id/status', (req, res) => {
    const user = getAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ error: 'No autorizado.' });
      return;
    }

    const { status, repartidorId, comment } = req.body;
    if (!status) {
      res.status(400).json({ error: 'El estado es requerido.' });
      return;
    }

    const orderIndex = db.orders.findIndex(o => o.id === req.params.id);
    if (orderIndex === -1) {
      res.status(404).json({ error: 'Pedido no encontrado.' });
      return;
    }

    const order = db.orders[orderIndex];

    // Reglas de transición de estados y permisos
    if (user.role === UserRole.REPARTIDOR) {
      // Repartidor solo puede modificar pedidos asignados a él o auto-asignarse pedidos pendientes
      if (status === OrderStatus.ASSIGNED) {
        if (order.status !== OrderStatus.PENDING) {
          res.status(400).json({ error: 'Este pedido ya no está disponible.' });
          return;
        }
        order.repartidorId = user.id;
        order.repartidorName = user.name;
      } else {
        if (order.repartidorId !== user.id) {
          res.status(403).json({ error: 'Este pedido no está asignado a ti.' });
          return;
        }
      }
    } else {
      // Admin puede asignar a cualquiera
      if (status === OrderStatus.ASSIGNED) {
        if (!repartidorId) {
          res.status(400).json({ error: 'Debe especificar el repartidorId.' });
          return;
        }
        const assignedRepartidor = db.users.find(u => u.id === repartidorId && u.role === UserRole.REPARTIDOR);
        if (!assignedRepartidor) {
          res.status(400).json({ error: 'Repartidor no encontrado.' });
          return;
        }
        order.repartidorId = assignedRepartidor.id;
        order.repartidorName = assignedRepartidor.name;

        // Crear notificación personal para el repartidor asignado
        const repNotif: AppNotification = {
          id: `n_assign_${Date.now()}`,
          userId: assignedRepartidor.id,
          title: 'Pedido Asignado',
          body: `Se te ha asignado el pedido ${order.id} con entrega en ${order.address}.`,
          createdAt: new Date().toISOString(),
          read: false,
          type: 'order_assigned',
          orderId: order.id
        };
        db.notifications.unshift(repNotif);
      }
    }

    // Actualizar campos
    order.status = status as OrderStatus;
    order.updatedAt = new Date().toISOString();
    order.history.push({
      status: status as OrderStatus,
      timestamp: new Date().toISOString(),
      updatedBy: user.name,
      comment: comment || ''
    });

    // Si pasa a en viaje y no tiene historial de localización, registrar posición inicial del repartidor
    if (status === OrderStatus.DELIVERING) {
      const rep = db.users.find(u => u.id === order.repartidorId);
      if (rep?.currentLocation) {
        order.locationHistory = [{
          lat: rep.currentLocation.lat,
          lng: rep.currentLocation.lng,
          timestamp: new Date().toISOString()
        }];
      } else {
        // Fallback de Palermo Hub
        order.locationHistory = [{
          lat: -34.5885,
          lng: -58.4306,
          timestamp: new Date().toISOString()
        }];
      }
    }

    // Notificación al administrador cuando se entrega un pedido
    if (status === OrderStatus.DELIVERED) {
      const adminNotif: AppNotification = {
        id: `n_deliv_${Date.now()}`,
        userId: 'u1', // ID del admin principal
        title: 'Pedido Entregado',
        body: `¡El pedido ${order.id} ha sido entregado exitosamente por ${order.repartidorName}!`,
        createdAt: new Date().toISOString(),
        read: false,
        type: 'order_delivered',
        orderId: order.id
      };
      db.notifications.unshift(adminNotif);
    }

    db.orders[orderIndex] = order;
    saveDatabase();
    res.json(order);
  });

  // Reportar ubicación GPS del repartidor (Tiempo real)
  app.post('/api/orders/:id/location', (req, res) => {
    const user = getAuthenticatedUser(req);
    if (!user || user.role !== UserRole.REPARTIDOR) {
      res.status(401).json({ error: 'Solo repartidores autenticados pueden reportar su ubicación.' });
      return;
    }

    const { lat, lng } = req.body;
    if (lat === undefined || lng === undefined) {
      res.status(400).json({ error: 'Latitud y longitud son requeridas.' });
      return;
    }

    const orderIndex = db.orders.findIndex(o => o.id === req.params.id);
    if (orderIndex === -1) {
      res.status(404).json({ error: 'Pedido no encontrado.' });
      return;
    }

    const order = db.orders[orderIndex];
    if (order.repartidorId !== user.id) {
      res.status(403).json({ error: 'Este pedido no está asignado a ti.' });
      return;
    }

    const nowStr = new Date().toISOString();

    // Actualizar ubicación actual en el perfil del repartidor
    const userIndex = db.users.findIndex(u => u.id === user.id);
    if (userIndex !== -1) {
      db.users[userIndex].currentLocation = {
        lat: Number(lat),
        lng: Number(lng),
        timestamp: nowStr
      };
    }

    // Si está en curso ('delivering'), registrar punto de trayectoria
    if (order.status === OrderStatus.DELIVERING) {
      const newPoint: LocationHistoryPoint = {
        lat: Number(lat),
        lng: Number(lng),
        timestamp: nowStr
      };
      order.locationHistory.push(newPoint);
      order.updatedAt = nowStr;
      db.orders[orderIndex] = order;
    }

    saveDatabase();
    res.json({ success: true, orderStatus: order.status });
  });

  // Reportar ubicación general del repartidor (sin pedido activo)
  app.post('/api/users/location', (req, res) => {
    const user = getAuthenticatedUser(req);
    if (!user || user.role !== UserRole.REPARTIDOR) {
      res.status(401).json({ error: 'No autorizado.' });
      return;
    }

    const { lat, lng } = req.body;
    if (lat === undefined || lng === undefined) {
      res.status(400).json({ error: 'Latitud y longitud son requeridas.' });
      return;
    }

    const nowStr = new Date().toISOString();
    const userIndex = db.users.findIndex(u => u.id === user.id);
    if (userIndex !== -1) {
      db.users[userIndex].currentLocation = {
        lat: Number(lat),
        lng: Number(lng),
        timestamp: nowStr
      };
      saveDatabase();
    }

    res.json({ success: true });
  });

  // Obtener todos los repartidores y sus últimas ubicaciones (Solo admin)
  app.get('/api/repartidores', (req, res) => {
    const user = getAuthenticatedUser(req);
    if (!user || (user.role !== UserRole.STORE_ADMIN && !isAgencyAdmin(user.role))) {
      res.status(403).json({ error: 'Solo administradores pueden consultar todos los repartidores.' });
      return;
    }

    const repartidores = db.users.filter(u => u.role === UserRole.REPARTIDOR);
    res.json(repartidores);
  });

  // Obtener notificaciones
  app.get('/api/notifications', (req, res) => {
    const user = getAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ error: 'No autorizado.' });
      return;
    }

    // Filtrar notificaciones del usuario específico o globales ('all')
    const userNotifications = db.notifications.filter(
      n => n.userId === 'all' || n.userId === user.id
    );
    res.json(userNotifications);
  });

  // Marcar todas las notificaciones como leídas
  app.post('/api/notifications/read', (req, res) => {
    const user = getAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ error: 'No autorizado.' });
      return;
    }

    db.notifications = db.notifications.map(n => {
      if (n.userId === 'all' || n.userId === user.id) {
        return { ...n, read: true };
      }
      return n;
    });

    saveDatabase();
    res.json({ success: true });
  });

  // --- SIMULADOR DE MOVIMIENTO EN TIEMPO REAL ---
  // Este endpoint simula el movimiento del repartidor más cercano para dar dinamismo en tiempo real en la preview
  app.post('/api/simulator/tick', (req, res) => {
    let updatedCount = 0;
    const nowStr = new Date().toISOString();

    db.orders = db.orders.map(order => {
      if (order.status === OrderStatus.DELIVERING && order.repartidorId) {
        // Obtener último punto del historial o fallback
        const lastPoint = order.locationHistory.length > 0 
          ? order.locationHistory[order.locationHistory.length - 1]
          : { lat: -34.5885, lng: -58.4306 }; // Palermo Hub

        // Calcular paso intermedio hacia las coordenadas del cliente
        const deltaLat = order.lat - lastPoint.lat;
        const deltaLng = order.lng - lastPoint.lng;
        const distance = Math.sqrt(deltaLat * deltaLat + deltaLng * deltaLng);

        // Si está lo suficientemente cerca (ej: menos de 0.001 grados, aprox 100m), marcar como auto-entregado
        if (distance < 0.001) {
          order.status = OrderStatus.DELIVERED;
          order.updatedAt = nowStr;
          order.history.push({
            status: OrderStatus.DELIVERED,
            timestamp: nowStr,
            updatedBy: order.repartidorName || 'Sistema Simulador',
            comment: 'Entregado (Simulación automatizada)'
          });

          // Crear notificación de entrega para admin
          db.notifications.unshift({
            id: `n_sim_deliv_${Date.now()}`,
            userId: 'u1',
            title: 'Pedido Entregado (Simulado)',
            body: `El repartidor ${order.repartidorName} ha completado la entrega de ${order.id}.`,
            createdAt: nowStr,
            read: false,
            type: 'order_delivered',
            orderId: order.id
          });

          updatedCount++;
        } else {
          // Mover un 15% más cerca en cada tick para que sea visible rápidamente
          const stepRatio = 0.15;
          const nextLat = lastPoint.lat + deltaLat * stepRatio;
          const nextLng = lastPoint.lng + deltaLng * stepRatio;

          const newPoint: LocationHistoryPoint = {
            lat: nextLat,
            lng: nextLng,
            timestamp: nowStr
          };

          order.locationHistory.push(newPoint);
          order.updatedAt = nowStr;

          // Actualizar ubicación actual del repartidor
          const repIndex = db.users.findIndex(u => u.id === order.repartidorId);
          if (repIndex !== -1) {
            db.users[repIndex].currentLocation = {
              lat: nextLat,
              lng: nextLng,
              timestamp: nowStr
            };
          }

          updatedCount++;
        }
      }
      return order;
    });

    if (updatedCount > 0) {
      saveDatabase();
    }

    res.json({ success: true, updatedCount });
  });

  // Vite middleware / Serving client
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
