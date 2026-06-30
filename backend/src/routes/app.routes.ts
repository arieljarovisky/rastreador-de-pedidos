import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { env } from '../config/env.js';

const router = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const versionFile = path.join(__dirname, '..', '..', 'downloads', 'app-version.json');

interface AppVersionConfig {
  version: string;
  minVersion: string;
  message?: string;
}

function readVersionConfig(): AppVersionConfig {
  const defaults: AppVersionConfig = {
    version: env.mobileApp.version,
    minVersion: env.mobileApp.minVersion,
  };

  try {
    if (fs.existsSync(versionFile)) {
      const raw = JSON.parse(fs.readFileSync(versionFile, 'utf8')) as Partial<AppVersionConfig>;
      return {
        version: raw.version ?? defaults.version,
        minVersion: raw.minVersion ?? defaults.minVersion,
        message: raw.message,
      };
    }
  } catch {
    // archivo ausente o inválido: usar defaults de env
  }

  return defaults;
}

router.get('/version', (_req, res) => {
  const cfg = readVersionConfig();
  res.json({
    version: cfg.version,
    minVersion: cfg.minVersion,
    message: cfg.message,
    downloadUrl: `${env.publicUrl}/downloads/posta-repartidor.apk`,
  });
});

export default router;
