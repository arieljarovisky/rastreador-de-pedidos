import Constants from 'expo-constants';
import * as Application from 'expo-application';

/** versionCode nativo de Android (más confiable que versionName si Gradle quedó desincronizado). */
export function getCurrentBuildVersion(): number {
  const raw = Application.nativeBuildVersion?.trim();
  if (!raw) return 0;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Versión instalada en el dispositivo (manifest nativo en builds de producción). */
export function getCurrentAppVersion(): string {
  const native = Application.nativeApplicationVersion?.trim();
  if (native) return native;

  const fromExpoConfig = Constants.expoConfig?.version?.trim();
  if (fromExpoConfig) return fromExpoConfig;

  const fromManifest =
    (Constants.manifest2 as { version?: string } | null)?.version?.trim() ??
    (Constants.manifest as { version?: string } | null)?.version?.trim();
  if (fromManifest) return fromManifest;

  return '0.0.0';
}

/** Si no podemos leer la versión real, evitamos avisos falsos de actualización. */
export function canTrustAppVersion(version: string): boolean {
  return version !== '0.0.0' && version.length > 0;
}
