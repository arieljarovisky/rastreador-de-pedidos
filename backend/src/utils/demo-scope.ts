const LEGACY_DEMO_USER_IDS = new Set([
  'u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7', 'u8', 'u9', 'u10', 'u11', 'u12', 'u13',
]);

/** La demo comercial usa estos usuarios. El resto de las cuentas no ve pedidos DEMO-. */
export function userSeesDemoOrders(user: { id: string }): boolean {
  return user.id.startsWith('demo_') || LEGACY_DEMO_USER_IDS.has(user.id);
}

export function excludeDemoOrdersSql(user: { id: string }): string {
  return userSeesDemoOrders(user) ? '' : " AND o.id NOT LIKE 'DEMO-%'";
}
