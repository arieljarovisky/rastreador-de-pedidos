import { Wifi, WifiOff } from 'lucide-react';

interface ConnectionIndicatorProps {
  isOnline: boolean;
  wsConnected: boolean;
  className?: string;
  /** Solo punto de color, sin texto */
  compact?: boolean;
}

export default function ConnectionIndicator({
  isOnline,
  wsConnected,
  className = '',
  compact = false,
}: ConnectionIndicatorProps) {
  if (compact) {
    const tone = !isOnline ? 'offline' : wsConnected ? 'live' : 'online';
    return (
      <span
        className={`connection-indicator connection-indicator--${tone} connection-indicator--compact ${className}`.trim()}
        title={!isOnline ? 'Sin conexión' : wsConnected ? 'Tiempo real' : 'En línea'}
        aria-label={!isOnline ? 'Sin conexión' : wsConnected ? 'Tiempo real' : 'En línea'}
      >
        <span className="connection-indicator__dot" aria-hidden="true" />
      </span>
    );
  }

  if (!isOnline) {
    return (
      <span className={`connection-indicator connection-indicator--offline ${className}`.trim()}>
        <WifiOff className="w-3 h-3 shrink-0" aria-hidden="true" />
        OFFLINE
      </span>
    );
  }

  if (wsConnected) {
    return (
      <span className={`connection-indicator connection-indicator--live ${className}`.trim()}>
        <span className="connection-indicator__dot" aria-hidden="true" />
        <Wifi className="w-3 h-3 shrink-0" aria-hidden="true" />
        LIVE
      </span>
    );
  }

  return (
    <span className={`connection-indicator connection-indicator--online ${className}`.trim()}>
      <span className="connection-indicator__dot" aria-hidden="true" />
      <Wifi className="w-3 h-3 shrink-0" aria-hidden="true" />
      ONLINE
    </span>
  );
}
