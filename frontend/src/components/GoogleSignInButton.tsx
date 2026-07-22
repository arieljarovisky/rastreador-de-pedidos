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
  /** Texto del botón GIS */
  text?: 'signin_with' | 'signup_with' | 'continue_with';
  className?: string;
}

export default function GoogleSignInButton({
  clientId,
  onCredential,
  onError,
  disabled = false,
  text = 'continue_with',
  className = '',
}: GoogleSignInButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const callbackRef = useRef(onCredential);
  const errorRef = useRef(onError);

  useEffect(() => {
    callbackRef.current = onCredential;
    errorRef.current = onError;
  }, [onCredential, onError]);

  useEffect(() => {
    let cancelled = false;

    const mount = async () => {
      try {
        await loadGoogleIdentityScript();
        if (cancelled || !containerRef.current || !window.google?.accounts?.id) return;

        containerRef.current.innerHTML = '';
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

        const width = Math.min(containerRef.current.offsetWidth || 320, 400);
        window.google.accounts.id.renderButton(containerRef.current, {
          theme: 'outline',
          size: 'large',
          text,
          shape: 'rectangular',
          width,
          locale: 'es',
        });
        setReady(true);
      } catch {
        errorRef.current?.('No se pudo cargar Google Sign-In.');
      }
    };

    void mount();
    return () => {
      cancelled = true;
    };
  }, [clientId, text]);

  return (
    <div
      className={`auth-google ${disabled ? 'auth-google--disabled' : ''} ${className}`.trim()}
      aria-busy={!ready}
    >
      <div ref={containerRef} className="auth-google__btn" />
    </div>
  );
}
