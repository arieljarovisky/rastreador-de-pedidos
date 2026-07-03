import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  listNotificationsForUser,
  markAllReadForUser,
  clearNotificationsForUser,
} from '../services/notifications.service.js';
import { upsertPushToken, removePushToken } from '../services/push-tokens.service.js';

const router = Router();

router.get('/', authenticate, async (req: Request, res: Response) => {
  const notifications = await listNotificationsForUser(req.user!.id);
  res.json(notifications);
});

router.post('/read', authenticate, async (req: Request, res: Response) => {
  await markAllReadForUser(req.user!.id);
  res.json({ success: true });
});

router.delete('/', authenticate, async (req: Request, res: Response) => {
  await clearNotificationsForUser(req.user!.id);
  res.json({ success: true });
});

router.post('/push-token', authenticate, async (req: Request, res: Response) => {
  const { expoPushToken, platform } = req.body as {
    expoPushToken?: string;
    platform?: string;
  };
  if (!expoPushToken || typeof expoPushToken !== 'string') {
    res.status(400).json({ error: 'expoPushToken es requerido.' });
    return;
  }
  await upsertPushToken(req.user!.id, expoPushToken, platform);
  res.json({ success: true });
});

router.delete('/push-token', authenticate, async (req: Request, res: Response) => {
  const { expoPushToken } = req.body as { expoPushToken?: string };
  if (!expoPushToken || typeof expoPushToken !== 'string') {
    res.status(400).json({ error: 'expoPushToken es requerido.' });
    return;
  }
  await removePushToken(req.user!.id, expoPushToken);
  res.json({ success: true });
});

export default router;
