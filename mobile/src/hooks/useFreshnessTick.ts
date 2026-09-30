import { useEffect, useState } from 'react';

/** Reloj para reevaluar GPS vencido sin esperar al próximo poll. */
export function useFreshnessTick(intervalMs = 15_000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}
