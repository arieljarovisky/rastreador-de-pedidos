/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const SELLER_MONTHLY_ORDER_OPTIONS = [
  { value: 'under_10', label: 'Menos de 10 pedidos / mes' },
  { value: '10_50', label: 'Entre 10 y 50 pedidos / mes' },
  { value: '51_200', label: 'Entre 51 y 200 pedidos / mes' },
  { value: 'over_200', label: 'Más de 200 pedidos / mes' },
] as const;

export type SellerMonthlyOrders = (typeof SELLER_MONTHLY_ORDER_OPTIONS)[number]['value'];

export const ML_SELLER_CATEGORIES = [
  'Accesorios para Vehículos',
  'Alimentos y Bebidas',
  'Arte, Librería y Mercería',
  'Autos, Motos y Otros',
  'Bebés',
  'Belleza y Cuidado Personal',
  'Celulares y Teléfonos',
  'Computación',
  'Consolas y Videojuegos',
  'Construcción',
  'Cámaras y Accesorios',
  'Deportes y Fitness',
  'Electrodomésticos',
  'Electrónica, Audio y Video',
  'Herramientas',
  'Hogar, Muebles y Jardín',
  'Indumentaria y Accesorios',
  'Industrias y Oficinas',
  'Instrumentos Musicales',
  'Joyas y Relojes',
  'Juegos y Juguetes',
  'Libros, Revistas y Comics',
  'Mascotas',
  'Salud y Equipamiento Médico',
  'Souvenirs, Cotillón y Fiestas',
  'Otra categoría',
] as const;

export const AGENCY_REGISTER_STEPS = [
  { id: 1, label: 'Agencia', title: 'Datos de tu agencia' },
  { id: 2, label: 'Cobertura', title: 'Zonas y tarifas' },
  { id: 3, label: 'Acceso', title: 'Usuario y contraseña' },
] as const;

export const SELLER_REGISTER_STEPS = [
  { id: 1, label: 'Tienda', title: 'Datos de tu tienda' },
  { id: 2, label: 'Negocio', title: 'Volumen y categorías' },
  { id: 3, label: 'Acceso', title: 'Usuario y contraseña' },
] as const;
