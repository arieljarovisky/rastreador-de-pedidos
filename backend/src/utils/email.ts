/** Validación práctica de email para usernames de repartidor. */
export function isValidEmail(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < 5 || trimmed.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}
