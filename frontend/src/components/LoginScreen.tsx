/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Shield, Key, Eye, EyeOff, Lock, User as UserIcon, Building2 } from 'lucide-react';
import PostaLogo from './ui/PostaLogo.tsx';
import PostaButton from './ui/PostaButton.tsx';
import PaperCard from './ui/PaperCard.tsx';
import TicketDivider from './ui/TicketDivider.tsx';

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
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-[var(--surface-bg)]" data-theme="paper" id="login-container">
      <div className="mb-6 text-center">
        <PostaLogo variant="paper" size={48} className="justify-center mb-3" />
        <p className="mono-label text-[var(--color-text-muted)] mt-2">
          Hoja de ruta · CABA y GBA
        </p>
      </div>

      <PaperCard className="w-full max-w-sm p-6 relative overflow-hidden">
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
        </div>

        <h2 className="font-display text-sm font-semibold tracking-[-0.02em] text-[var(--color-text)] mb-1 flex items-center gap-1.5">
          {mode === 'login' && <><Lock className="w-3.5 h-3.5 text-[var(--color-accent)]" /> Iniciar sesión</>}
          {mode === 'register-agency' && <><Building2 className="w-3.5 h-3.5 text-[var(--color-accent)]" /> Crear cuenta de agencia</>}
        </h2>
        <p className="mono-label mb-4">Acceso operadores</p>

        {mode === 'register-agency' && (
          <p className="text-xs text-[var(--color-text-muted)] mb-3 leading-relaxed">
            Registrá tu empresa de logística. Desde el panel podrás crear cuentas para tus vendedores y asignarles envíos.
          </p>
        )}

        {mode === 'login' && (
          <p className="text-xs text-[var(--color-text-muted)] mb-3 leading-relaxed">
            Si sos vendedor, usá las credenciales que te dio tu agencia de logística.
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
              <label className="mono-label block mb-1">Nombre de la agencia</label>
              <input
                type="text"
                required
                disabled={loading}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: Logística Rápida BA"
                className="w-full bg-[var(--paper)] border border-[var(--surface-border)] rounded py-2 px-3 text-xs text-[var(--color-text)] placeholder:text-[var(--color-text-faint)] focus:outline-none focus:border-[var(--color-accent)] transition disabled:opacity-50"
              />
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
                : 'Crear cuenta de agencia'}
          </PostaButton>
        </form>

        {mode === 'login' && (
          <>
            <TicketDivider className="my-5" />
            <p className="mono-label text-center mb-2.5">Acceso rápido demo</p>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => handleQuickLogin('admin', 'admin123')}
                className="p-2 rounded bg-[var(--paper)] border border-[var(--surface-border)] text-left transition text-[10px] hover:bg-[var(--surface-panel-2)]"
              >
                <span className="font-semibold text-[var(--color-text)]">Vendedor demo</span>
              </button>
              <button
                type="button"
                onClick={() => handleQuickLogin('logistica', 'logistica123')}
                className="p-2 rounded bg-[var(--paper)] border border-[var(--surface-border)] text-left transition text-[10px] hover:bg-[var(--surface-panel-2)]"
              >
                <span className="font-semibold text-[var(--color-text)]">Agencia demo</span>
              </button>
            </div>
          </>
        )}
      </PaperCard>
    </div>
  );
}
