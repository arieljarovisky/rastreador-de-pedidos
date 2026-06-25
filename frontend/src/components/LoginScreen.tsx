/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Shield, Key, Eye, EyeOff, Lock, User as UserIcon } from 'lucide-react';

interface LoginScreenProps {
  onLogin: (username: string, password: string) => Promise<void>;
  loading: boolean;
  error: string | null;
}

export default function LoginScreen({ onLogin, loading, error }: LoginScreenProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;
    onLogin(username, password);
  };

  const handleQuickLogin = (user: string, pass: string) => {
    setUsername(user);
    setPassword(pass);
    onLogin(user, pass);
  };

  return (
    <div className="min-h-screen bg-[#09090b] flex flex-col items-center justify-center p-4" id="login-container">
      {/* Brand Header */}
      <div className="mb-6 text-center">
        <div className="w-14 h-14 bg-gradient-to-tr from-blue-600 to-sky-500 rounded flex items-center justify-center shadow-xl mx-auto mb-3 border border-blue-400/20">
          <span className="text-2xl">🏍️</span>
        </div>
        <h1 className="text-xl font-bold font-sans tracking-tight text-white">LupoEnvios</h1>
        <p className="text-[10px] text-blue-500 font-mono tracking-widest mt-1 uppercase font-bold">Logística Interna y Tracking Realtime</p>
      </div>

      {/* Main Card (High Density) */}
      <div className="bg-zinc-900/30 border border-zinc-800 rounded-lg w-full max-w-sm p-6 shadow-2xl relative overflow-hidden">
        {/* Decorative corner glow */}
        <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full blur-2xl -z-10"></div>
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-zinc-500/5 rounded-full blur-2xl -z-10"></div>

        <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-4 flex items-center gap-1.5">
          <Lock className="w-3.5 h-3.5 text-blue-500" /> Iniciar Sesión de Operador
        </h2>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded p-2.5 mb-4 font-medium flex items-start gap-1.5 animate-shake">
            <Shield className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Username Input */}
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
                placeholder="Ej: carlos"
                className="w-full bg-zinc-950 border border-zinc-800 rounded py-2 pl-9 pr-3 text-xs text-zinc-100 placeholder-zinc-700 focus:outline-none focus:border-blue-500 transition disabled:opacity-50 font-sans"
              />
            </div>
          </div>

          {/* Password Input */}
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
                placeholder="••••••••"
                className="w-full bg-zinc-950 border border-zinc-800 rounded py-2 pl-9 pr-9 text-xs text-zinc-100 placeholder-zinc-700 focus:outline-none focus:border-blue-500 transition disabled:opacity-50 font-sans"
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

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading || !username || !password}
            id="btn-login-submit"
            className="w-full bg-blue-600 hover:bg-blue-500 text-white py-2 px-3 rounded font-bold text-xs uppercase tracking-wider transition disabled:opacity-50 disabled:cursor-not-allowed mt-2 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-3 w-3 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Autenticando...</span>
              </>
            ) : (
              <span>Ingresar al Panel</span>
            )}
          </button>
        </form>

        {/* Quick Testing Selection Access */}
        <div className="mt-5 border-t border-zinc-800 pt-4">
          <p className="text-[9px] font-mono tracking-widest text-zinc-500 text-center uppercase mb-2.5 font-bold">
            Acceso Rápido de Pruebas
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={() => handleQuickLogin('admin', 'admin123')}
              id="btn-quick-admin"
              className="p-2 rounded bg-zinc-950 hover:bg-blue-950/20 border border-zinc-800 hover:border-blue-500/30 text-left transition text-[10px] shrink-0 flex flex-col"
            >
              <span className="font-bold text-zinc-200">🛒 Ventas (Local)</span>
              <span className="text-[8px] text-blue-400 font-mono mt-0.5 uppercase tracking-tighter">Registra Pedidos</span>
            </button>
            <button
              onClick={() => handleQuickLogin('logistica', 'logistica123')}
              id="btn-quick-logistica"
              className="p-2 rounded bg-zinc-950 hover:bg-blue-950/20 border border-zinc-800 hover:border-blue-500/30 text-left transition text-[10px] shrink-0 flex flex-col"
            >
              <span className="font-bold text-zinc-200">⚙️ Logística</span>
              <span className="text-[8px] text-purple-400 font-mono mt-0.5 uppercase tracking-tighter">Asigna y Monitorea</span>
            </button>
            <button
              onClick={() => handleQuickLogin('carlos', 'carlos123')}
              id="btn-quick-carlos"
              className="p-2 rounded bg-zinc-950 hover:bg-blue-950/20 border border-zinc-800 hover:border-blue-500/30 text-left transition text-[10px] shrink-0 flex flex-col"
            >
              <span className="font-bold text-zinc-200">🏍️ Carlos Gómez</span>
              <span className="text-[8px] text-zinc-500 font-mono mt-0.5 uppercase tracking-tighter">En Camino / GPS</span>
            </button>
            <button
              onClick={() => handleQuickLogin('maria', 'maria123')}
              id="btn-quick-maria"
              className="p-2 rounded bg-zinc-950 hover:bg-blue-950/20 border border-zinc-800 hover:border-blue-500/30 text-left transition text-[10px] shrink-0 flex flex-col"
            >
              <span className="font-bold text-zinc-200">🏍️ María Rdgz</span>
              <span className="text-[8px] text-zinc-500 font-mono mt-0.5 uppercase tracking-tighter">Pend. Asignación</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
