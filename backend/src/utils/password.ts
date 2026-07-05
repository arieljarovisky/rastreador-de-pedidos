export interface PasswordCheck {
  ok: boolean;
  errors: string[];
}

const MIN_LENGTH = 8;

/** Política para cuentas de agencia y administradores. */
export function validateStrongPassword(password: string): PasswordCheck {
  const errors: string[] = [];
  if (password.length < MIN_LENGTH) {
    errors.push(`Mínimo ${MIN_LENGTH} caracteres.`);
  }
  if (!/[a-záéíóúñ]/i.test(password)) {
    errors.push('Incluí al menos una letra.');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('Incluí al menos un número.');
  }
  return { ok: errors.length === 0, errors };
}

export function passwordStrengthScore(password: string): number {
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^a-zA-Z0-9]/.test(password)) score += 1;
  return Math.min(score, 4);
}

export function passwordStrengthLabel(score: number): { label: string; tone: 'weak' | 'fair' | 'good' | 'strong' } {
  if (score <= 1) return { label: 'Débil', tone: 'weak' };
  if (score === 2) return { label: 'Regular', tone: 'fair' };
  if (score === 3) return { label: 'Buena', tone: 'good' };
  return { label: 'Fuerte', tone: 'strong' };
}
