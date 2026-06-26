/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Shield, Key, Eye, EyeOff, Lock, User as UserIcon, Building2 } from 'lucide-react';
import { ui } from '../styles/ui.ts';

type AuthMode = 'login' | 'register-agency';

interface RegisterData {
  username: string;
  password: string;
  name: string;
}

interface LoginScreenProps {
  onLogin: (username: string, password: string) => Promise<void>;
  onRegisterAgency: (data: RegisterData) => Promise<void>;
  loading: boolean;
  error: string | null;
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
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const resetForm = () => {
    setUsername('');
    setPassword('');
    setName('');
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
    onRegisterAgency({ username, password, name: name.trim() });
  };

  const handleQuickLogin = (user: string, pass: string) => {
    switchMode('login');
    setUsername(user);
    setPassword(pass);
    onLogin(user, pass);
  };

  const isRegister = mode !== 'login';

  return (
    <div className={`${ui.shell} items-center justify-center p-6`} id="login-container">
      <div className="mb-8 text-center max-w-sm">
        <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[#5b8aff] to-[#3d63d9] flex items-center justify-center shadow-xl shadow-blue-900/25 mx-auto mb-4 ring-1 ring-white/10">
          <span className="text-2xl font-bold text-white">LP</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--lupo-text)]">LupoEnvios</h1>
        <p className="text-sm text-[var(--lupo-text-muted)] mt-2 leading-relaxed">
          Plataforma de seguimiento logístico en tiempo real
        </p>
      </div>

      <div className={ui.loginCard}>
        <div className="flex p-1 rounded-lg border border-[var(--lupo-border-subtle)] bg-[var(--lupo-bg)] mb-5 gap-1">
          <button
            type="button"
            onClick={() => switchMode('login')}
            className={mode === 'login' ? ui.segmentActive : ui.segment}
          >
            Ingresar
          </button>
          <button
            type="button"
            onClick={() => switchMode('register-agency')}
            className={mode === 'register-agency' ? `${ui.segment} bg-purple-600 text-white shadow-md` : ui.segment}
          >
            Agencia
          </button>
        </div>

        <h2 className="text-sm font-semibold text-[var(--lupo-text)] mb-1 flex items-center gap-2">
          {mode === 'login' ? (
            <>
              <Lock className="w-4 h-4 text-[var(--lupo-accent)]" /> Iniciar sesión
            </>
          ) : (
            <>
              <Building2 className="w-4 h-4 text-purple-400" /> Crear cuenta de agencia
            </>
          )}
        </h2>

        <p className={`${ui.hint} mb-4`}>
          {mode === 'register-agency'
            ? 'Registrá tu empresa de logística y gestioná vendedores, repartidores y envíos.'
            : 'Si sos vendedor, usá las credenciales que te dio tu agencia.'}
        </p>

        {error && (
          <div className="bg-red-500/10 border border-red-500/25 text-red-300 text-sm rounded-lg p-3 mb-4 flex items-start gap-2 animate-shake">
            <Shield className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {isRegister && (
            <div>
              <label className={ui.label}>Nombre de la agencia</label>
              <input
                type="text"
                required
                disabled={loading}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: Logística Rápida BA"
                className={ui.input}
              />
            </div>
          )}

          <div>
            <label className={ui.label}>Usuario</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--lupo-text-muted)]">
                <UserIcon className="w-4 h-4" />
              </span>
              <input
                type="text"
                required
                disabled={loading}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Mínimo 3 caracteres"
                className={`${ui.input} pl-10`}
              />
            </div>
          </div>

          <div>
            <label className={ui.label}>Contraseña</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--lupo-text-muted)]">
                <Key className="w-4 h-4" />
              </span>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                disabled={loading}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isRegister ? 'Mínimo 6 caracteres' : '••••••••'}
                className={`${ui.input} pl-10 pr-10`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--lupo-text-muted)] hover:text-[var(--lupo-text-secondary)] transition"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !username || !password || (isRegister && !name.trim())}
            id="btn-login-submit"
            className={`${ui.btnPrimary} w-full mt-2`}
          >
            {loading
              ? 'Procesando…'
              : mode === 'login'
                ? 'Ingresar al panel'
                : 'Crear cuenta de agencia'}
          </button>
        </form>

        {mode === 'login' && (
          <div className="mt-6 border-t border-[var(--lupo-border-subtle)] pt-5">
            <p className="text-xs font-medium text-[var(--lupo-text-muted)] text-center mb-3">
              Acceso rápido demo
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleQuickLogin('admin', 'admin123')}
                className={`${ui.card} ${ui.cardInteractive} text-left text-xs py-2.5`}
              >
                <span className="font-semibold text-[var(--lupo-text)]">Vendedor</span>
                <span className="block text-[var(--lupo-text-muted)] mt-0.5">admin / admin123</span>
              </button>
              <button
                type="button"
                onClick={() => handleQuickLogin('logistica', 'logistica123')}
                className={`${ui.card} ${ui.cardInteractive} text-left text-xs py-2.5`}
              >
                <span className="font-semibold text-[var(--lupo-text)]">Agencia</span>
                <span className="block text-[var(--lupo-text-muted)] mt-0.5">logistica / logistica123</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
