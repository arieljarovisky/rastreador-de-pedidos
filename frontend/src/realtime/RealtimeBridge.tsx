import { useRealtimeSocket } from '../useRealtimeSocket.ts';

type RealtimeBridgeProps = Parameters<typeof useRealtimeSocket>[0];

/** El cliente de socket entra en su propio chunk y solo se pide con sesión. */
export default function RealtimeBridge(props: RealtimeBridgeProps) {
  useRealtimeSocket(props);
  return null;
}
