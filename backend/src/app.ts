import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/auth.routes.js';
import ordersRoutes from './routes/orders.routes.js';
import usersRoutes from './routes/users.routes.js';
import repartidoresRoutes from './routes/repartidores.routes.js';
import notificationsRoutes from './routes/notifications.routes.js';
import simulatorRoutes from './routes/simulator.routes.js';

const app = express();

app.use(cors({ origin: env.corsOrigin }));
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/repartidores', repartidoresRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/simulator', simulatorRoutes);

app.use(errorHandler);

export default app;
