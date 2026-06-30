/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Shield, Key, Eye, EyeOff, Lock, User as UserIcon, Building2, Store, ArrowLeft } from 'lucide-react';
import PostaLogo from './ui/PostaLogo.tsx';
import PostaButton from './ui/PostaButton.tsx';
import PaperCard from './ui/PaperCard.tsx';
import ThemeToggle from './ui/ThemeToggle.tsx';
import { applyPostaTheme, usePostaTheme } from '../theme/usePostaTheme.ts';

type AuthMode = 'login' | 'register-agency' | 'register-seller';

interface RegisterData {
  username: string;
  password: string;
  name: string;
  city?: string;
  province?: string;
}

interface LoginScreenProps {
  onLogin: (username: string, password: string) => Promise<void>;
  onRegisterAgency: (data: RegisterData) => Promise<void>;
  onRegisterSeller: (data: RegisterData) => Promise<void>;
  loading: boolean;
  error: string | null;
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
  const [showPassword, setShowPassword] = useState(false);
  const theme = usePostaTheme();

  const toggleTheme = () => {
    applyPostaTheme(theme === 'dark' ? 'paper' : 'dark');
  };

  const resetForm = () => {
    setUsername('');
    setPassword('');
    setName('');
    setCity('');
    setProvince('');
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
      onRegisterAgency(data);
    } else {
      onRegisterSeller(data);
    }
  };

  const isRegister = mode !== 'login';

  return (
    <div className="app-viewport safe-top safe-bottom min-h-[100dvh] flex flex-col items-center justify-center p-3 sm:p-4 md:p-6 bg-[var(--surface-bg)] relative" id="login-container">
      <div className="absolute top-[max(0.75rem,env(safe-area-inset-top))] right-3 sm:right-4">
        <ThemeToggle theme={theme} onToggle={toggleTheme} compact />
      </div>
      <div className="mb-4 sm:mb-6 text-center w-full max-w-md">
        <PostaLogo variant={theme === 'paper' ? 'paper' : 'dark'} size={44} className="justify-center mb-2 sm:mb-3 sm:[&_svg]:w-12 sm:[&_svg]:h-12" />
        <p className="mono-label text-[var(--color-text-muted)] mt-2">
          Marketplace de envíos · Argentina
        </p>
      </div>

      <PaperCard className="w-full max-w-sm sm:max-w-md p-4 sm:p-6 relative overflow-hidden">
        <div className="flex bg-[var(--surface-panel-2)] p-0.5 rounded border border-[var(--surface-border)] mb-4 text-[10px]">
          <button
            type="button"
            onClick={() => switchMode('login')}
            className={`flex-1 py-1.5 rounded font-mono font-bold uppercase tracking-wider transition ${
              mode === 'login' ? 'bg-[var(--surface-panel)] text-[var(--color-text)] border border-[var(--ink)]/10' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
            }`}
          >
            Ingresar
          </button>
          <button
            type="button"
            onClick={() => switchMode('register-agency')}
            className={`flex-1 py-1.5 rounded font-mono font-bold uppercase tracking-wider transition ${
              mode === 'register-agency' ? 'bg-[var(--surface-panel)] text-[var(--color-text)] border border-[var(--ink)]/10' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
            }`}
          >
            Agencia
          </button>
          <button
            type="button"
            onClick={() => switchMode('register-seller')}
            className={`flex-1 py-1.5 rounded font-mono font-bold uppercase tracking-wider transition ${
              mode === 'register-seller' ? 'bg-[var(--surface-panel)] text-[var(--color-text)] border border-[var(--ink)]/10' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
            }`}
          >
            Vendedor
          </button>
        </div>

        <h2 className="font-display text-sm font-semibold tracking-[-0.02em] text-[var(--color-text)] mb-1 flex items-center gap-1.5">
          {mode === 'login' && <><Lock className="w-3.5 h-3.5 text-[var(--color-accent)]" /> Iniciar sesión</>}
          {mode === 'register-agency' && <><Building2 className="w-3.5 h-3.5 text-[var(--color-accent)]" /> Crear cuenta de agencia</>}
          {mode === 'register-seller' && <><Store className="w-3.5 h-3.5 text-[var(--color-accent)]" /> Crear cuenta de vendedor</>}
        </h2>
        <p className="mono-label mb-4">Acceso operadores</p>

        {mode === 'register-agency' && (
          <p className="text-xs text-[var(--color-text-muted)] mb-3 leading-relaxed">
            Registrá tu empresa de logística. Podés ofrecer envíos en el día, turbo y servicios personalizados en todo el país.
          </p>
        )}

        {mode === 'register-seller' && (
          <p className="text-xs text-[var(--color-text-muted)] mb-3 leading-relaxed">
            Registrate como vendedor, conectá tu ecommerce y elegí la agencia que enviará tus pedidos.
          </p>
        )}

        {mode === 'login' && (
          <p className="text-xs text-[var(--color-text-muted)] mb-3 leading-relaxed">
            Agencia, vendedor o repartidor: usá tus credenciales para ingresar.
          </p>
        )}

        {error && (
          <div className="bg-[var(--color-danger)]/10 border border-[var(--color-danger)]/30 text-[var(--color-danger)] text-xs rounded p-2.5 mb-4 font-medium flex items-start gap-1.5 animate-shake">
            <Shield className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          {isRegister && (
            <div>
              <label className="mono-label block mb-1">
                {mode === 'register-agency' ? 'Nombre de la agencia' : 'Nombre del vendedor / tienda'}
              </label>
              <input
                type="text"
                required
                disabled={loading}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={mode === 'register-agency' ? 'Ej: Logística Rápida BA' : 'Ej: Mi Tienda Online'}
                className="w-full bg-[var(--paper)] border border-[var(--surface-border)] rounded py-2 px-3 text-xs text-[var(--color-text)] placeholder:text-[var(--color-text-faint)] focus:outline-none focus:border-[var(--color-accent)] transition disabled:opacity-50"
              />
            </div>
          )}

          {isRegister && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mono-label block mb-1">Ciudad</label>
                <input
                  type="text"
                  disabled={loading}
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Opcional"
                  className="w-full bg-[var(--paper)] border border-[var(--surface-border)] rounded py-2 px-3 text-xs text-[var(--color-text)] placeholder:text-[var(--color-text-faint)] focus:outline-none focus:border-[var(--color-accent)] transition disabled:opacity-50"
                />
              </div>
              <div>
                <label className="mono-label block mb-1">Provincia</label>
                <input
                  type="text"
                  disabled={loading}
                  value={province}
                  onChange={(e) => setProvince(e.target.value)}
                  placeholder="Opcional"
                  className="w-full bg-[var(--paper)] border border-[var(--surface-border)] rounded py-2 px-3 text-xs text-[var(--color-text)] placeholder:text-[var(--color-text-faint)] focus:outline-none focus:border-[var(--color-accent)] transition disabled:opacity-50"
                />
              </div>
            </div>
          )}

          <div>
            <label className="mono-label block mb-1">Usuario</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)]">
                <UserIcon className="w-3.5 h-3.5" />
              </span>
              <input
                type="text"
                required
                disabled={loading}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="mínimo 3 caracteres"
                className="w-full bg-[var(--paper)] border border-[var(--surface-border)] rounded py-2 pl-9 pr-3 text-xs text-[var(--color-text)] placeholder:text-[var(--color-text-faint)] focus:outline-none focus:border-[var(--color-accent)] transition disabled:opacity-50"
              />
            </div>
          </div>

          <div>
            <label className="mono-label block mb-1">Contraseña</label>
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
                placeholder={isRegister ? 'mínimo 6 caracteres' : '••••••••'}
                className="w-full bg-[var(--paper)] border border-[var(--surface-border)] rounded py-2 pl-9 pr-9 text-xs text-[var(--color-text)] placeholder:text-[var(--color-text-faint)] focus:outline-none focus:border-[var(--color-accent)] transition disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)] hover:text-[var(--color-text)] transition"
              >
                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <PostaButton
            type="submit"
            disabled={loading || !username || !password || (isRegister && !name.trim())}
            id="btn-login-submit"
            className="w-full mt-2"
          >
            {loading
              ? 'Procesando...'
              : mode === 'login'
                ? 'Ingresar al panel'
                : mode === 'register-agency'
                  ? 'Crear cuenta de agencia'
                  : 'Crear cuenta de vendedor'}
          </PostaButton>
        </form>
      </PaperCard>

      <a
        href="/"
        className="mt-5 inline-flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] hover:text-[var(--color-accent)] transition"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Volver al inicio
      </a>
    </div>
  );
}
