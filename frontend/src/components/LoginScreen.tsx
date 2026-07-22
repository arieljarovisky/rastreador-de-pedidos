/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
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
import ThemeToggle from './ui/ThemeToggle.tsx';
import GoogleSignInButton from './GoogleSignInButton.tsx';
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

type AuthMode =
  | 'login'
  | 'register-agency'
  | 'forgot-password'
  | 'reset-password'
  | 'pending-verification';
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

export interface AgencyGoogleRegisterData {
  idToken: string;
  agencyName: string;
  adminName: string;
  phone: string;
  cuit: string;
  city: string;
  acceptTerms: boolean;
}

export type RegisterAgencyResult =
  | { pendingVerification: true; email: string; message?: string }
  | { pendingVerification?: false };

interface LoginScreenProps {
  onLogin: (username: string, password: string, replaceSession?: boolean) => Promise<void>;
  onRegisterAgency: (data: AgencyRegisterData) => Promise<RegisterAgencyResult>;
  onGoogleLogin: (idToken: string, replaceSession?: boolean) => Promise<void>;
  onGoogleRegister: (data: AgencyGoogleRegisterData) => Promise<void>;
  onForgotPassword: (email: string) => Promise<string>;
  onResetPassword: (token: string, password: string) => Promise<string>;
  onResendVerification: (email: string) => Promise<string>;
  loading: boolean;
  error: string | null;
  errorCode?: string | null;
  pendingEmail?: string | null;
  googleClientId?: string | null;
  /** Token de recuperación desde el link del correo (`?resetToken=`). */
  initialResetToken?: string | null;
}

const FEATURES = [
  { icon: Navigation, text: 'Seguimiento GPS en vivo de cada repartidor' },
  { icon: Route, text: 'Rutas, pedidos y asignaciones en un solo lugar' },
  { icon: Globe, text: 'Cobertura en CABA, GBA y marketplace nacional' },
] as const;

const AUTH_EASE = [0.22, 1, 0.36, 1] as const;

const AUTH_CROSSFADE = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

function authBrandVariants(reduced: boolean) {
  if (reduced) return AUTH_CROSSFADE;
  return {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
  };
}

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
  onGoogleLogin,
  onGoogleRegister,
  onForgotPassword,
  onResetPassword,
  onResendVerification,
  loading,
  error,
  errorCode = null,
  pendingEmail = null,
  googleClientId = null,
  initialResetToken = null,
}: LoginScreenProps) {
  const [mode, setMode] = useState<AuthMode>(initialResetToken ? 'reset-password' : 'login');
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
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState(initialResetToken ?? '');
  const [verificationEmail, setVerificationEmail] = useState(pendingEmail ?? '');
  const [showReplaceOption, setShowReplaceOption] = useState(false);
  const theme = usePostaTheme();
  const reducedMotion = useReducedMotion();
  const googleEnabled = Boolean(googleClientId);

  const toggleTheme = () => {
    applyPostaTheme(theme === 'dark' ? 'paper' : 'dark');
  };

  const logoVariant = theme === 'paper' ? 'paper' : 'dark';

  useEffect(() => {
    if (initialResetToken) {
      setResetToken(initialResetToken);
      setMode('reset-password');
      setLocalError(null);
      setSuccessMessage(null);
    }
  }, [initialResetToken]);

  useEffect(() => {
    if (pendingEmail) {
      setVerificationEmail(pendingEmail);
      setMode('pending-verification');
      setSuccessMessage(null);
      setLocalError(null);
    }
  }, [pendingEmail]);

  useEffect(() => {
    if (errorCode === 'EMAIL_NOT_VERIFIED') {
      setMode('pending-verification');
      if (username.trim()) setVerificationEmail(username.trim().toLowerCase());
    }
  }, [errorCode, username]);

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
    setSuccessMessage(null);
    if (!initialResetToken) setResetToken('');
  };

  const switchMode = (next: AuthMode) => {
    setMode(next);
    resetForm();
  };

  const goBackToStep1 = () => {
    setRegisterStep(1);
    setLocalError(null);
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

  const handleSubmit = (e: React.FormEvent, replaceSession = false) => {
    e.preventDefault();
    setLocalError(null);
    setSuccessMessage(null);

    if (mode === 'pending-verification') {
      const target = (verificationEmail || email).trim().toLowerCase();
      if (!target || !isValidEmail(target)) {
        setLocalError('Ingresá el correo de la cuenta.');
        return;
      }
      void onResendVerification(target)
        .then((message) => setSuccessMessage(message))
        .catch((err: unknown) => {
          setLocalError(err instanceof Error ? err.message : 'No se pudo reenviar el correo.');
        });
      return;
    }

    if (mode === 'forgot-password') {
      if (!email.trim()) {
        setLocalError('Ingresá el correo de la cuenta.');
        return;
      }
      if (!isValidEmail(email.trim())) {
        setLocalError('Ingresá un correo electrónico válido.');
        return;
      }
      void onForgotPassword(email.trim().toLowerCase())
        .then((message) => {
          setSuccessMessage(message);
        })
        .catch((err: unknown) => {
          setLocalError(err instanceof Error ? err.message : 'No se pudo enviar el correo.');
        });
      return;
    }

    if (mode === 'reset-password') {
      if (!resetToken.trim()) {
        setLocalError('Falta el enlace de recuperación. Pedí uno nuevo desde “Olvidé mi contraseña”.');
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
      void onResetPassword(resetToken.trim(), password)
        .then((message) => {
          setSuccessMessage(message);
          setPassword('');
          setPasswordConfirm('');
          setTimeout(() => switchMode('login'), 1600);
        })
        .catch((err: unknown) => {
          setLocalError(err instanceof Error ? err.message : 'No se pudo actualizar la contraseña.');
        });
      return;
    }

    if (mode === 'login') {
      if (!username.trim() || !password) {
        setLocalError('Completá usuario y contraseña.');
        return;
      }
      void onLogin(username.trim(), password, replaceSession);
      if (replaceSession) {
        setShowReplaceOption(true);
      }
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
    })
      .then((result) => {
        if (result?.pendingVerification) {
          setVerificationEmail(result.email);
          setMode('pending-verification');
          setSuccessMessage(
            result.message ||
              'Te enviamos un correo para activar tu cuenta. Revisá tu bandeja (y spam).'
          );
          setLocalError(null);
        }
      })
      .catch(() => {
        /* error lo muestra App vía prop error */
      });
  };

  const handleGoogleCredential = (idToken: string) => {
    setLocalError(null);
    setSuccessMessage(null);

    if (mode === 'login') {
      void onGoogleLogin(idToken, showReplaceOption || errorCode === 'SESSION_ALREADY_ACTIVE');
      return;
    }

    if (mode === 'register-agency' && registerStep === 2) {
      if (!acceptTerms) {
        setLocalError('Debés aceptar la política de privacidad.');
        return;
      }
      const stepErr = validateStep1();
      if (stepErr) {
        setLocalError(stepErr);
        return;
      }
      void onGoogleRegister({
        idToken,
        agencyName: agencyName.trim(),
        adminName: adminName.trim() || 'Administrador',
        phone: normalizePhone(phone),
        cuit,
        city: city.trim(),
        acceptTerms: true,
      });
    }
  };

  const isRegister = mode === 'register-agency';
  const isForgot = mode === 'forgot-password';
  const isReset = mode === 'reset-password';
  const isPending = mode === 'pending-verification';
  const isAuthAlt = isForgot || isReset || isPending;
  const sessionConflict =
    errorCode === 'SESSION_ALREADY_ACTIVE' || showReplaceOption;
  const displayError = localError || error;

  useEffect(() => {
    if (errorCode === 'SESSION_ALREADY_ACTIVE') {
      setShowReplaceOption(true);
    }
  }, [errorCode]);
  const step1Ready = agencyName.trim() && cuit && phone && city.trim();
  const step2Ready =
    adminName.trim() && email.trim() && password && passwordConfirm && acceptTerms;

  const panelKey = isRegister
    ? `register-${registerStep}`
    : isForgot
      ? 'forgot'
      : isReset
        ? 'reset'
        : isPending
          ? 'pending'
          : 'login';
  const crossfadeDuration = reducedMotion ? 0.12 : 0.22;
  const layoutTransition = reducedMotion
    ? { duration: 0.12 }
    : { duration: 0.32, ease: AUTH_EASE };

  const brandTitle = isPending
    ? 'Activá tu cuenta'
    : isForgot
      ? 'Recuperar acceso'
      : isReset
        ? 'Nueva contraseña'
        : isRegister
          ? registerStep === 1
            ? 'Registrar agencia'
            : 'Cuenta del responsable'
          : 'Iniciar sesión';

  const brandSubtitle = isPending
    ? 'Te enviamos un enlace al correo. Sin activarlo no podés entrar al panel.'
    : isForgot
      ? 'Te enviamos un enlace al correo con el que registraste la agencia para crear una contraseña nueva.'
      : isReset
        ? 'Elegí una contraseña nueva para volver a entrar al panel de tu agencia.'
        : isRegister
          ? registerStep === 1
            ? 'Solo las agencias de logística se registran acá. Los vendedores reciben su cuenta desde el panel de su agencia.'
            : 'Creá la cuenta del administrador con correo o con Google.'
          : 'Agencias, vendedores y repartidores: ingresá con las credenciales que te asignaron. El alta de vendedores la hace tu agencia.';

  return (
    <div className="auth-split" id="login-container">
      <div className="auth-split__theme">
        <ThemeToggle theme={theme} onToggle={toggleTheme} compact className="auth-split__theme-btn" />
      </div>

      <aside className="auth-split__brand">
        <div className="auth-split__brand-grid" aria-hidden="true" />
        <div className="auth-split__brand-inner">
          <PostaLogo variant={logoVariant} size={36} showWordmark className="auth-split__logo" />

          <p className="auth-split__eyebrow">Panel operativo</p>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={`${brandTitle}-${brandSubtitle.slice(0, 24)}`}
              initial="initial"
              animate="animate"
              exit="exit"
              variants={authBrandVariants(Boolean(reducedMotion))}
              transition={{ duration: crossfadeDuration, ease: AUTH_EASE }}
            >
              <h1 className="auth-split__title">{brandTitle}</h1>
              <p className="auth-split__lead">{brandSubtitle}</p>
            </motion.div>
          </AnimatePresence>

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
          <PostaLogo variant={logoVariant} size={32} showWordmark />
          <p className="auth-split__eyebrow auth-split__eyebrow--mobile">Panel operativo</p>
          <h1 className="auth-split__title auth-split__title--mobile">{brandTitle}</h1>
        </div>

        <motion.div
          className="auth-split__card"
          layout
          transition={{ layout: layoutTransition }}
        >
          <div className="auth-split__tabs" role="tablist" aria-label="Tipo de acceso">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'login' || isAuthAlt}
              onClick={() => switchMode('login')}
              className={`auth-split__tab ${mode === 'login' || isAuthAlt ? 'auth-split__tab--active' : ''}`}
            >
              {mode === 'login' || isAuthAlt ? (
                <motion.span
                  layoutId="auth-tab-pill"
                  className="auth-split__tab-pill"
                  transition={{ type: 'spring', stiffness: 320, damping: 38 }}
                />
              ) : null}
              <span className="auth-split__tab-label">Ingresar</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'register-agency'}
              onClick={() => switchMode('register-agency')}
              className={`auth-split__tab ${mode === 'register-agency' ? 'auth-split__tab--active' : ''}`}
            >
              {mode === 'register-agency' ? (
                <motion.span
                  layoutId="auth-tab-pill"
                  className="auth-split__tab-pill"
                  transition={{ type: 'spring', stiffness: 320, damping: 38 }}
                />
              ) : null}
              <span className="auth-split__tab-label">Agencia</span>
            </button>
          </div>

          <div className="auth-split__stage">
            <AnimatePresence mode="sync" initial={false}>
              <motion.div
                key={panelKey}
                className="auth-split__stage-panel"
                initial="initial"
                animate="animate"
                exit="exit"
                variants={AUTH_CROSSFADE}
                transition={{ duration: crossfadeDuration, ease: AUTH_EASE }}
              >
          <div className="auth-split__card-head">
            <h2 className="auth-split__card-title">
              {isPending ? (
                <>
                  <Mail className="h-4 w-4 text-[var(--auth-accent)]" />
                  Revisá tu correo
                </>
              ) : isForgot ? (
                <>
                  <Mail className="h-4 w-4 text-[var(--auth-accent)]" />
                  Olvidé mi contraseña
                </>
              ) : isReset ? (
                <>
                  <Key className="h-4 w-4 text-[var(--auth-accent)]" />
                  Elegí una contraseña nueva
                </>
              ) : mode === 'login' ? (
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
              {isPending
                ? 'Sin activar el correo no podés ingresar.'
                : isForgot
                  ? 'Usá el correo con el que registraste la agencia.'
                  : isReset
                    ? 'Mínimo 8 caracteres, una letra y un número.'
                    : mode === 'login'
                      ? 'Agencias, vendedores y repartidores.'
                      : registerStep === 1
                        ? 'Paso 1 de 2 · Solo registro de agencias'
                        : 'Paso 2 de 2 · Correo o Google'}
            </p>
          </div>

          {mode === 'login' && (
            <p className="auth-split__hint">
              <strong>¿Sos vendedor?</strong> Ingresá con el usuario y contraseña que te dio tu agencia.
              No podés registrarte solo: tu agencia te crea la cuenta desde Configuración.
            </p>
          )}

          {isForgot && (
            <p className="auth-split__hint">
              Te mandamos un enlace al correo. Si no llega en unos minutos, revisá spam o pedí uno de nuevo.
            </p>
          )}

          {isPending && (
            <p className="auth-split__hint">
              Buscá el mail de <strong>Posta</strong> y abrí el enlace de activación. Si no llegó, podés
              reenviarlo abajo.
            </p>
          )}

          {isRegister && registerStep === 1 && (
            <p className="auth-split__hint auth-split__hint--register">
              Las cuentas de <strong>vendedores</strong> y <strong>repartidores</strong> las crea el
              administrador de la agencia después del registro.
            </p>
          )}

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

          {successMessage && (
            <div className="auth-split__success" role="status">
              {successMessage}
            </div>
          )}

          <form
            onSubmit={(e) => handleSubmit(e, sessionConflict && mode === 'login')}
            className="auth-split__form"
            noValidate
          >
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

                {googleEnabled ? (
                  <>
                    <div className="auth-split__divider" role="separator">
                      <span>o registrate con</span>
                    </div>
                    <GoogleSignInButton
                      clientId={googleClientId!}
                      text="signup_with"
                      disabled={loading || !acceptTerms}
                      onCredential={handleGoogleCredential}
                      onError={(message) => setLocalError(message)}
                    />
                    {!acceptTerms ? (
                      <p className="auth-split__card-sub text-center">
                        Aceptá la política de privacidad para continuar con Google.
                      </p>
                    ) : null}
                  </>
                ) : null}
              </div>
            )}

            {!isRegister && !isAuthAlt && (
              <div className="auth-split__fields">
                {googleEnabled ? (
                  <>
                    <GoogleSignInButton
                      clientId={googleClientId!}
                      text="continue_with"
                      disabled={loading}
                      onCredential={handleGoogleCredential}
                      onError={(message) => setLocalError(message)}
                    />
                    <div className="auth-split__divider" role="separator">
                      <span>o con tu usuario</span>
                    </div>
                  </>
                ) : null}
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
                <button
                  type="button"
                  className="auth-split__forgot"
                  disabled={loading}
                  onClick={() => switchMode('forgot-password')}
                >
                  ¿Olvidaste tu contraseña?
                </button>
              </div>
            )}

            {isForgot && (
              <div className="auth-split__fields">
                <Field label="Correo de la agencia">
                  <IconInput
                    icon={Mail}
                    type="email"
                    disabled={loading || Boolean(successMessage)}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@tuagencia.com.ar"
                    autoComplete="email"
                  />
                </Field>
              </div>
            )}

            {isPending && (
              <div className="auth-split__fields">
                <Field label="Correo a activar">
                  <IconInput
                    icon={Mail}
                    type="email"
                    disabled={loading}
                    value={verificationEmail}
                    onChange={(e) => setVerificationEmail(e.target.value)}
                    placeholder="admin@tuagencia.com.ar"
                    autoComplete="email"
                  />
                </Field>
              </div>
            )}

            {isReset && (
              <div className="auth-split__fields">
                <Field label="Nueva contraseña">
                  <div className="auth-field__wrap">
                    <span className="auth-field__icon" aria-hidden="true">
                      <Key className="h-4 w-4" />
                    </span>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      disabled={loading || Boolean(successMessage)}
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
                      disabled={loading || Boolean(successMessage)}
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
              </div>
            )}

            <div
              className={`auth-split__actions ${sessionConflict && mode === 'login' ? 'auth-split__actions--stacked' : ''}`}
            >
              {(isRegister && registerStep === 2) || isAuthAlt ? (
                <button
                  type="button"
                  className="auth-split__back"
                  disabled={loading}
                  onClick={() => {
                    if (isAuthAlt) switchMode('login');
                    else goBackToStep1();
                  }}
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Volver
                </button>
              ) : null}

              {!sessionConflict || isRegister || isAuthAlt ? (
                <PostaButton
                  type="submit"
                  disabled={
                    loading ||
                    Boolean(successMessage && (isForgot || isReset)) ||
                    (isPending
                      ? !verificationEmail.trim()
                      : isForgot
                        ? !email.trim()
                        : isReset
                          ? !password || !passwordConfirm
                          : isRegister
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
                  ) : isPending ? (
                    'Reenviar activación'
                  ) : isForgot ? (
                    'Enviar enlace'
                  ) : isReset ? (
                    'Guardar contraseña'
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
              ) : null}

              {sessionConflict && mode === 'login' && (
                <PostaButton
                  type="button"
                  disabled={loading || !username.trim() || !password}
                  className="auth-split__submit auth-split__submit--replace w-full"
                  onClick={(e) => handleSubmit(e, true)}
                >
                  {loading ? 'Cerrando sesión anterior...' : 'Cerrar sesión en el otro dispositivo e ingresar'}
                </PostaButton>
              )}
            </div>
          </form>
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.div>

        <a href="/" className="auth-split__mobile-home lg:hidden">
          <ArrowLeft className="h-3.5 w-3.5" />
          Volver al inicio
        </a>
      </main>
    </div>
  );
}
