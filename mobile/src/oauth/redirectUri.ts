import Constants from 'expo-constants';

/** Debe coincidir con el redirect del backend tras OAuth (`lupo://oauth/callback`). */
export function getOAuthRedirectUri(): string {
  const scheme = String(Constants.expoConfig?.scheme ?? 'lupo');
  return `${scheme}://oauth/callback`;
}
