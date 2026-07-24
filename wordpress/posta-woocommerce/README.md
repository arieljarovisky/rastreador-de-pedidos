# Posta para WooCommerce

Plugin de WordPress que conecta tu tienda **WooCommerce** con **Posta** (`enviosposta.com.ar`).

Crea las API keys REST, registra la tienda en Posta y deja el sync automático por webhook (pedidos pagos/procesando con envío a domicilio).

## Instalación

1. Comprimí la carpeta `posta-woocommerce` en un ZIP (el ZIP debe contener `posta-woocommerce/posta-woocommerce.php` en la raíz).
2. En WordPress: **Plugins → Añadir nuevo → Subir plugin**.
3. Activá **Posta para WooCommerce** (requiere WooCommerce).
4. Andá a **WooCommerce → Posta**.
5. Ingresá tu usuario/email y contraseña de vendedor en Posta → **Conectar tienda**.

La tienda debe estar en **HTTPS**.

## Qué hace al conectar

1. Login en la API de Posta (`POST /api/auth/login`).
2. Verifica que el rol sea `store_admin`.
3. Crea una API key WooCommerce `read_write` (necesaria para webhooks).
4. Llama a `POST /api/integrations/woocommerce/connect` con la URL de la tienda y las claves.
5. Posta registra los webhooks `order.created` / `order.updated`.

## Desconexión

En **WooCommerce → Posta → Desconectar**:

- Elimina la integración en Posta.
- Revoca la API key local.

Al **desinstalar** el plugin también se borran opciones y claves Posta.

## Ajustes avanzados

Por defecto usa la API de producción:

`https://envios-erp.up.railway.app`

Podés cambiarla en “Ajustes avanzados” (útil en desarrollo local).

## Estructura

```
posta-woocommerce/
├── posta-woocommerce.php
├── uninstall.php
├── README.md
├── assets/css/admin.css
└── includes/
    ├── class-posta-plugin.php
    ├── class-posta-api-client.php
    ├── class-posta-api-keys.php
    ├── class-posta-connector.php
    └── class-posta-admin.php
```

## Requisitos

- WordPress 6.0+
- PHP 7.4+
- WooCommerce 7.0+
- Cuenta de vendedor en Posta con email verificado
