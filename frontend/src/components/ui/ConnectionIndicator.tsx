import { Wifi, WifiOff } from 'lucide-react';

interface ConnectionIndicatorProps {
  isOnline: boolean;
  wsConnected: boolean;
  className?: string;
}

export default function ConnectionIndicator({ isOnline, wsConnected, className = '' }: ConnectionIndicatorProps) {
  if (!isOnline) {
    return (
      <span className={`connection-indicator connection-indicator--offline ${className}`.trim()}>
        <WifiOff className="w-2.5 h-2.5 shrink-0" aria-hidden="true" />
        OFFLINE
      </span>
    );
  }

  if (wsConnected) {
    return (
      <span className={`connection-indicator connection-indicator--live ${className}`.trim()}>
        <span className="connection-indicator__dot" aria-hidden="true" />
        <Wifi className="w-2.5 h-2.5 shrink-0" aria-hidden="true" />
        LIVE
      </span>
    );
  }

  return (
    <span className={`connection-indicator connection-indicator--online ${className}`.trim()}>
      <span className="connection-indicator__dot" aria-hidden="true" />
      <Wifi className="w-2.5 h-2.5 shrink-0" aria-hidden="true" />
      ONLINE
    </span>
  );
}
