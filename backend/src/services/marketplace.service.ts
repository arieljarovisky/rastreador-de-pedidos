import { getAgencyById, listMarketplaceAgencies } from './agencies.service.js';
import { getUserById } from './users.service.js';
import type { AgencyShippingService, MarketplaceAgency, User } from '../types/index.js';
import { UserRole } from '../types/index.js';

export function isMarketplaceSeller(user: User): boolean {
  return user.role === UserRole.STORE_ADMIN && !user.agencyId;
}

export async function resolveAgencyIdForSeller(
  seller: User,
  agencyId?: string | null
): Promise<string> {
  if (seller.agencyId) {
    return seller.agencyId;
  }
  const resolved = agencyId ?? seller.preferredAgencyId ?? null;
  if (!resolved) {
    throw new Error('AGENCY_REQUIRED');
  }
  const agency = await getAgencyById(resolved);
  if (!agency) {
    throw new Error('AGENCY_NOT_FOUND');
  }
  return resolved;
}

export async function listAgenciesForSeller(
  filters?: { province?: string; serviceType?: AgencyShippingService['type'] }
): Promise<MarketplaceAgency[]> {
  return listMarketplaceAgencies(filters);
}

export async function getAgencyPublicProfile(agencyId: string): Promise<MarketplaceAgency | null> {
  const agency = await getAgencyById(agencyId);
  if (!agency) return null;
  return {
    id: agency.id,
    name: agency.name,
    city: agency.city,
    province: agency.province,
    website: agency.website,
    instagram: agency.instagram,
    shippingServices: agency.shippingServices,
    departurePoint: agency.departurePoint,
  };
}

export async function updateSellerPreferredAgency(
  sellerId: string,
  agencyId: string
): Promise<User> {
  const seller = await getUserById(sellerId);
  if (!seller || seller.role !== UserRole.STORE_ADMIN) {
    throw new Error('NOT_FOUND');
  }
  if (seller.agencyId) {
    throw new Error('NOT_MARKETPLACE_SELLER');
  }
  const agency = await getAgencyById(agencyId);
  if (!agency) {
    throw new Error('AGENCY_NOT_FOUND');
  }

  const { pool } = await import('../config/database.js');
  await pool.query('UPDATE users SET preferred_agency_id = ? WHERE id = ?', [agencyId, sellerId]);

  const updated = await getUserById(sellerId);
  if (!updated) throw new Error('NOT_FOUND');
  return updated;
}
