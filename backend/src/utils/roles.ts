import { UserRole } from '../types/index.js';

/** Dueño de la agencia (registro público) o admin de logística delegado */
export function isAgencyAdmin(role: UserRole): boolean {
  return role === UserRole.SUPER_ADMIN || role === UserRole.LOGISTICS_ADMIN;
}

export const AGENCY_ADMIN_ROLES: UserRole[] = [UserRole.SUPER_ADMIN, UserRole.LOGISTICS_ADMIN];
