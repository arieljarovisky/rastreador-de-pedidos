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

### Local (primera vez)

```bash
npm run db:setup
```

### Railway — reemplazar base existente (ej. tablas de otro proyecto)

Si el MySQL de Railway ya tiene tablas de otro sistema, usá **reset** para borrarlas todas y crear las de tracking:

```bash
npm run db:reset
```

Esto elimina **todas** las tablas del schema actual y crea: `users`, `orders`, `order_history`, `order_location_history`, `notifications`.

**Desde Railway:** entrá al servicio del **backend** → pestaña **Settings** → **Run command** (o consola one-off) y ejecutá:

```bash
npm run db:reset
```

Asegurate de que el backend tenga las variables del MySQL vinculado (ver sección Deploy).

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

## Deploy en Railway

### 1. Variables del backend

En el servicio **backend** (`gran-dt-mundial-2026` o similar), agregá estas variables referenciando tu plugin MySQL:

| Variable      | Valor en Railway                          |
|---------------|-------------------------------------------|
| `DB_HOST`     | `${{MySQL.MYSQLHOST}}`                    |
| `DB_PORT`     | `${{MySQL.MYSQLPORT}}`                    |
| `DB_USER`     | `${{MySQL.MYSQLUSER}}`                    |
| `DB_PASSWORD` | `${{MySQL.MYSQLPASSWORD}}`              |
| `DB_NAME`     | `${{MySQL.MYSQLDATABASE}}`                |
| `JWT_SECRET`  | una clave larga aleatoria                 |
| `CORS_ORIGIN` | URL de tu frontend (ej. `https://...`)    |

También podés usar directamente `MYSQLHOST`, `MYSQLPORT`, etc. si las inyectás en el mismo servicio.

### 2. Root Directory

Configurá **Root Directory** = `backend/`.

### 3. Reemplazar la base de datos vieja

Después del deploy, en el servicio backend ejecutá **una vez**:

```bash
npm run db:reset:prod
```

(O en local: `npm run db:reset`)

Eso borra tablas como `fantasy_teams`, `tournaments`, etc. y crea el esquema de LupoEnvios.

### 4. Build

El build usa `node ./node_modules/typescript/lib/tsc.js` para evitar el error `tsc: Permission denied` en Linux.
