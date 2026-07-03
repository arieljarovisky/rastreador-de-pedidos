import React from 'react';
import { useAuth } from '../context/AuthContext';
import { usePushNotifications } from '../hooks/usePushNotifications';

/** Registra el dispositivo para push nativas cuando hay sesión activa. */
export default function PushNotificationsBridge() {
  const { token } = useAuth();
  usePushNotifications({ token });
  return null;
}
