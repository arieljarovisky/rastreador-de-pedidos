# Lupo Repartidor — App móvil (iOS + Android)

App nativa para **repartidores** de LupoEnvios, hecha con **Expo (React Native + TypeScript)**.
Se conecta a tu backend actual (Node/Express/MySQL) **sin modificar el servidor**: usa los mismos
endpoints REST, el mismo login JWT (`Bearer`) y el mismo `socket.io` que tu PWA web.

## Qué hace

- **Login** de repartidor (rechaza otros roles) con sesión persistente.
- **Mis Envíos / Disponibles** con pestañas, pull-to-refresh y actualización en vivo por socket.io
  (con polling de respaldo si el socket se cae).
- **Detalle del envío** con **mapa nativo** (Apple Maps en iOS, Google Maps en Android),
  marcador del destino, tu posición y la traza del recorrido.
- Acciones de estado: **Tomar pedido** (`pending → assigned`), **Iniciar viaje**
  (`assigned → delivering`), **Marcar entregado** (`delivering → delivered`).
- **GPS en vivo**: mientras un envío está "en viaje", reporta tu ubicación a
  `POST /api/orders/:id/location` con el mismo throttle (2s) que la web.
- **GPS en segundo plano**: sigue reportando con la pantalla apagada o la app minimizada
  (`expo-task-manager` + `expo-location` background). Si no hay internet, encola los puntos
  localmente y los sincroniza al recuperar conexión (incluye ruta del pedido con timestamps).
- Botones **Llamar** al cliente y **Cómo llegar** (abre la app de mapas con navegación).

## Estructura

```
lupo-repartidor-app/
├── App.tsx
├── app.json                 # Config Expo, permisos de ubicación, API key de mapas
├── package.json
├── src/
│   ├── config/index.ts      # URL del backend (extra.apiBaseUrl)
│   ├── types.ts             # Tipos compartidos con backend/src/types
│   ├── api.ts               # Cliente HTTP (Bearer)
│   ├── theme.ts             # Paleta oscura tipo zinc (igual que la web)
│   ├── context/
│   │   ├── AuthContext.tsx   # Login + persistencia del token
│   │   └── OrdersContext.tsx # Pedidos + GPS + acciones de estado
│   ├── hooks/
│   │   ├── useOrders.ts          # Carga + socket.io + polling
│   │   └── useLocationReporter.ts# Permisos + watch GPS + reporte
│   ├── components/           # OrderCard, StatusBadge, Button
│   ├── navigation/           # RootNavigator + tipos de rutas
│   └── screens/              # Login, Orders, OrderDetail
```

## Puesta en marcha

Requisitos: **Node 20+** y la app **Expo Go** en tu teléfono (o un emulador).

```bash
cd lupo-repartidor-app
npm install
# Alinea las versiones nativas con tu SDK de Expo (recomendado):
npx expo install expo-location expo-constants react-native-maps \
  react-native-screens react-native-safe-area-context \
  @react-native-async-storage/async-storage expo-status-bar
npx expo start
```

Escaneá el QR con **Expo Go** (Android) o la cámara (iOS).

### 1) Apuntar al backend

Editá `app.json` → `expo.extra.apiBaseUrl`:

```json
"extra": { "apiBaseUrl": "https://TU-BACKEND.up.railway.app" }
```

- En **producción**: la URL pública de tu backend en Railway.
- En **desarrollo** desde un teléfono físico: usá la **IP local de tu PC**, p. ej.
  `http://192.168.0.10:4000` (no uses `localhost`, no resuelve desde el celular).

### 2) Permitir el origen en el backend (CORS / socket.io)

Tu backend valida `corsOrigins`. Para desarrollo con Expo, agregá el origen del dispositivo
a la variable `CORS_ORIGIN` del backend, o permití el host de tu LAN. En producción esto no
hace falta porque la app nativa no envía `Origin` de navegador, pero **socket.io** sí valida
CORS: asegurate de que `CORS_ORIGIN` incluya el origen correcto o ampliá la whitelist para
las conexiones del socket si hiciera falta.

### 3) Mapa en Android (Google Maps)

iOS usa Apple Maps sin configuración. Android necesita una **Google Maps API key**:

1. Creá una key en Google Cloud (Maps SDK for Android).
2. Pegala en `app.json` → `expo.android.config.googleMaps.apiKey`.

> `react-native-maps` no funciona dentro de **Expo Go** en Android para Google Maps con key
> propia; para probar el mapa en Android conviene un **development build**:
> `npx expo install expo-dev-client` y luego `npx expo run:android`.

## Compilar para las tiendas

Con **EAS Build** (servicio de Expo):

```bash
npm install -g eas-cli
eas login
eas build --platform android   # genera .aab para Google Play
eas build --platform ios       # genera build para App Store (requiere cuenta Apple Developer)
```

## Notas

- Esta app reutiliza tus enums `UserRole` y `OrderStatus` y la interfaz `Order` tal cual están
  en `backend/src/types/index.ts`. Si cambiás esos tipos en el backend, actualizá `src/types.ts`.
- El reporte de GPS funciona en **primer plano y segundo plano** (requiere **development build**;
  en Expo Go el background location no está soportado). En Android/iOS el sistema pedirá permiso
  de ubicación "siempre" para seguir el envío con la pantalla apagada.
