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

const inputClass =
  'w-full bg-[var(--paper)] border border-[var(--surface-border)] rounded py-2 px-3 text-xs text-[var(--color-text)] placeholder:text-[var(--color-text-faint)] focus:outline-none focus:border-[var(--color-accent)] transition disabled:opacity-50';

const inputIconClass =
  'w-full bg-[var(--paper)] border border-[var(--surface-border)] rounded py-2 pl-9 pr-3 text-xs text-[var(--color-text)] placeholder:text-[var(--color-text-faint)] focus:outline-none focus:border-[var(--color-accent)] transition disabled:opacity-50';

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="mono-label text-[var(--color-text-faint)] border-b border-[var(--surface-border)] pb-1.5 mb-2">
      {children}
    </p>
  );
}

export default function LoginScreen({
  onLogin,
  onRegisterAgency,
  loading,
  error,
}: LoginScreenProps) {
  const [mode, setMode] = useState<AuthMode>('login');
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (mode === 'login') {
      if (!username.trim() || !password) return;
      onLogin(username.trim(), password);
      return;
    }

    if (!agencyName.trim() || !adminName.trim() || !email.trim() || !password || !phone || !cuit || !city.trim()) {
      setLocalError('Completá todos los campos obligatorios.');
      return;
    }

    if (!isValidEmail(email.trim())) {
      setLocalError('Ingresá un correo electrónico válido para la cuenta administrador.');
      return;
    }

    if (!isValidPhone(phone)) {
      setLocalError('Ingresá un teléfono válido (mínimo 8 dígitos).');
      return;
    }

    if (!isValidCuit(cuit)) {
      setLocalError('El CUIT ingresado no es válido.');
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
      setLocalError('Debés aceptar la política de privacidad para registrarte.');
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

  const registerReady =
    agencyName.trim() &&
    adminName.trim() &&
    email.trim() &&
    phone &&
    cuit &&
    city.trim() &&
    password &&
    passwordConfirm &&
    acceptTerms;

  return (
    <div
      className="app-viewport safe-top safe-bottom min-h-[100dvh] flex flex-col items-center justify-center p-3 sm:p-4 md:p-6 bg-[var(--surface-bg)] relative overflow-y-auto"
      id="login-container"
    >
      <div className="absolute top-[max(0.75rem,env(safe-area-inset-top))] right-3 sm:right-4 z-10">
        <ThemeToggle theme={theme} onToggle={toggleTheme} compact />
      </div>

      <div className="mb-4 sm:mb-5 text-center w-full max-w-md pt-8 sm:pt-0">
        <PostaLogo
          variant={theme === 'paper' ? 'paper' : 'dark'}
          size={44}
          className="justify-center mb-2 sm:mb-3 sm:[&_svg]:w-12 sm:[&_svg]:h-12"
        />
        <p className="mono-label text-[var(--color-text-muted)] mt-2">Hoja de ruta · CABA y GBA</p>
      </div>

      <PaperCard className="w-full max-w-sm sm:max-w-lg p-4 sm:p-6 relative overflow-hidden mb-4">
        <div className="flex bg-[var(--surface-panel-2)] p-0.5 rounded border border-[var(--surface-border)] mb-4 text-[10px]">
          <button
            type="button"
            onClick={() => switchMode('login')}
            className={`flex-1 py-1.5 rounded font-mono font-bold uppercase tracking-wider transition ${
              mode === 'login'
                ? 'bg-[var(--surface-panel)] text-[var(--color-text)] border border-[var(--ink)]/10'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
            }`}
          >
            Ingresar
          </button>
          <button
            type="button"
            onClick={() => switchMode('register-agency')}
            className={`flex-1 py-1.5 rounded font-mono font-bold uppercase tracking-wider transition ${
              mode === 'register-agency'
                ? 'bg-[var(--surface-panel)] text-[var(--color-text)] border border-[var(--ink)]/10'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
            }`}
          >
            Agencia
          </button>
        </div>

        <h2 className="font-display text-sm font-semibold tracking-[-0.02em] text-[var(--color-text)] mb-1 flex items-center gap-1.5">
          {mode === 'login' && (
            <>
              <Lock className="w-3.5 h-3.5 text-[var(--color-accent)]" /> Iniciar sesión
            </>
          )}
          {mode === 'register-agency' && (
            <>
              <Building2 className="w-3.5 h-3.5 text-[var(--color-accent)]" /> Registrar agencia
            </>
          )}
        </h2>
        <p className="mono-label mb-3">Acceso operadores</p>

        {mode === 'login' && (
          <p className="text-xs text-[var(--color-text-muted)] mb-3 leading-relaxed">
            Ingresá con el correo o usuario que te asignó tu agencia. Tu sesión queda protegida con
            conexión cifrada.
          </p>
        )}

        {mode === 'register-agency' && (
          <p className="text-xs text-[var(--color-text-muted)] mb-3 leading-relaxed">
            Completá los datos de tu empresa y del responsable. Usaremos el correo como usuario de
            acceso al panel.
          </p>
        )}

        {displayError && (
          <div className="bg-[var(--color-danger)]/10 border border-[var(--color-danger)]/30 text-[var(--color-danger)] text-xs rounded p-2.5 mb-4 font-medium flex items-start gap-1.5 animate-shake">
            <Shield className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{displayError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          {isRegister && (
            <>
              <SectionTitle>Datos de la agencia</SectionTitle>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="sm:col-span-2">
                  <label className="mono-label block mb-1">Nombre comercial</label>
                  <input
                    type="text"
                    required
                    disabled={loading}
                    value={agencyName}
                    onChange={(e) => setAgencyName(e.target.value)}
                    placeholder="Ej: Logística Rápida BA"
                    className={inputClass}
                    autoComplete="organization"
                  />
                </div>
                <div>
                  <label className="mono-label block mb-1">CUIT</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)]">
                      <FileText className="w-3.5 h-3.5" />
                    </span>
                    <input
                      type="text"
                      required
                      inputMode="numeric"
                      disabled={loading}
                      value={cuit}
                      onChange={(e) => setCuit(formatCuitInput(e.target.value))}
                      placeholder="20-12345678-9"
                      className={inputIconClass}
                    />
                  </div>
                </div>
                <div>
                  <label className="mono-label block mb-1">Teléfono</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)]">
                      <Phone className="w-3.5 h-3.5" />
                    </span>
                    <input
                      type="tel"
                      required
                      disabled={loading}
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="11 1234-5678"
                      className={inputIconClass}
                      autoComplete="tel"
                    />
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <label className="mono-label block mb-1">Ciudad / zona de operación</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)]">
                      <MapPin className="w-3.5 h-3.5" />
                    </span>
                    <input
                      type="text"
                      required
                      disabled={loading}
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="Ej: CABA y GBA Norte"
                      className={inputIconClass}
                      autoComplete="address-level2"
                    />
                  </div>
                </div>
              </div>

              <SectionTitle>Cuenta del administrador</SectionTitle>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="sm:col-span-2">
                  <label className="mono-label block mb-1">Nombre y apellido del responsable</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)]">
                      <UserIcon className="w-3.5 h-3.5" />
                    </span>
                    <input
                      type="text"
                      required
                      disabled={loading}
                      value={adminName}
                      onChange={(e) => setAdminName(e.target.value)}
                      placeholder="Ej: María González"
                      className={inputIconClass}
                      autoComplete="name"
                    />
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <label className="mono-label block mb-1">Correo electrónico (usuario de acceso)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)]">
                      <Mail className="w-3.5 h-3.5" />
                    </span>
                    <input
                      type="email"
                      required
                      disabled={loading}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="admin@tuagencia.com.ar"
                      className={inputIconClass}
                      autoComplete="email"
                    />
                  </div>
                </div>
              </div>
            </>
          )}

          {!isRegister && (
            <div>
              <label className="mono-label block mb-1">Correo o usuario</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)]">
                  <Mail className="w-3.5 h-3.5" />
                </span>
                <input
                  type="text"
                  required
                  disabled={loading}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="correo o usuario"
                  className={inputIconClass}
                  autoComplete="username"
                />
              </div>
            </div>
          )}

          <div>
            <label className="mono-label block mb-1">{isRegister ? 'Contraseña segura' : 'Contraseña'}</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)]">
                <Key className="w-3.5 h-3.5" />
              </span>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                disabled={loading}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isRegister ? 'Mín. 8 caracteres, letra y número' : '••••••••'}
                className="w-full bg-[var(--paper)] border border-[var(--surface-border)] rounded py-2 pl-9 pr-9 text-xs text-[var(--color-text)] placeholder:text-[var(--color-text-faint)] focus:outline-none focus:border-[var(--color-accent)] transition disabled:opacity-50"
                autoComplete={isRegister ? 'new-password' : 'current-password'}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)] hover:text-[var(--color-text)] transition"
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
            {isRegister && password.length > 0 && (
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
                <p className="text-[10px] font-mono text-[var(--color-text-muted)]">
                  Seguridad: {passwordMeta.label} · 8+ caracteres, letra y número
                </p>
              </div>
            )}
          </div>

          {isRegister && (
            <div>
              <label className="mono-label block mb-1">Confirmar contraseña</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)]">
                  <Key className="w-3.5 h-3.5" />
                </span>
                <input
                  type={showPasswordConfirm ? 'text' : 'password'}
                  required
                  disabled={loading}
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  placeholder="Repetí la contraseña"
                  className="w-full bg-[var(--paper)] border border-[var(--surface-border)] rounded py-2 pl-9 pr-9 text-xs text-[var(--color-text)] placeholder:text-[var(--color-text-faint)] focus:outline-none focus:border-[var(--color-accent)] transition disabled:opacity-50"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPasswordConfirm(!showPasswordConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)] hover:text-[var(--color-text)] transition"
                  aria-label={showPasswordConfirm ? 'Ocultar confirmación' : 'Mostrar confirmación'}
                >
                  {showPasswordConfirm ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          )}

          {isRegister && (
            <label className="flex items-start gap-2 cursor-pointer group">
              <input
                type="checkbox"
                checked={acceptTerms}
                onChange={(e) => setAcceptTerms(e.target.checked)}
                className="mt-0.5 accent-[var(--color-stamp)]"
                disabled={loading}
              />
              <span className="text-[11px] text-[var(--color-text-muted)] leading-relaxed group-hover:text-[var(--color-text)] transition">
                Acepto la{' '}
                <a
                  href="/privacidad"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--color-accent)] underline underline-offset-2"
                >
                  política de privacidad
                </a>{' '}
                y autorizo el tratamiento de los datos de la agencia para operar en Posta.
              </span>
            </label>
          )}

          <PostaButton
            type="submit"
            disabled={loading || (isRegister ? !registerReady : !username.trim() || !password)}
            id="btn-login-submit"
            className="w-full mt-1"
          >
            {loading
              ? 'Procesando...'
              : mode === 'login'
                ? 'Ingresar al panel'
                : 'Crear cuenta de agencia'}
          </PostaButton>
        </form>
      </PaperCard>

      <a
        href="/"
        className="mb-6 inline-flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] hover:text-[var(--color-accent)] transition"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Volver al inicio
      </a>
    </div>
  );
}
