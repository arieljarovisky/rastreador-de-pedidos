/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Shield,
  Key,
  Eye,
  EyeOff,
  Lock,
  User as UserIcon,
  Building2,
  Store,
  ArrowLeft,
  Truck,
  MapPin,
  Zap,
  Link2,
  Radio,
  CheckCircle2,
} from 'lucide-react';
import PostaLogo from './ui/PostaLogo.tsx';
import PostaButton from './ui/PostaButton.tsx';
import PaperCard from './ui/PaperCard.tsx';
import ThemeToggle from './ui/ThemeToggle.tsx';
import CoverageAreasEditor, {
  emptyCoverageDraft,
  coverageDraftsAreValid,
  draftsToCoverageAreas,
  type CoverageAreaDraft,
} from './CoverageAreasEditor.tsx';
import type { AgencyCoverageArea } from '../types.js';
import { applyPostaTheme, usePostaTheme } from '../theme/usePostaTheme.ts';

type AuthMode = 'login' | 'register-agency' | 'register-seller';

interface RegisterData {
  username: string;
  password: string;
  name: string;
  city?: string;
  province?: string;
  coverageAreas?: AgencyCoverageArea[];
}

interface LoginScreenProps {
  onLogin: (username: string, password: string) => Promise<void>;
  onRegisterAgency: (data: RegisterData) => Promise<void>;
  onRegisterSeller: (data: RegisterData) => Promise<void>;
  loading: boolean;
  error: string | null;
}

const MODE_META: Record<
  AuthMode,
  {
    title: string;
    subtitle: string;
    description: string;
    icon: typeof Lock;
    highlights: { icon: typeof Truck; text: string }[];
  }
> = {
  login: {
    title: 'Iniciar sesión',
    subtitle: 'Panel operativo',
    description: 'Agencias, vendedores y repartidores: ingresá con tus credenciales para gestionar envíos en tiempo real.',
    icon: Lock,
    highlights: [
      { icon: Radio, text: 'Seguimiento GPS en vivo de cada repartidor' },
      { icon: Truck, text: 'Rutas, pedidos y asignaciones en un solo lugar' },
      { icon: MapPin, text: 'Cobertura en CABA, GBA y marketplace nacional' },
    ],
  },
  'register-agency': {
    title: 'Crear cuenta de agencia',
    subtitle: 'Marketplace de logística',
    description: 'Publicá tu operación con las zonas que cubrís, tarifas por zona y pedido mínimo opcional. Los vendedores te eligen desde el catálogo.',
    icon: Building2,
    highlights: [
      { icon: MapPin, text: 'Definí cobertura, tarifas y pedido mínimo por zona' },
      { icon: Zap, text: 'Ofrecé envío en el día, turbo o servicios custom' },
      { icon: Store, text: 'Recibí pedidos de vendedores del marketplace' },
    ],
  },
  'register-seller': {
    title: 'Crear cuenta de vendedor',
    subtitle: 'Tu tienda conectada',
    description: 'Registrate, conectá Mercado Libre o Tienda Nube y elegí qué agencia despacha cada envío en todo el país.',
    icon: Store,
    highlights: [
      { icon: Link2, text: 'Integración con Mercado Libre y Tienda Nube' },
      { icon: Building2, text: 'Elegí la agencia de logística que prefieras' },
      { icon: Truck, text: 'Importá envíos y cargá pedidos desde el panel' },
    ],
  },
};

const inputClass =
  'w-full bg-[var(--paper)] border border-[var(--surface-border)] rounded-lg py-2.5 px-3 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-faint)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)]/25 transition disabled:opacity-50';

function ModeTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 lg:flex-none lg:min-w-[7.5rem] py-2.5 px-4 rounded-lg font-mono text-[11px] font-bold uppercase tracking-wider transition ${
        active
          ? 'bg-[var(--color-accent)] text-white shadow-md shadow-[var(--color-accent)]/20'
          : 'bg-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--surface-panel-2)]'
      }`}
    >
      {children}
    </button>
  );
}

export default function LoginScreen({
  onLogin,
  onRegisterAgency,
  onRegisterSeller,
  loading,
  error,
}: LoginScreenProps) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [province, setProvince] = useState('');
  const [coverageDrafts, setCoverageDrafts] = useState<CoverageAreaDraft[]>([emptyCoverageDraft()]);
  const [showPassword, setShowPassword] = useState(false);
  const theme = usePostaTheme();
  const meta = MODE_META[mode];
  const ModeIcon = meta.icon;

  const toggleTheme = () => {
    applyPostaTheme(theme === 'dark' ? 'paper' : 'dark');
  };

  const resetForm = () => {
    setUsername('');
    setPassword('');
    setName('');
    setCity('');
    setProvince('');
    setCoverageDrafts([emptyCoverageDraft()]);
  };

  const switchMode = (next: AuthMode) => {
    setMode(next);
    resetForm();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;

    if (mode === 'login') {
      onLogin(username, password);
      return;
    }

    if (!name.trim()) return;
    const data: RegisterData = {
      username,
      password,
      name: name.trim(),
      city: city.trim() || undefined,
      province: province.trim() || undefined,
    };
    if (mode === 'register-agency') {
      onRegisterAgency({
        ...data,
        coverageAreas: draftsToCoverageAreas(coverageDrafts),
      });
    } else {
      onRegisterSeller(data);
    }
  };

  const isRegister = mode !== 'login';
  const isAgencyRegister = mode === 'register-agency';
  const agencyCoverageValid = !isAgencyRegister || coverageDraftsAreValid(coverageDrafts);
  const submitDisabled =
    loading || !username || !password || (isRegister && !name.trim()) || !agencyCoverageValid;

  const credentialsFields = (
    <>
      <div>
        <label className="mono-label block mb-1.5">Usuario</label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)]">
            <UserIcon className="w-4 h-4" />
          </span>
          <input
            type="text"
            required
            disabled={loading}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Mínimo 3 caracteres"
            className={`${inputClass} pl-10`}
          />
        </div>
      </div>
      <div>
        <label className="mono-label block mb-1.5">Contraseña</label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)]">
            <Key className="w-4 h-4" />
          </span>
          <input
            type={showPassword ? 'text' : 'password'}
            required
            disabled={loading}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={isRegister ? 'Mínimo 6 caracteres' : '••••••••'}
            className={`${inputClass} pl-10 pr-10`}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)] hover:text-[var(--color-text)] transition"
            aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </>
  );

  const profileFields = isRegister ? (
    <>
      <div>
        <label className="mono-label block mb-1.5">
          {isAgencyRegister ? 'Nombre de la agencia' : 'Nombre del vendedor / tienda'}
        </label>
        <input
          type="text"
          required
          disabled={loading}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={isAgencyRegister ? 'Ej: Logística Rápida BA' : 'Ej: Mi Tienda Online'}
          className={inputClass}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="mono-label block mb-1.5">Ciudad</label>
          <input
            type="text"
            disabled={loading}
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="Opcional"
            className={inputClass}
          />
        </div>
        <div>
          <label className="mono-label block mb-1.5">Provincia</label>
          <input
            type="text"
            disabled={loading}
            value={province}
            onChange={(e) => setProvince(e.target.value)}
            placeholder="Opcional"
            className={inputClass}
          />
        </div>
      </div>
    </>
  ) : null;

  return (
    <div
      className="app-viewport safe-top safe-bottom min-h-[100dvh] bg-[var(--surface-bg)] grid lg:grid-cols-[minmax(280px,38%)_1fr] xl:grid-cols-[minmax(320px,42%)_1fr]"
      id="login-container"
    >
      {/* Panel lateral — desktop */}
      <aside className="hidden lg:flex flex-col relative border-r border-[var(--surface-border)] bg-[var(--surface-panel)]/60 overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.04] pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(var(--color-accent) 1px, transparent 1px), linear-gradient(90deg, var(--color-accent) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />
        <div className="relative flex flex-col h-full p-8 xl:p-10">
          <div className="flex items-start justify-between gap-4 mb-10">
            <PostaLogo variant={theme === 'paper' ? 'paper' : 'dark'} size={48} className="[&_svg]:w-11 [&_svg]:h-11" />
            <ThemeToggle theme={theme} onToggle={toggleTheme} compact />
          </div>

          <div className="flex-1 flex flex-col justify-center max-w-md">
            <p className="mono-label text-[var(--color-accent)] mb-3">{meta.subtitle}</p>
            <h1 className="font-display text-2xl xl:text-3xl font-semibold tracking-[-0.03em] text-[var(--color-text)] leading-tight mb-4">
              {meta.title}
            </h1>
            <p className="text-sm text-[var(--color-text-muted)] leading-relaxed mb-8">{meta.description}</p>

            <ul className="space-y-4">
              {meta.highlights.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-start gap-3 text-sm text-[var(--ink-soft)]">
                  <span className="shrink-0 w-9 h-9 rounded-lg bg-[var(--color-accent)]/10 border border-[var(--color-accent)]/20 flex items-center justify-center">
                    <Icon className="w-4 h-4 text-[var(--color-accent)]" />
                  </span>
                  <span className="pt-1.5 leading-snug">{text}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="pt-8 border-t border-[var(--surface-border)]">
            <p className="text-[11px] font-mono text-[var(--color-text-faint)] uppercase tracking-wider">
              Marketplace de envíos · Argentina
            </p>
            <a
              href="/"
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-mono font-bold uppercase tracking-wider text-[var(--color-text-muted)] hover:text-[var(--color-accent)] transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Volver al inicio
            </a>
          </div>
        </div>
      </aside>

      {/* Panel principal — formulario */}
      <main className="flex flex-col min-h-[100dvh] relative overflow-y-auto">
        <div className="lg:hidden flex items-center justify-between gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2">
          <PostaLogo variant={theme === 'paper' ? 'paper' : 'dark'} size={36} />
          <ThemeToggle theme={theme} onToggle={toggleTheme} compact />
        </div>

        <div className="flex-1 flex items-start lg:items-center justify-center px-4 sm:px-6 lg:px-8 xl:px-12 py-4 lg:py-8 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div
            className={`w-full ${
              isAgencyRegister ? 'max-w-3xl xl:max-w-6xl' : 'max-w-lg xl:max-w-xl'
            }`}
          >
            {/* Encabezado móvil / tablet */}
            <div className="lg:hidden mb-4 sm:mb-5">
              <div className="flex items-center gap-2 mb-2">
                <ModeIcon className="w-4 h-4 text-[var(--color-accent)]" />
                <h1 className="font-display text-lg font-semibold text-[var(--color-text)]">{meta.title}</h1>
              </div>
              <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">{meta.description}</p>
            </div>

            <PaperCard className="p-4 sm:p-6 lg:p-8 shadow-lg lg:shadow-xl border border-[var(--surface-border)]">
              {/* Tabs */}
              <div className="flex flex-wrap gap-1.5 sm:gap-2 p-1 rounded-xl bg-[var(--surface-panel-2)] border border-[var(--surface-border)] mb-6">
                <ModeTab active={mode === 'login'} onClick={() => switchMode('login')}>
                  Ingresar
                </ModeTab>
                <ModeTab active={mode === 'register-agency'} onClick={() => switchMode('register-agency')}>
                  Agencia
                </ModeTab>
                <ModeTab active={mode === 'register-seller'} onClick={() => switchMode('register-seller')}>
                  Vendedor
                </ModeTab>
              </div>

              <div className="hidden lg:flex items-center gap-2 mb-2">
                <ModeIcon className="w-4 h-4 text-[var(--color-accent)]" />
                <h2 className="font-display text-lg font-semibold tracking-[-0.02em] text-[var(--color-text)]">
                  {meta.title}
                </h2>
              </div>
              <p className="hidden lg:block text-xs text-[var(--color-text-muted)] mb-5">{meta.description}</p>

              {error && (
                <div className="bg-[var(--color-danger)]/10 border border-[var(--color-danger)]/30 text-[var(--color-danger)] text-sm rounded-lg p-3 mb-5 font-medium flex items-start gap-2 animate-shake">
                  <Shield className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit}>
                {isAgencyRegister ? (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 pb-2 border-b border-[var(--surface-border)]">
                        <CheckCircle2 className="w-4 h-4 text-[var(--color-accent)]" />
                        <p className="text-xs font-mono font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
                          Datos de la cuenta
                        </p>
                      </div>
                      {profileFields}
                      {credentialsFields}
                    </div>
                    <div className="space-y-3 lg:border-l lg:border-[var(--surface-border)] lg:pl-8">
                      <div className="flex items-center gap-2 pb-2 border-b border-[var(--surface-border)]">
                        <MapPin className="w-4 h-4 text-[var(--color-accent)]" />
                        <p className="text-xs font-mono font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
                          Cobertura y tarifas
                        </p>
                      </div>
                      <CoverageAreasEditor
                        value={coverageDrafts}
                        onChange={setCoverageDrafts}
                        disabled={loading}
                        grid
                        hideHeader
                      />
                    </div>
                    <div className="lg:col-span-2 pt-5 border-t border-[var(--surface-border)]">
                      <PostaButton
                        type="submit"
                        disabled={submitDisabled}
                        id="btn-login-submit"
                        className="w-full py-3 text-sm lg:max-w-sm"
                      >
                        {loading ? 'Procesando...' : 'Crear cuenta de agencia'}
                      </PostaButton>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="space-y-4 max-w-md lg:max-w-none mx-auto lg:mx-0">
                      {profileFields}
                      {credentialsFields}
                    </div>
                    <div className="mt-6 pt-5 border-t border-[var(--surface-border)]">
                      <PostaButton
                        type="submit"
                        disabled={submitDisabled}
                        id="btn-login-submit"
                        className="w-full py-3 text-sm"
                      >
                        {loading
                          ? 'Procesando...'
                          : mode === 'login'
                            ? 'Ingresar al panel'
                            : 'Crear cuenta de vendedor'}
                      </PostaButton>
                    </div>
                  </>
                )}
              </form>
            </PaperCard>

            <a
              href="/"
              className="lg:hidden mt-5 inline-flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] hover:text-[var(--color-accent)] transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Volver al inicio
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
