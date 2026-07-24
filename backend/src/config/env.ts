import dotenv from 'dotenv';

dotenv.config();

function firstDefined(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => value !== undefined && value !== '');
}

function parseOrigins(...sources: Array<string | undefined>): string[] {
  const origins = new Set<string>();
  for (const source of sources) {
    if (!source) continue;
    for (const part of source.split(',')) {
      const origin = part.trim();
      if (origin) origins.add(origin);
    }
  }
  return [...origins];
}

function resolvePublicUrl(): string {
  const explicit = firstDefined(process.env.PUBLIC_URL, process.env.BACKEND_URL);
  if (explicit) return explicit.replace(/\/$/, '');

  const railwayStatic = process.env.RAILWAY_STATIC_URL?.trim();
  if (railwayStatic) return railwayStatic.replace(/\/$/, '');

  const railwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
  if (railwayDomain) {
    const host = railwayDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
    return `https://${host}`;
  }

  return 'http://localhost:4000';
}

export const env = {
  port: Number(process.env.PORT) || 4000,
  db: {
    host: firstDefined(process.env.DB_HOST, process.env.MYSQLHOST, process.env.MYSQL_HOST) || 'localhost',
    port: Number(firstDefined(process.env.DB_PORT, process.env.MYSQLPORT, process.env.MYSQL_PORT) || '3306'),
    user: firstDefined(process.env.DB_USER, process.env.MYSQLUSER, process.env.MYSQL_USER) || 'root',
    password: firstDefined(process.env.DB_PASSWORD, process.env.MYSQLPASSWORD, process.env.MYSQL_PASSWORD) || '',
    database: firstDefined(process.env.DB_NAME, process.env.MYSQLDATABASE, process.env.MYSQL_DATABASE) || 'lupo_tracking',
  },
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  corsOrigins: parseOrigins(
    'http://localhost:5173',
    'https://rastreador-de-pedidos-seven.vercel.app',
    'https://www.enviosposta.com.ar',
    'https://enviosposta.com.ar',
    process.env.CORS_ORIGIN,
    process.env.FRONTEND_URL
  ),
  publicUrl: resolvePublicUrl(),
  frontendUrl: (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, ''),
  mail: {
    resendApiKey: process.env.RESEND_API_KEY?.trim() || '',
    from:
      process.env.MAIL_FROM?.trim() ||
      'Posta <noreply@enviosposta.com.ar>',
  },
  mercadolibre: {
    appId: process.env.ML_APP_ID?.trim() || '',
    appSecret: process.env.ML_APP_SECRET?.trim() || '',
    /** Token del dueño de la app ML; solo él puede usar missed_feeds. Opcional. */
    appOwnerAccessToken: process.env.ML_APP_OWNER_ACCESS_TOKEN?.trim() || '',
    siteId: (process.env.ML_SITE_ID?.trim() || 'MLA').toUpperCase(),
    redirectUri:
      process.env.ML_REDIRECT_URI?.trim() ||
      `${resolvePublicUrl()}/api/integrations/mercadolibre/callback`,
  },
  tiendanube: {
    appId: process.env.TN_APP_ID?.trim() || process.env.TIENDANUBE_APP_ID?.trim() || '',
    appSecret: process.env.TN_APP_SECRET?.trim() || process.env.TIENDANUBE_APP_SECRET?.trim() || '',
    redirectUri:
      process.env.TN_REDIRECT_URI?.trim() ||
      `${resolvePublicUrl()}/api/integrations/tiendanube/callback`,
  },
  shopify: {
    apiKey: process.env.SHOPIFY_API_KEY?.trim() || '',
    apiSecret: process.env.SHOPIFY_API_SECRET?.trim() || '',
    apiVersion: process.env.SHOPIFY_API_VERSION?.trim() || '2026-07',
    scopes: process.env.SHOPIFY_SCOPES?.trim() || 'read_orders',
    redirectUri:
      process.env.SHOPIFY_REDIRECT_URI?.trim() ||
      `${resolvePublicUrl()}/api/integrations/shopify/callback`,
  },
  mobileApp: {
    scheme: (process.env.MOBILE_APP_SCHEME?.trim() || 'lupo').replace(/:\/\//, ''),
    version: process.env.MOBILE_APP_VERSION?.trim() || '1.0.0',
    minVersion:
      process.env.MOBILE_APP_MIN_VERSION?.trim() ||
      process.env.MOBILE_APP_VERSION?.trim() ||
      '1.0.0',
  },
  mercadopago: {
    clientId: process.env.MP_CLIENT_ID?.trim() || '',
    clientSecret: process.env.MP_CLIENT_SECRET?.trim() || '',
    redirectUri:
      process.env.MP_REDIRECT_URI?.trim() ||
      `${resolvePublicUrl()}/api/mercadopago/oauth/callback`,
    /** Token de la cuenta Posta para cobrar suscripciones a agencias */
    postaAccessToken: process.env.POSTA_MP_ACCESS_TOKEN?.trim() || '',
    webhookSecret: process.env.MP_WEBHOOK_SECRET?.trim() || '',
    trialDays: Number(process.env.SUBSCRIPTION_TRIAL_DAYS || '14') || 14,
  },
  googleCalendar: {
    calendarId: process.env.GOOGLE_CALENDAR_ID?.trim() || '',
    timezone: process.env.DEMO_TIMEZONE?.trim() || 'America/Argentina/Buenos_Aires',
    slotDurationMinutes: Number(process.env.DEMO_SLOT_MINUTES || '30') || 30,
    workdayStartHour: Number(process.env.DEMO_WORKDAY_START || '9') || 9,
    workdayEndHour: Number(process.env.DEMO_WORKDAY_END || '18') || 18,
    bookingDaysAhead: Number(process.env.DEMO_BOOKING_DAYS_AHEAD || '14') || 14,
    serviceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() || '',
    serviceAccountPrivateKey: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.trim() || '',
    clientId: process.env.GOOGLE_CLIENT_ID?.trim() || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET?.trim() || '',
    refreshToken: process.env.GOOGLE_CALENDAR_REFRESH_TOKEN?.trim() || '',
  },
  /** Sign-In with Google (GIS). Reusa GOOGLE_CLIENT_ID del cliente Web. */
  googleAuth: {
    clientId: process.env.GOOGLE_CLIENT_ID?.trim() || '',
  },
};
