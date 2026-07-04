import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { authenticate, signToken } from '../middleware/auth.js';
import { findUserByUsername, createUser, getUserById } from '../services/users.service.js';
import { createAgency } from '../services/agencies.service.js';
import { normalizeCoverageAreas, validateCoverageAreas } from '../services/coverage-areas.service.js';
import {
  normalizeSellerCategories,
  validateSellerProfile,
  type SellerMonthlyOrders,
} from '../config/seller-profile.js';
import { listBarrios } from '../config/barrios.js';
import { listMlFlexZones, ML_FLEX_CORDON_LABELS, ML_FLEX_CORDON_ORDER } from '../config/ml-flex-zones.js';
import { UserRole } from '../types/index.js';
import { env } from '../config/env.js';
import {
  getMercadoLibreLoginAuthUrl,
  isMercadoLibreLoginConfigured,
} from '../services/mercadolibre.service.js';
import { loginOrRegisterWithMercadoLibre } from '../services/mercadolibre-auth.service.js';

const router = Router();

interface MercadoLibreLoginStatePayload {
  purpose: 'login';
  platform?: 'web' | 'mobile';
}

type MercadoLibreLoginPlatform = 'web' | 'mobile';

function signMercadoLibreLoginState(platform: MercadoLibreLoginPlatform = 'web'): string {
  return jwt.sign({ purpose: 'login', platform } satisfies MercadoLibreLoginStatePayload, env.jwtSecret, {
    expiresIn: '15m',
  });
}

function verifyMercadoLibreLoginState(state: string): MercadoLibreLoginStatePayload {
  const payload = jwt.verify(state, env.jwtSecret) as MercadoLibreLoginStatePayload;
  if (payload.purpose !== 'login') throw new Error('INVALID_STATE');
  return payload;
}

function redirectToFrontendLoginSuccess(token: string): string {
  const params = new URLSearchParams({ ml_login: 'success', token });
  return `${env.frontendUrl}/app?${params}`;
}

function redirectToFrontendLoginError(message: string): string {
  const params = new URLSearchParams({ ml_login: 'error', message });
  return `${env.frontendUrl}/app?${params}`;
}

function redirectToMobileLoginSuccess(token: string): string {
  const params = new URLSearchParams({ ml_login: 'success', token });
  return `lupo://auth/mercadolibre?${params}`;
}

function redirectToMobileLoginError(message: string): string {
  const params = new URLSearchParams({ ml_login: 'error', message });
  return `lupo://auth/mercadolibre?${params}`;
}

function redirectLoginSuccess(platform: MercadoLibreLoginPlatform, token: string): string {
  return platform === 'mobile' ? redirectToMobileLoginSuccess(token) : redirectToFrontendLoginSuccess(token);
}

function redirectLoginError(platform: MercadoLibreLoginPlatform, message: string): string {
  return platform === 'mobile' ? redirectToMobileLoginError(message) : redirectToFrontendLoginError(message);
}

function mercadoLibreLoginErrorMessage(err: unknown): string {
  const code = err instanceof Error ? err.message : '';
  if (code === 'ML_TOKEN_FAILED') {
    return 'Mercado Libre rechazó la autorización. Intentá de nuevo.';
  }
  if (code === 'ML_USER_MISSING') {
    return 'No se pudo obtener tu cuenta de Mercado Libre.';
  }
  if (code === 'USERNAME_TAKEN') {
    return 'Ya existe una cuenta vinculada a ese usuario de Mercado Libre.';
  }
  return 'No se pudo iniciar sesión con Mercado Libre.';
}

router.get('/barrios', (_req: Request, res: Response) => {
  res.json({
    barrios: listBarrios(),
    mlZones: listMlFlexZones(),
    cordonLabels: ML_FLEX_CORDON_LABELS,
    cordonOrder: ML_FLEX_CORDON_ORDER,
  });
});

function userResponse(user: Awaited<ReturnType<typeof getUserById>>) {
  if (!user) return null;
  return user;
}

function handleRegisterError(res: Response, err: unknown): boolean {
  const message = err instanceof Error ? err.message : '';
  if (message === 'USERNAME_TAKEN') {
    res.status(409).json({ error: 'Ese nombre de usuario ya está en uso.' });
    return true;
  }
  if (message === 'USERNAME_SHORT') {
    res.status(400).json({ error: 'El usuario debe tener al menos 3 caracteres.' });
    return true;
  }
  if (message === 'PASSWORD_SHORT') {
    res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
    return true;
  }
  if (message === 'NAME_REQUIRED') {
    res.status(400).json({ error: 'El nombre es obligatorio.' });
    return true;
  }
  if (message === 'COVERAGE_REQUIRED') {
    res.status(400).json({ error: 'Debés cargar al menos una zona de cobertura con tarifa.' });
    return true;
  }
  if (message === 'COVERAGE_NAME_REQUIRED') {
    res.status(400).json({ error: 'Cada zona debe tener un nombre.' });
    return true;
  }
  if (message === 'COVERAGE_PLACES_REQUIRED' || message === 'COVERAGE_BARRIOS_REQUIRED') {
    res.status(400).json({ error: 'Seleccioná al menos un barrio por cada zona de cobertura.' });
    return true;
  }
  if (message === 'COVERAGE_TARIFF_INVALID') {
    res.status(400).json({ error: 'La tarifa de cada zona debe ser un número válido mayor o igual a 0.' });
    return true;
  }
  if (message === 'COVERAGE_MIN_ORDERS_INVALID') {
    res.status(400).json({ error: 'El pedido mínimo debe ser un entero mayor o igual a 1.' });
    return true;
  }
  if (message === 'SELLER_ORDERS_INVALID') {
    res.status(400).json({ error: 'Seleccioná cuántos pedidos enviás por mes.' });
    return true;
  }
  if (message === 'SELLER_CATEGORIES_REQUIRED') {
    res.status(400).json({ error: 'Seleccioná al menos una categoría de Mercado Libre.' });
    return true;
  }
  return false;
}

router.post('/login', async (req: Request, res: Response) => {
  const { username, password } = req.body;
  if (!username || !password) {
    res.status(400).json({ error: 'Usuario y contraseña son requeridos.' });
    return;
  }

  const row = await findUserByUsername(username);
  if (!row) {
    res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
    return;
  }

  const valid = await bcrypt.compare(password, row.password_hash);
  if (!valid) {
    res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
    return;
  }

  const user = await getUserById(row.id);
  if (!user) {
    res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
    return;
  }

  const token = signToken(user.id, user.role);
  res.json({ user, token });
});

router.post('/register/agency', async (req: Request, res: Response) => {
  const { username, password, name, city, province, coverageAreas: coverageAreasRaw } = req.body;
  if (!username || !password || !name) {
    res.status(400).json({ error: 'Usuario, contraseña y nombre de la agencia son requeridos.' });
    return;
  }

  const coverageAreas = normalizeCoverageAreas(coverageAreasRaw);
  try {
    validateCoverageAreas(coverageAreas);
  } catch (err) {
    if (handleRegisterError(res, err)) return;
    throw err;
  }

  try {
    const agency = await createAgency({
      name: name.trim(),
      city: city?.trim(),
      province: province?.trim(),
      coverageAreas,
    });
    const user = await createUser({
      username,
      password,
      name,
      role: UserRole.SUPER_ADMIN,
      agencyId: agency.id,
      city: city?.trim(),
      province: province?.trim(),
    });
    const fullUser = await getUserById(user.id);
    const token = signToken(user.id, user.role);
    res.status(201).json({ user: fullUser ?? user, token });
  } catch (err) {
    if (handleRegisterError(res, err)) return;
    throw err;
  }
});

router.post('/register/seller', async (req: Request, res: Response) => {
  const { username, password, name, city, province, monthlyOrders, sellerCategories: categoriesRaw } = req.body;
  if (!username || !password || !name) {
    res.status(400).json({ error: 'Usuario, contraseña y nombre del vendedor son requeridos.' });
    return;
  }

  const sellerCategories = normalizeSellerCategories(categoriesRaw);
  try {
    validateSellerProfile(String(monthlyOrders ?? ''), sellerCategories);
  } catch (err) {
    if (handleRegisterError(res, err)) return;
    throw err;
  }

  try {
    const user = await createUser({
      username,
      password,
      name: name.trim(),
      role: UserRole.STORE_ADMIN,
      marketplaceSeller: true,
      city: city?.trim(),
      province: province?.trim(),
      monthlyOrders: monthlyOrders as SellerMonthlyOrders,
      sellerCategories,
    });
    const fullUser = await getUserById(user.id);
    const token = signToken(user.id, user.role);
    res.status(201).json({ user: fullUser ?? user, token });
  } catch (err) {
    if (handleRegisterError(res, err)) return;
    throw err;
  }
});

router.get('/me', authenticate, (req: Request, res: Response) => {
  res.json(req.user);
});

router.get('/mercadolibre/status', (_req: Request, res: Response) => {
  res.json({ configured: isMercadoLibreLoginConfigured() });
});

router.get('/mercadolibre/connect', (req: Request, res: Response) => {
  if (!isMercadoLibreLoginConfigured()) {
    res.status(503).json({ error: 'Mercado Libre OAuth no está configurado en el servidor.' });
    return;
  }
  const platform: MercadoLibreLoginPlatform = req.query.platform === 'mobile' ? 'mobile' : 'web';
  const state = signMercadoLibreLoginState(platform);
  res.json({ url: getMercadoLibreLoginAuthUrl(state) });
});

router.get('/mercadolibre/callback', async (req: Request, res: Response) => {
  const { code, state, error: oauthError } = req.query;

  if (oauthError) {
    res.redirect(redirectToFrontendLoginError(String(oauthError)));
    return;
  }

  if (!code || typeof code !== 'string' || !state || typeof state !== 'string') {
    res.redirect(redirectToFrontendLoginError('Parámetros de autorización incompletos.'));
    return;
  }

  let platform: MercadoLibreLoginPlatform = 'web';
  try {
    platform = verifyMercadoLibreLoginState(state).platform === 'mobile' ? 'mobile' : 'web';
  } catch {
    res.redirect(redirectToFrontendLoginError('La sesión de autorización expiró. Intentá de nuevo.'));
    return;
  }

  try {
    const result = await loginOrRegisterWithMercadoLibre(code);
    res.redirect(redirectLoginSuccess(platform, result.token));
  } catch (err) {
    console.error('[auth/mercadolibre/callback]', err);
    res.redirect(redirectLoginError(platform, mercadoLibreLoginErrorMessage(err)));
  }
});

export default router;
