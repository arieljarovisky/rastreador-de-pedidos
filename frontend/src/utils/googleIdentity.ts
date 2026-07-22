/** Tipos mínimos de Google Identity Services (GIS). */
export interface GoogleCredentialResponse {
  credential: string;
  select_by?: string;
}

export interface GoogleAccountsId {
  initialize: (config: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
    context?: string;
  }) => void;
  prompt: (notification?: (n: { isNotDisplayed: () => boolean; isSkippedMoment: () => boolean }) => void) => void;
  renderButton: (
    parent: HTMLElement,
    options: {
      theme?: 'outline' | 'filled_blue' | 'filled_black';
      size?: 'large' | 'medium' | 'small';
      text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
      shape?: 'rectangular' | 'pill' | 'circle' | 'square';
      width?: number;
      locale?: string;
    }
  ) => void;
  disableAutoSelect: () => void;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: GoogleAccountsId;
      };
    };
  }
}

const GIS_SCRIPT = 'https://accounts.google.com/gsi/client';

let scriptPromise: Promise<void> | null = null;

export function loadGoogleIdentityScript(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('NO_WINDOW'));
  }
  if (window.google?.accounts?.id) {
    return Promise.resolve();
  }
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SCRIPT}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('GIS_LOAD_FAILED')));
      if (window.google?.accounts?.id) resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = GIS_SCRIPT;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error('GIS_LOAD_FAILED'));
    };
    document.head.appendChild(script);
  });

  return scriptPromise;
}

export async function requestGoogleIdToken(clientId: string): Promise<string> {
  await loadGoogleIdentityScript();
  const gis = window.google?.accounts?.id;
  if (!gis) {
    throw new Error('GIS_UNAVAILABLE');
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (credential: string) => {
      if (settled) return;
      settled = true;
      resolve(credential);
    };
    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      reject(err);
    };

    gis.initialize({
      client_id: clientId,
      callback: (response) => {
        if (response?.credential) {
          finish(response.credential);
        } else {
          fail(new Error('GOOGLE_CANCELLED'));
        }
      },
      auto_select: false,
      cancel_on_tap_outside: true,
    });

    gis.prompt((notification) => {
      if (notification?.isNotDisplayed?.() || notification?.isSkippedMoment?.()) {
        // Fallback: el One Tap no se mostró; el usuario puede usar el botón renderizado.
        // No fallamos acá: el caller también puede renderizar un botón.
      }
    });

    // Timeout si el usuario cierra One Tap sin credential
    window.setTimeout(() => {
      if (!settled) {
        fail(new Error('GOOGLE_CANCELLED'));
      }
    }, 120_000);
  });
}
