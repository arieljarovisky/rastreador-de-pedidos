/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import {
  Shield,
  Key,
  Eye,
  EyeOff,
  Lock,
  Mail,
  Building2,
  ArrowLeft,
  User as UserIcon,
  Phone,
  MapPin,
  FileText,
  ChevronRight,
  Navigation,
  Route,
  Globe,
} from 'lucide-react';
import PostaLogo from './ui/PostaLogo.tsx';
import PostaButton from './ui/PostaButton.tsx';
import { isValidEmail } from '../utils/email.ts';
import { formatCuitInput, isValidCuit } from '../utils/cuit.ts';
import {
  isValidPhone,
  normalizePhone,
  passwordStrengthLabel,
  passwordStrengthScore,
  validateStrongPassword,
} from '../utils/password.ts';

type AuthMode = 'login' | 'register-agency';
type RegisterStep = 1 | 2;

export interface AgencyRegisterData {
  agencyName: string;
  adminName: string;
  email: string;
  password: string;
  phone: string;
  cuit: string;
  city: string;
  acceptTerms: boolean;
}

interface LoginScreenProps {
  onLogin: (username: string, password: string) => Promise<void>;
  onRegisterAgency: (data: AgencyRegisterData) => Promise<void>;
  loading: boolean;
  error: string | null;
}

const FEATURES = [
  { icon: Navigation, text: 'Seguimiento GPS en vivo de cada repartidor' },
  { icon: Route, text: 'Rutas, pedidos y asignaciones en un solo lugar' },
  { icon: Globe, text: 'Cobertura en CABA, GBA y marketplace nacional' },
] as const;

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="auth-field">
      <label className="auth-field__label">{label}</label>
      {children}
    </div>
  );
}

function IconInput({
  icon: Icon,
  className = '',
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="auth-field__wrap">
      <span className="auth-field__icon" aria-hidden="true">
        <Icon className="h-4 w-4" />
      </span>
      <input {...props} className={`auth-input auth-input--icon ${className}`.trim()} />
    </div>
  );
}

export default function LoginScreen({
  onLogin,
  onRegisterAgency,
  loading,
  error,
}: LoginScreenProps) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [registerStep, setRegisterStep] = useState<RegisterStep>(1);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [agencyName, setAgencyName] = useState('');
  const [adminName, setAdminName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [cuit, setCuit] = useState('');
  const [city, setCity] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const resetForm = () => {
    setUsername('');
    setPassword('');
    setAgencyName('');
    setAdminName('');
    setEmail('');
    setPhone('');
    setCuit('');
    setCity('');
    setPasswordConfirm('');
    setAcceptTerms(false);
    setRegisterStep(1);
    setLocalError(null);
  };

  const switchMode = (next: AuthMode) => {
    setMode(next);
    resetForm();
  };

  const passwordScore = useMemo(() => passwordStrengthScore(password), [password]);
  const passwordMeta = useMemo(() => passwordStrengthLabel(passwordScore), [passwordScore]);

  const strengthBarClass = {
    weak: 'auth-strength__bar--weak',
    fair: 'auth-strength__bar--fair',
    good: 'auth-strength__bar--good',
    strong: 'auth-strength__bar--strong',
  }[passwordMeta.tone];

  const validateStep1 = (): string | null => {
    if (!agencyName.trim()) return 'Ingresá el nombre comercial de la agencia.';
    if (!isValidCuit(cuit)) return 'El CUIT ingresado no es válido.';
    if (!isValidPhone(phone)) return 'Ingresá un teléfono válido (mínimo 8 dígitos).';
    if (!city.trim()) return 'Indicá la ciudad o zona de operación.';
    return null;
  };

  const goToStep2 = () => {
    setLocalError(null);
    const err = validateStep1();
    if (err) {
      setLocalError(err);
      return;
    }
    setRegisterStep(2);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (mode === 'login') {
      if (!username.trim() || !password) {
        setLocalError('Completá usuario y contraseña.');
        return;
      }
      onLogin(username.trim(), password);
      return;
    }

    if (registerStep === 1) {
      goToStep2();
      return;
    }

    if (!adminName.trim() || !email.trim() || !password || !passwordConfirm) {
      setLocalError('Completá los datos del administrador.');
      return;
    }

    if (!isValidEmail(email.trim())) {
      setLocalError('Ingresá un correo electrónico válido.');
      return;
    }

    const pwdCheck = validateStrongPassword(password);
    if (!pwdCheck.ok) {
      setLocalError(pwdCheck.errors.join(' '));
      return;
    }

    if (password !== passwordConfirm) {
      setLocalError('Las contraseñas no coinciden.');
      return;
    }

    if (!acceptTerms) {
      setLocalError('Debés aceptar la política de privacidad.');
      return;
    }

    onRegisterAgency({
      agencyName: agencyName.trim(),
      adminName: adminName.trim(),
      email: email.trim().toLowerCase(),
      password,
      phone: normalizePhone(phone),
      cuit,
      city: city.trim(),
      acceptTerms: true,
    });
  };

  const isRegister = mode === 'register-agency';
  const displayError = localError || error;
  const step1Ready = agencyName.trim() && cuit && phone && city.trim();
  const step2Ready =
    adminName.trim() && email.trim() && password && passwordConfirm && acceptTerms;

  const brandTitle = isRegister
    ? registerStep === 1
      ? 'Registrar agencia'
      : 'Cuenta del responsable'
    : 'Iniciar sesión';

  const brandSubtitle = isRegister
    ? registerStep === 1
      ? 'Completá los datos de tu empresa de logística para operar en Posta.'
      : 'Creá la cuenta del administrador que gestionará la flota y los envíos.'
    : 'Agencias y repartidores: ingresá con tus credenciales para gestionar envíos en tiempo real.';

  return (
    <div className="auth-split" id="login-container">
      <aside className="auth-split__brand">
        <div className="auth-split__brand-grid" aria-hidden="true" />
        <div className="auth-split__brand-inner">
          <PostaLogo variant="dark" size={36} showWordmark className="auth-split__logo" />

          <p className="auth-split__eyebrow">Panel operativo</p>
          <h1 className="auth-split__title">{brandTitle}</h1>
          <p className="auth-split__lead">{brandSubtitle}</p>

          <ul className="auth-split__features">
            {FEATURES.map(({ icon: Icon, text }) => (
              <li key={text}>
                <span className="auth-split__feature-icon">
                  <Icon className="h-4 w-4" />
                </span>
                <span>{text}</span>
              </li>
            ))}
          </ul>

          <footer className="auth-split__footer">
            <p className="auth-split__market">Marketplace de envíos · Argentina</p>
            <a href="/" className="auth-split__home">
              <ArrowLeft className="h-3.5 w-3.5" />
              Volver al inicio
            </a>
          </footer>
        </div>
      </aside>

      <main className="auth-split__panel">
        <div className="auth-split__mobile-brand lg:hidden">
          <PostaLogo variant="dark" size={32} showWordmark />
          <p className="auth-split__eyebrow auth-split__eyebrow--mobile">Panel operativo</p>
          <h1 className="auth-split__title auth-split__title--mobile">{brandTitle}</h1>
        </div>

        <div className="auth-split__card">
          <div className="auth-split__tabs" role="tablist" aria-label="Tipo de acceso">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'login'}
              onClick={() => switchMode('login')}
              className={`auth-split__tab ${mode === 'login' ? 'auth-split__tab--active' : ''}`}
            >
              Ingresar
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'register-agency'}
              onClick={() => switchMode('register-agency')}
              className={`auth-split__tab ${mode === 'register-agency' ? 'auth-split__tab--active' : ''}`}
            >
              Agencia
            </button>
          </div>

          <div className="auth-split__card-head">
            <h2 className="auth-split__card-title">
              {mode === 'login' ? (
                <>
                  <Lock className="h-4 w-4 text-[var(--auth-accent)]" />
                  Iniciar sesión
                </>
              ) : (
                <>
                  <Building2 className="h-4 w-4 text-[var(--auth-accent)]" />
                  {registerStep === 1 ? 'Datos de la agencia' : 'Administrador'}
                </>
              )}
            </h2>
            <p className="auth-split__card-sub">
              {mode === 'login'
                ? 'Accedé al panel con tu usuario o correo.'
                : registerStep === 1
                  ? 'Paso 1 de 2'
                  : 'Paso 2 de 2 · Revisá y confirmá'}
            </p>
          </div>

          {isRegister && (
            <div className="auth-split__steps" aria-hidden="true">
              <span className={`auth-split__step ${registerStep >= 1 ? 'auth-split__step--on' : ''}`} />
              <span className={`auth-split__step-line ${registerStep >= 2 ? 'auth-split__step-line--on' : ''}`} />
              <span className={`auth-split__step ${registerStep >= 2 ? 'auth-split__step--on' : ''}`} />
            </div>
          )}

          {displayError && (
            <div className="auth-split__error" role="alert">
              <Shield className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{displayError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="auth-split__form" noValidate>
            {isRegister && registerStep === 1 && (
              <div className="auth-split__fields">
                <Field label="Nombre comercial">
                  <input
                    type="text"
                    disabled={loading}
                    value={agencyName}
                    onChange={(e) => setAgencyName(e.target.value)}
                    placeholder="Ej: Logística Rápida BA"
                    className="auth-input"
                    autoComplete="organization"
                  />
                </Field>
                <div className="auth-split__row">
                  <Field label="CUIT">
                    <IconInput
                      icon={FileText}
                      inputMode="numeric"
                      disabled={loading}
                      value={cuit}
                      onChange={(e) => setCuit(formatCuitInput(e.target.value))}
                      placeholder="20-12345678-9"
                    />
                  </Field>
                  <Field label="Teléfono">
                    <IconInput
                      icon={Phone}
                      type="tel"
                      disabled={loading}
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="11 1234-5678"
                      autoComplete="tel"
                    />
                  </Field>
                </div>
                <Field label="Ciudad / zona de operación">
                  <IconInput
                    icon={MapPin}
                    disabled={loading}
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Ej: CABA y GBA Norte"
                    autoComplete="address-level2"
                  />
                </Field>
              </div>
            )}

            {isRegister && registerStep === 2 && (
              <div className="auth-split__fields">
                <div className="auth-split__summary">
                  <p className="auth-split__summary-label">Agencia</p>
                  <p className="auth-split__summary-name">{agencyName}</p>
                  <p className="auth-split__summary-meta">
                    CUIT {cuit} · {city}
                  </p>
                </div>

                <Field label="Nombre del responsable">
                  <IconInput
                    icon={UserIcon}
                    disabled={loading}
                    value={adminName}
                    onChange={(e) => setAdminName(e.target.value)}
                    placeholder="Ej: María González"
                    autoComplete="name"
                  />
                </Field>
                <Field label="Correo (usuario de acceso)">
                  <IconInput
                    icon={Mail}
                    type="email"
                    disabled={loading}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@tuagencia.com.ar"
                    autoComplete="email"
                  />
                </Field>
                <Field label="Contraseña">
                  <div className="auth-field__wrap">
                    <span className="auth-field__icon" aria-hidden="true">
                      <Key className="h-4 w-4" />
                    </span>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      disabled={loading}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Mín. 8 caracteres, letra y número"
                      className="auth-input auth-input--icon auth-input--icon-right"
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="auth-field__toggle"
                      aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {password.length > 0 && (
                    <div className="auth-strength">
                      <div className="auth-strength__track">
                        {Array.from({ length: 4 }).map((_, i) => (
                          <span
                            key={i}
                            className={`auth-strength__bar ${
                              i < passwordScore ? strengthBarClass : ''
                            }`}
                          />
                        ))}
                      </div>
                      <p className="auth-strength__label">{passwordMeta.label}</p>
                    </div>
                  )}
                </Field>
                <Field label="Confirmar contraseña">
                  <div className="auth-field__wrap">
                    <span className="auth-field__icon" aria-hidden="true">
                      <Key className="h-4 w-4" />
                    </span>
                    <input
                      type={showPasswordConfirm ? 'text' : 'password'}
                      disabled={loading}
                      value={passwordConfirm}
                      onChange={(e) => setPasswordConfirm(e.target.value)}
                      placeholder="Repetí la contraseña"
                      className="auth-input auth-input--icon auth-input--icon-right"
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPasswordConfirm(!showPasswordConfirm)}
                      className="auth-field__toggle"
                      aria-label={showPasswordConfirm ? 'Ocultar confirmación' : 'Mostrar confirmación'}
                    >
                      {showPasswordConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </Field>
                <label className="auth-split__terms">
                  <input
                    type="checkbox"
                    checked={acceptTerms}
                    onChange={(e) => setAcceptTerms(e.target.checked)}
                    disabled={loading}
                  />
                  <span>
                    Acepto la{' '}
                    <a href="/privacidad" target="_blank" rel="noopener noreferrer">
                      política de privacidad
                    </a>
                  </span>
                </label>
              </div>
            )}

            {!isRegister && (
              <div className="auth-split__fields">
                <Field label="Usuario">
                  <IconInput
                    icon={UserIcon}
                    disabled={loading}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Correo o usuario"
                    autoComplete="username"
                  />
                </Field>
                <Field label="Contraseña">
                  <div className="auth-field__wrap">
                    <span className="auth-field__icon" aria-hidden="true">
                      <Key className="h-4 w-4" />
                    </span>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      disabled={loading}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="auth-input auth-input--icon auth-input--icon-right"
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="auth-field__toggle"
                      aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </Field>
              </div>
            )}

            <div className="auth-split__actions">
              {isRegister && registerStep === 2 && (
                <button
                  type="button"
                  className="auth-split__back"
                  disabled={loading}
                  onClick={() => {
                    setRegisterStep(1);
                    setLocalError(null);
                  }}
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Volver
                </button>
              )}

              <PostaButton
                type="submit"
                disabled={
                  loading ||
                  (isRegister
                    ? registerStep === 1
                      ? !step1Ready
                      : !step2Ready
                    : !username.trim() || !password)
                }
                id="btn-login-submit"
                className="auth-split__submit flex-1 min-w-0"
              >
                {loading ? (
                  'Procesando...'
                ) : isRegister ? (
                  registerStep === 1 ? (
                    <span className="inline-flex items-center justify-center gap-1.5">
                      Continuar
                      <ChevronRight className="h-4 w-4" />
                    </span>
                  ) : (
                    'Crear cuenta de agencia'
                  )
                ) : (
                  'Ingresar al panel'
                )}
              </PostaButton>
            </div>
          </form>
        </div>

        <a href="/" className="auth-split__mobile-home lg:hidden">
          <ArrowLeft className="h-3.5 w-3.5" />
          Volver al inicio
        </a>
      </main>
    </div>
  );
}
