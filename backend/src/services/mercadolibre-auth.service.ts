import { randomBytes } from 'crypto';
import { env } from '../config/env.js';
import { signToken } from '../middleware/auth.js';
import { UserRole, type User } from '../types/index.js';
import {
  findMercadoLibreIntegrationByMlUserId,
  upsertIntegration,
} from './integrations.service.js';
import { exchangeMercadoLibreOAuthCode } from './mercadolibre.service.js';
import { createUser, getUserById } from './users.service.js';

export interface MercadoLibreLoginResult {
  user: User;
  token: string;
  isNewUser: boolean;
}

function randomPassword(): string {
  return randomBytes(24).toString('base64url');
}

export async function loginOrRegisterWithMercadoLibre(code: string): Promise<MercadoLibreLoginResult> {
  const oauth = await exchangeMercadoLibreOAuthCode(code, env.mercadolibre.loginRedirectUri);

  if (!oauth.mlUserId) {
    throw new Error('ML_USER_MISSING');
  }

  const existingIntegration = await findMercadoLibreIntegrationByMlUserId(oauth.mlUserId);
  let user: User | null = null;
  let isNewUser = false;

  if (existingIntegration) {
    user = await getUserById(existingIntegration.userId);
    if (!user) {
      throw new Error('USER_NOT_FOUND');
    }
  } else {
    isNewUser = true;
    const username = `ml${oauth.mlUserId}`;
    const displayName = oauth.nickname.trim() || `Vendedor ML ${oauth.mlUserId}`;
    user = await createUser({
      username,
      password: randomPassword(),
      name: displayName,
      role: UserRole.STORE_ADMIN,
      marketplaceSeller: true,
    });
  }

  await upsertIntegration({
    userId: user.id,
    platform: 'mercadolibre',
    externalUserId: oauth.mlUserId,
    accessToken: oauth.accessToken,
    refreshToken: oauth.refreshToken,
    tokenExpiresAt: oauth.expiresAt,
    metadata: { nickname: oauth.nickname },
  });

  const fullUser = (await getUserById(user.id)) ?? user;
  const token = signToken(fullUser.id, fullUser.role);

  return { user: fullUser, token, isNewUser };
}
