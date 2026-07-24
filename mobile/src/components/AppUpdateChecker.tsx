import React from 'react';
import { useAppUpdate } from '../hooks/useAppUpdate';
import { useOtaUpdate } from '../hooks/useOtaUpdate';

/** Chequea APK nativo (backend) + updates OTA de JS (EAS Update). */
export default function AppUpdateChecker({ children }: { children: React.ReactNode }) {
  useAppUpdate();
  useOtaUpdate();
  return <>{children}</>;
}
