import { Request, Response, NextFunction } from 'express';
import { applyCorsHeaders } from '../config/cors.js';

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  applyCorsHeaders(req, res);
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor.' });
}
