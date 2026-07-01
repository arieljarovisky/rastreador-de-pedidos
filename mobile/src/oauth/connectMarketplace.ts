import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { api } from '../api';
import { MarketplacePlatform } from '../types';

WebBrowser.maybeCompleteAuthSession();

export const OAUTH_REDIRECT_URI = Linking.createURL('oauth/callback');

export type OAuthResult = 'connected' | 'cancelled' | 'error';

const PLATFORM_LABELS: Record<MarketplacePlatform, string> = {
  mercadolibre: 'Mercado Libre',
  tiendanube: 'Tienda Nube',
};

export function oauthErrorMessage(platform: MarketplacePlatform, message?: string): string {
  if (message) return message;
  return `No se pudo conectar ${PLATFORM_LABELS[platform]}.`;
}

export async function connectMarketplace(
  token: string,
  platform: MarketplacePlatform
): Promise<{ result: OAuthResult; message?: string }> {
  const { url } = await api.getIntegrationConnectUrl(token, platform, 'mobile');

  const session = await WebBrowser.openAuthSessionAsync(url, OAUTH_REDIRECT_URI);

  if (session.type === 'cancel' || session.type === 'dismiss') {
    return { result: 'cancelled' };
  }

  if (session.type !== 'success' || !session.url) {
    return { result: 'error' };
  }

  const parsed = Linking.parse(session.url);
  const status = parsed.queryParams?.status;
  const message =
    typeof parsed.queryParams?.message === 'string' ? parsed.queryParams.message : undefined;

  if (status === 'connected') {
    return { result: 'connected' };
  }

  return { result: 'error', message };
}
