/** Normaliza CUIT argentino a 11 dígitos o null si el formato es inválido. */
export function normalizeCuit(value: string): string | null {
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 11) return null;
  return digits;
}

export function formatCuit(digits: string): string {
  if (digits.length !== 11) return digits;
  return `${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits.slice(10)}`;
}

/** Validación básica de CUIT (formato + dígito verificador). */
export function isValidCuit(value: string): boolean {
  const digits = normalizeCuit(value);
  if (!digits) return false;

  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 10; i += 1) {
    sum += Number(digits[i]) * weights[i]!;
  }
  const mod = sum % 11;
  const check = mod === 0 ? 0 : mod === 1 ? 9 : 11 - mod;
  return check === Number(digits[10]);
}
