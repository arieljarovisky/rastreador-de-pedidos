# Posta para WooCommerce

Plugin que conecta WooCommerce con **Posta** en un minuto.

## Para el vendedor

1. En Posta → **Ajustes → Integraciones → WooCommerce**
2. Tocá **Descargar plugin** e instalalo en WordPress
3. Tocá **Generar código** y copialo
4. En WordPress: **WooCommerce → Posta**, pegá el código y **Conectar tienda**

No hace falta crear API keys ni pegar contraseñas.

## Requisitos

- WordPress 6.0+ / WooCommerce 7.0+ / PHP 7.4+
- Tienda en HTTPS
- Cuenta de vendedor en Posta

## Desarrollo

El código de emparejamiento lo genera `POST /api/integrations/woocommerce/pairing-code`.
El plugin lo canjea en `POST /api/integrations/woocommerce/plugin-connect`.
