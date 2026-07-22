/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { loadGoogleIdentityScript } from '../utils/googleIdentity.ts';

interface GoogleSignInButtonProps {
  clientId: string;
  onCredential: (idToken: string) => void;
  onError?: (message: string) => void;
  disabled?: boolean;
  text?: 'signin_with' | 'signup_with' | 'continue_with';
  className?: string;
}

const LABELS: Record<NonNullable<GoogleSignInButtonProps['text']>, string> = {
  continue_with: 'Continuar con Google',
  signin_with: 'Ingresar con Google',
  signup_with: 'Registrarse con Google',
};

function GoogleGIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="#EA4335"
        d="M12 10.2v3.6h5.1c-.2 1.2-.9 2.3-1.9 3l3.1 2.4c1.8-1.7 2.9-4.1 2.9-7 0-.7-.1-1.3-.2-1.9H12z"
      />
      <path
        fill="#34A853"
        d="M6.6 14.3l-.5.4-2.9 2.2C4.9 19.5 8.2 21.5 12 21.5c2.4 0 4.4-.8 5.9-2.2l-3.1-2.4c-.8.6-1.9.9-2.8.9-2.2 0-4-1.5-4.7-3.5z"
      />
      <path
        fill="#4A90E2"
        d="M3.2 7.1C2.4 8.7 2 10.3 2 12s.4 3.3 1.2 4.9l3.4-2.6C6.2 13.4 6 12.7 6 12s.2-1.4.5-2.1L3.2 7.1z"
      />
      <path
        fill="#FBBC05"
        d="M12 5.5c1.3 0 2.5.5 3.4 1.3l2.6-2.6C16.4 2.6 14.4 1.8 12 1.8 8.2 1.8 4.9 3.9 3.2 7.1l3.4 2.6C8 7 9.8 5.5 12 5.5z"
      />
    </svg>
  );
}

export default function GoogleSignInButton({
  clientId,
  onCredential,
  onError,
  disabled = false,
  text = 'continue_with',
  className = '',
}: GoogleSignInButtonProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const gisRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const callbackRef = useRef(onCredential);
  const errorRef = useRef(onError);

  useEffect(() => {
    callbackRef.current = onCredential;
    errorRef.current = onError;
  }, [onCredential, onError]);

  useEffect(() => {
    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;
    let lastWidth = 0;

    const mount = async () => {
      try {
        await loadGoogleIdentityScript();
        if (cancelled || !gisRef.current || !hostRef.current || !window.google?.accounts?.id) {
          return;
        }

        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => {
            if (response?.credential) {
              callbackRef.current(response.credential);
            } else {
              errorRef.current?.('No se pudo obtener la cuenta de Google.');
            }
          },
          auto_select: false,
          cancel_on_tap_outside: true,
        });

        const render = () => {
          if (!gisRef.current || !hostRef.current || !window.google?.accounts?.id) return;
          const width = Math.max(Math.floor(hostRef.current.offsetWidth), 240);
          if (Math.abs(width - lastWidth) < 8 && lastWidth > 0) return;
          lastWidth = width;
          gisRef.current.innerHTML = '';
          window.google.accounts.id.renderButton(gisRef.current, {
            theme: 'outline',
            size: 'large',
            text,
            shape: 'rectangular',
            width,
            locale: 'es',
          });
          setReady(true);
        };

        render();
        resizeObserver = new ResizeObserver(() => render());
        resizeObserver.observe(hostRef.current);
      } catch {
        errorRef.current?.('No se pudo cargar Google Sign-In.');
      }
    };

    void mount();
    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
    };
  }, [clientId, text]);

  const label = LABELS[text];

  return (
    <div
      ref={hostRef}
      className={`auth-google ${disabled ? 'auth-google--disabled' : ''} ${!ready ? 'auth-google--loading' : ''} ${className}`.trim()}
    >
      <div className="auth-google__face" aria-hidden="true">
        <span className="auth-google__icon-wrap">
          <GoogleGIcon className="auth-google__g" />
        </span>
        <span className="auth-google__label">{ready ? label : 'Cargando Google…'}</span>
      </div>
      {/* Capa clickeable oficial de Google (invisible) encima del diseño Posta */}
      <div
        ref={gisRef}
        className="auth-google__gis"
        title={label}
        aria-label={label}
      />
    </div>
  );
}
