export const SELLER_MONTHLY_ORDER_OPTIONS = [
  { value: 'under_10', label: 'Menos de 10 / mes' },
  { value: '10_50', label: '10 a 50 / mes' },
  { value: '51_200', label: '51 a 200 / mes' },
  { value: 'over_200', label: 'Más de 200 / mes' },
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

export const SELLER_REGISTER_STEPS = ['Tienda', 'Negocio', 'Acceso'] as const;
