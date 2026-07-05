/** Cuenta creada / vinculada por OAuth de inicio de sesión ML (username ml{userId}). */
export function isMercadoLibreLoginAccount(user: { username: string }): boolean {
  return /^ml[0-9]+$/i.test(user.username.trim());
}
