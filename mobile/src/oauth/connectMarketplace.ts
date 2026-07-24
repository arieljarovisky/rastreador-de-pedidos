import { Alert } from 'react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { api } from '../api';
import { MarketplacePlatform } from '../types';
import { getOAuthRedirectUri } from './redirectUri';

WebBrowser.maybeCompleteAuthSession();

export type OAuthResult = 'connected' | 'cancelled' | 'error';

export const PLATFORM_LABELS: Record<MarketplacePlatform, string> = {
  mercadolibre: 'Mercado Libre',
  tiendanube: 'Tienda Nube',
  shopify: 'Shopify',
  woocommerce: 'WooCommerce',
};

export function oauthErrorMessage(platform: MarketplacePlatform, message?: string): string {
  if (message) return message;
  return `No se pudo conectar ${PLATFORM_LABELS[platform]}.`;
}

function promptShopDomain(): Promise<string | null> {
  return new Promise((resolve) => {
    const prompt = (Alert as { prompt?: typeof Alert.prompt }).prompt;
    if (typeof prompt !== 'function') {
      resolve(null);
      return;
    }
    prompt(
      'Shopify',
      'Dominio de la tienda (ej. mi-tienda.myshopify.com)',
      [
        { text: 'Cancelar', style: 'cancel', onPress: () => resolve(null) },
        {
          text: 'Continuar',
          onPress: (value?: string) => resolve(value?.trim() ? value.trim() : null),
        },
      ],
      'plain-text'
    );
  });
}

async function openMarketplaceAuthSession(
  token: string,
  platform: MarketplacePlatform,
  options?: { shop?: string }
): Promise<{ result: OAuthResult; message?: string }> {
  const redirectUri = getOAuthRedirectUri();
  const { url } = await api.getIntegrationConnectUrl(
    token,
    platform,
    'mobile',
    redirectUri,
    options?.shop ? { shop: options.shop } : undefined
  );

  const session = await WebBrowser.openAuthSessionAsync(url, redirectUri);

  if (session.type === 'cancel' || session.type === 'dismiss') {
    return { result: 'cancelled' };
  }

  if (session.type !== 'success' || !session.url) {
    return {
      result: 'error',
      message:
        'No se pudo volver a la app después de autorizar. Verificá que tenés la última versión de Posta instalada.',
    };
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

/** Conecta Shopify vía OAuth. Requiere el dominio de la tienda. */
export async function connectShopify(
  token: string,
  shop: string
): Promise<{ result: OAuthResult; message?: string }> {
  const trimmed = shop.trim();
  if (!trimmed) {
    return {
      result: 'error',
      message: 'Indicá el dominio de la tienda (ej. mi-tienda.myshopify.com).',
    };
  }
  return openMarketplaceAuthSession(token, 'shopify', { shop: trimmed });
}

export async function connectMarketplace(
  token: string,
  platform: MarketplacePlatform,
  options?: { shop?: string }
): Promise<{ result: OAuthResult; message?: string }> {
  if (platform === 'woocommerce') {
    return {
      result: 'error',
      message: 'WooCommerce se conecta con URL y claves de la API, no con OAuth.',
    };
  }

  if (platform === 'shopify') {
    let shop = options?.shop?.trim();
    if (!shop) {
      shop = (await promptShopDomain()) ?? undefined;
    }
    if (!shop) {
      return {
        result: 'error',
        message: 'Indicá el dominio de la tienda (ej. mi-tienda.myshopify.com).',
      };
    }
    return connectShopify(token, shop);
  }

  return openMarketplaceAuthSession(token, platform);
}
