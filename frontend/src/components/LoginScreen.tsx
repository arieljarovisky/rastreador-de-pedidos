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
} from 'lucide-react';
import PostaLogo from './ui/PostaLogo.tsx';
import PostaButton from './ui/PostaButton.tsx';
import PaperCard from './ui/PaperCard.tsx';
import ThemeToggle from './ui/ThemeToggle.tsx';
import { applyPostaTheme, usePostaTheme } from '../theme/usePostaTheme.ts';
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

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[11px] font-medium text-[var(--color-text-muted)]">{label}</label>
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
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)]">
        <Icon className="h-4 w-4" />
      </span>
      <input
        {...props}
        className={`auth-input auth-input--icon ${className}`.trim()}
      />
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
  const theme = usePostaTheme();

  const toggleTheme = () => {
    applyPostaTheme(theme === 'dark' ? 'paper' : 'dark');
  };

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
    weak: 'bg-[var(--color-danger)]',
    fair: 'bg-[var(--color-warn)]',
    good: 'bg-[var(--color-accent)]',
    strong: 'bg-[var(--color-ok)]',
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

  return (
    <div className="auth-screen" id="login-container">
      <div className="auth-screen__toolbar">
        <ThemeToggle theme={theme} onToggle={toggleTheme} compact />
      </div>

      <div className="auth-screen__inner">
        <header className="auth-screen__header">
          <PostaLogo
            variant={theme === 'paper' ? 'paper' : 'dark'}
            size={48}
            className="justify-center mb-2"
          />
          <p className="mono-label text-[var(--color-text-muted)]">Hoja de ruta · CABA y GBA</p>
        </header>

        <PaperCard className="auth-card w-full max-w-md">
          <div className="auth-tabs">
            <button
              type="button"
              onClick={() => switchMode('login')}
              className={`auth-tab ${mode === 'login' ? 'auth-tab--active' : ''}`}
            >
              Ingresar
            </button>
            <button
              type="button"
              onClick={() => switchMode('register-agency')}
              className={`auth-tab ${mode === 'register-agency' ? 'auth-tab--active' : ''}`}
            >
              Agencia
            </button>
          </div>

          <div className="auth-card__head">
            <h2 className="font-display text-base font-semibold tracking-[-0.02em] text-[var(--color-text)] flex items-center gap-2">
              {mode === 'login' ? (
                <>
                  <Lock className="w-4 h-4 text-[var(--color-accent)] shrink-0" />
                  Iniciar sesión
                </>
              ) : (
                <>
                  <Building2 className="w-4 h-4 text-[var(--color-accent)] shrink-0" />
                  Registrar agencia
                </>
              )}
            </h2>
            <p className="text-xs text-[var(--color-text-muted)] mt-1 leading-relaxed">
              {mode === 'login'
                ? 'Usá el correo o usuario que te asignó tu agencia.'
                : registerStep === 1
                  ? 'Paso 1 de 2 · Datos de tu empresa'
                  : 'Paso 2 de 2 · Cuenta del responsable'}
            </p>
          </div>

          {isRegister && (
            <div className="auth-steps" aria-hidden="true">
              <span className={`auth-steps__dot ${registerStep >= 1 ? 'auth-steps__dot--on' : ''}`} />
              <span className={`auth-steps__line ${registerStep >= 2 ? 'auth-steps__line--on' : ''}`} />
              <span className={`auth-steps__dot ${registerStep >= 2 ? 'auth-steps__dot--on' : ''}`} />
            </div>
          )}

          {displayError && (
            <div className="auth-error" role="alert">
              <Shield className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{displayError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="auth-form" noValidate>
            {isRegister && registerStep === 1 && (
              <div className="auth-form__section space-y-3">
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
              <div className="auth-form__section space-y-3">
                <div className="auth-summary">
                  <p className="auth-summary__label">Agencia</p>
                  <p className="auth-summary__value">{agencyName}</p>
                  <p className="auth-summary__meta">
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
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)]">
                      <Key className="h-4 w-4" />
                    </span>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      disabled={loading}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Mín. 8 caracteres, letra y número"
                      className="auth-input auth-input--icon pr-10"
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)] hover:text-[var(--color-text)]"
                      aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {password.length > 0 && (
                    <div className="mt-2 space-y-1">
                      <div className="flex gap-1 h-1">
                        {Array.from({ length: 4 }).map((_, i) => (
                          <span
                            key={i}
                            className={`flex-1 rounded-full transition-colors ${
                              i < passwordScore ? strengthBarClass : 'bg-[var(--surface-border)]'
                            }`}
                          />
                        ))}
                      </div>
                      <p className="text-[10px] text-[var(--color-text-muted)]">
                        {passwordMeta.label} · incluí letras y números
                      </p>
                    </div>
                  )}
                </Field>
                <Field label="Confirmar contraseña">
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)]">
                      <Key className="h-4 w-4" />
                    </span>
                    <input
                      type={showPasswordConfirm ? 'text' : 'password'}
                      disabled={loading}
                      value={passwordConfirm}
                      onChange={(e) => setPasswordConfirm(e.target.value)}
                      placeholder="Repetí la contraseña"
                      className="auth-input auth-input--icon pr-10"
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPasswordConfirm(!showPasswordConfirm)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)] hover:text-[var(--color-text)]"
                      aria-label={showPasswordConfirm ? 'Ocultar confirmación' : 'Mostrar confirmación'}
                    >
                      {showPasswordConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </Field>
                <label className="auth-terms">
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
              <div className="auth-form__section space-y-3">
                <Field label="Correo o usuario">
                  <IconInput
                    icon={Mail}
                    disabled={loading}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="correo o usuario"
                    autoComplete="username"
                  />
                </Field>
                <Field label="Contraseña">
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)]">
                      <Key className="h-4 w-4" />
                    </span>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      disabled={loading}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="auth-input auth-input--icon pr-10"
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)] hover:text-[var(--color-text)]"
                      aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </Field>
              </div>
            )}

            <div className="auth-form__actions">
              {isRegister && registerStep === 2 && (
                <button
                  type="button"
                  className="auth-back-btn"
                  disabled={loading}
                  onClick={() => {
                    setRegisterStep(1);
                    setLocalError(null);
                  }}
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
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
                className="flex-1 min-w-0"
              >
                {loading ? (
                  'Procesando...'
                ) : isRegister ? (
                  registerStep === 1 ? (
                    <span className="inline-flex items-center justify-center gap-1.5">
                      Continuar
                      <ChevronRight className="w-4 h-4" />
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
        </PaperCard>

        <a href="/" className="auth-screen__footer">
          <ArrowLeft className="w-3.5 h-3.5" />
          Volver al inicio
        </a>
      </div>
    </div>
  );
}
