/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Shield, Key, Eye, EyeOff, Lock, User as UserIcon, Building2 } from 'lucide-react';

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
    <div className="min-h-screen bg-[#09090b] flex flex-col items-center justify-center p-4" id="login-container">
      <div className="mb-6 text-center">
        <div className="w-14 h-14 bg-gradient-to-tr from-blue-600 to-sky-500 rounded flex items-center justify-center shadow-xl mx-auto mb-3 border border-blue-400/20">
          <span className="text-2xl">🏍️</span>
        </div>
        <h1 className="text-xl font-bold font-sans tracking-tight text-white">LupoEnvios</h1>
        <p className="text-[10px] text-blue-500 font-mono tracking-widest mt-1 uppercase font-bold">
          Tracking en tiempo real para tu logística
        </p>
      </div>

      <div className="bg-zinc-900/30 border border-zinc-800 rounded-lg w-full max-w-sm p-6 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full blur-2xl -z-10"></div>

        <div className="flex bg-zinc-950 p-0.5 rounded border border-zinc-800 mb-4 text-[10px]">
          <button
            type="button"
            onClick={() => switchMode('login')}
            className={`flex-1 py-1.5 rounded font-bold uppercase tracking-wider transition ${
              mode === 'login' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            Ingresar
          </button>
          <button
            type="button"
            onClick={() => switchMode('register-agency')}
            className={`flex-1 py-1.5 rounded font-bold uppercase tracking-wider transition ${
              mode === 'register-agency' ? 'bg-purple-500/20 text-purple-300' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            Agencia
          </button>
        </div>

        <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-4 flex items-center gap-1.5">
          {mode === 'login' && <><Lock className="w-3.5 h-3.5 text-blue-500" /> Iniciar sesión</>}
          {mode === 'register-agency' && <><Building2 className="w-3.5 h-3.5 text-purple-400" /> Crear cuenta de agencia</>}
        </h2>

        {mode === 'register-agency' && (
          <p className="text-[10px] text-zinc-500 mb-3 leading-relaxed">
            Registrá tu empresa de logística. Desde el panel podrás crear cuentas para tus vendedores y asignarles envíos.
          </p>
        )}

        {mode === 'login' && (
          <p className="text-[10px] text-zinc-500 mb-3 leading-relaxed">
            Si sos vendedor, usá las credenciales que te dio tu agencia de logística.
          </p>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded p-2.5 mb-4 font-medium flex items-start gap-1.5 animate-shake">
            <Shield className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          {isRegister && (
            <div>
              <label className="block text-[9px] font-mono tracking-wider text-zinc-500 uppercase mb-1">
                Nombre de la agencia
              </label>
              <input
                type="text"
                required
                disabled={loading}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: Logística Rápida BA"
                className="w-full bg-zinc-950 border border-zinc-800 rounded py-2 px-3 text-xs text-zinc-100 placeholder-zinc-700 focus:outline-none focus:border-blue-500 transition disabled:opacity-50"
              />
            </div>
          )}

          <div>
            <label className="block text-[9px] font-mono tracking-wider text-zinc-500 uppercase mb-1">Usuario</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600">
                <UserIcon className="w-3.5 h-3.5" />
              </span>
              <input
                type="text"
                required
                disabled={loading}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="mínimo 3 caracteres"
                className="w-full bg-zinc-950 border border-zinc-800 rounded py-2 pl-9 pr-3 text-xs text-zinc-100 placeholder-zinc-700 focus:outline-none focus:border-blue-500 transition disabled:opacity-50"
              />
            </div>
          </div>

          <div>
            <label className="block text-[9px] font-mono tracking-wider text-zinc-500 uppercase mb-1">Contraseña</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600">
                <Key className="w-3.5 h-3.5" />
              </span>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                disabled={loading}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isRegister ? 'mínimo 6 caracteres' : '••••••••'}
                className="w-full bg-zinc-950 border border-zinc-800 rounded py-2 pl-9 pr-9 text-xs text-zinc-100 placeholder-zinc-700 focus:outline-none focus:border-blue-500 transition disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400 transition"
              >
                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !username || !password || (isRegister && !name.trim())}
            id="btn-login-submit"
            className="w-full bg-blue-600 hover:bg-blue-500 text-white py-2 px-3 rounded font-bold text-xs uppercase tracking-wider transition disabled:opacity-50 disabled:cursor-not-allowed mt-2"
          >
            {loading
              ? 'Procesando...'
              : mode === 'login'
                ? 'Ingresar al panel'
                : 'Crear cuenta de agencia'}
          </button>
        </form>

        {mode === 'login' && (
          <div className="mt-5 border-t border-zinc-800 pt-4">
            <p className="text-[9px] font-mono tracking-widest text-zinc-500 text-center uppercase mb-2.5 font-bold">
              Acceso rápido demo
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={() => handleQuickLogin('admin', 'admin123')}
                className="p-2 rounded bg-zinc-950 hover:bg-blue-950/20 border border-zinc-800 text-left transition text-[10px]"
              >
                <span className="font-bold text-zinc-200">🛒 Vendedor demo</span>
              </button>
              <button
                onClick={() => handleQuickLogin('logistica', 'logistica123')}
                className="p-2 rounded bg-zinc-950 hover:bg-blue-950/20 border border-zinc-800 text-left transition text-[10px]"
              >
                <span className="font-bold text-zinc-200">⚙️ Agencia demo</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
