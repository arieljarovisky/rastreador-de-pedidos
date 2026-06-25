# LupoEnvios — Backend

API REST con Node.js, Express y MySQL para el rastreo de pedidos en tiempo real.

## Requisitos

- Node.js 20+
- MySQL 8+

## Instalación

```bash
cd backend
npm install
cp .env.example .env
```

Editá `.env` con tus credenciales de MySQL.

## Base de datos

El script crea la base `lupo_tracking`, las tablas y los datos demo:

```bash
npm run db:setup
```

Usuarios demo:

| Usuario    | Contraseña    | Rol              |
|------------|---------------|------------------|
| admin      | admin123      | Vendedor         |
| logistica  | logistica123  | Agencia logística|
| carlos     | carlos123     | Repartidor       |
| maria      | maria123      | Repartidor       |
| juan       | juan123       | Repartidor       |

## Desarrollo

```bash
npm run dev
```

El servidor corre en `http://localhost:4000`.

## Frontend

En otra terminal:

```bash
cd ../frontend
npm run dev
```

El frontend en `http://localhost:5173` usa proxy hacia `/api` en el backend.

## Endpoints

- `POST /api/auth/login` — Login (JWT)
- `GET /api/auth/me` — Usuario actual
- `GET/POST /api/orders` — Listar / crear pedidos
- `GET /api/orders/:id` — Detalle
- `PUT /api/orders/:id/status` — Cambiar estado
- `POST /api/orders/:id/location` — GPS del repartidor
- `POST /api/users/location` — Ubicación general del repartidor
- `GET /api/repartidores` — Lista de repartidores
- `GET /api/notifications` — Notificaciones
- `POST /api/notifications/read` — Marcar como leídas
- `POST /api/simulator/tick` — Simulador GPS (demo)
