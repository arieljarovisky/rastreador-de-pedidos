export const SELLER_MONTHLY_ORDER_BANDS = ['under_10', '10_50', '51_200', 'over_200'] as const;
export type SellerMonthlyOrders = (typeof SELLER_MONTHLY_ORDER_BANDS)[number];

/** Categorías típicas de Mercado Libre (Argentina). */
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

export function isValidMonthlyOrders(value: string): value is SellerMonthlyOrders {
  return (SELLER_MONTHLY_ORDER_BANDS as readonly string[]).includes(value);
}

export function normalizeSellerCategories(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const allowed = new Set<string>(ML_SELLER_CATEGORIES);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of raw) {
    const label = typeof item === 'string' ? item.trim() : '';
    if (!label || !allowed.has(label) || seen.has(label)) continue;
    seen.add(label);
    result.push(label);
  }
  return result;
}

export function validateSellerProfile(monthlyOrders: string, categories: string[]): void {
  if (!isValidMonthlyOrders(monthlyOrders)) {
    throw new Error('SELLER_ORDERS_INVALID');
  }
  if (categories.length === 0) {
    throw new Error('SELLER_CATEGORIES_REQUIRED');
  }
}
