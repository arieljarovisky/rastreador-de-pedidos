import React from 'react';
import { useAppUpdate } from '../hooks/useAppUpdate';

export default function AppUpdateChecker({ children }: { children: React.ReactNode }) {
  useAppUpdate();
  return <>{children}</>;
}
