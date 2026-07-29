import { listPushTokensForUser } from './push-tokens.service.js';

interface ExpoPushMessage {
  to: string;
  sound: 'default' | null;
  title: string;
  body: string;
  data?: Record<string, string>;
  priority?: 'default' | 'normal' | 'high';
  channelId?: string;
}

async function sendExpoPushBatch(messages: ExpoPushMessage[]): Promise<void> {
  if (messages.length === 0) return;

  const chunkSize = 100;
  for (let i = 0; i < messages.length; i += chunkSize) {
    const chunk = messages.slice(i, i + chunkSize);
    try {
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(chunk),
      });
      if (!res.ok) {
        const text = await res.text();
        console.warn('[push] Expo respondió con error:', res.status, text);
      }
    } catch (err) {
      console.warn('[push] No se pudo enviar push:', err);
    }
  }
}

export async function sendPushNotification(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<void> {
  if (userId === 'all') {
    console.warn('[push] sendPushNotification omitido: userId=all ya no se usa');
    return;
  }

  const tokens = await listPushTokensForUser(userId);
  const messages = tokens.map((token) => ({
    to: token,
    sound: 'default' as const,
    title,
    body,
    data,
    priority: 'high' as const,
    channelId: 'posta-alerts',
  }));
  await sendExpoPushBatch(messages);
}
