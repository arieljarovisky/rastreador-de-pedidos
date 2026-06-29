import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.js';
import { listNotificationsForUser, markAllReadForUser, clearNotificationsForUser } from '../services/notifications.service.js';

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

export default router;
