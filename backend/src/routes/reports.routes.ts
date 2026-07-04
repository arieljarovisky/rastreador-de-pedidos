import { Router, Request, Response } from 'express';
import { authenticate, requireRoles } from '../middleware/auth.js';
import { UserRole } from '../types/index.js';
import { pool } from '../config/database.js';

const router = Router();

const AGENCY_ROLES = [UserRole.SUPER_ADMIN, UserRole.LOGISTICS_ADMIN, UserRole.STORE_ADMIN];

router.get('/orders', authenticate, requireRoles(...AGENCY_ROLES), async (req: Request, res: Response) => {
  try {
    const user = req.user!;
    const { from, to } = req.query;

    let agencyFilter = '';
    const baseParams: unknown[] = [];

    if (user.role === UserRole.STORE_ADMIN) {
      if (user.agencyId) {
        agencyFilter = 'AND o.agency_id = ?';
        baseParams.push(user.agencyId);
      } else {
        agencyFilter = 'AND o.seller_id = ?';
        baseParams.push(user.id);
      }
    } else if (user.agencyId) {
      agencyFilter = 'AND o.agency_id = ?';
      baseParams.push(user.agencyId);
    }

    let dateFilter = '';
    if (typeof from === 'string' && from) {
      dateFilter += ' AND o.created_at >= ?';
      baseParams.push(from);
    }
    if (typeof to === 'string' && to) {
      dateFilter += ' AND o.created_at <= ?';
      baseParams.push(`${to} 23:59:59`);
    }

    const baseWhere = `WHERE 1=1 ${agencyFilter} ${dateFilter}`;

    const [summaryRows] = await pool.query(
      `SELECT
         COUNT(*) as total,
         SUM(CASE WHEN o.status = 'pending' THEN 1 ELSE 0 END) as pending,
         SUM(CASE WHEN o.status = 'assigned' THEN 1 ELSE 0 END) as assigned,
         SUM(CASE WHEN o.status = 'delivering' THEN 1 ELSE 0 END) as delivering,
         SUM(CASE WHEN o.status = 'delivered' THEN 1 ELSE 0 END) as delivered,
         SUM(CASE WHEN o.status = 'cancelled' THEN 1 ELSE 0 END) as cancelled
       FROM orders o ${baseWhere}`,
      [...baseParams]
    );

    const summary = (summaryRows as any[])[0] ?? {
      total: 0, pending: 0, assigned: 0, delivering: 0, delivered: 0, cancelled: 0,
    };

    const [dailyRows] = await pool.query(
      `SELECT
         DATE(o.created_at) as date,
         COUNT(*) as total,
         SUM(CASE WHEN o.status = 'delivered' THEN 1 ELSE 0 END) as delivered,
         SUM(CASE WHEN o.status = 'cancelled' THEN 1 ELSE 0 END) as cancelled
       FROM orders o ${baseWhere}
       GROUP BY DATE(o.created_at)
       ORDER BY date DESC
       LIMIT 30`,
      [...baseParams]
    );

    const [repartidorRows] = await pool.query(
      `SELECT
         o.repartidor_id as repartidorId,
         o.repartidor_name as repartidorName,
         COUNT(*) as total,
         SUM(CASE WHEN o.status = 'delivered' THEN 1 ELSE 0 END) as delivered
       FROM orders o ${baseWhere} AND o.repartidor_id IS NOT NULL
       GROUP BY o.repartidor_id, o.repartidor_name
       ORDER BY total DESC
       LIMIT 20`,
      [...baseParams]
    );

    const [sellerRows] = await pool.query(
      `SELECT
         o.seller_id as sellerId,
         COALESCE(u.name, 'Sin vendedor') as sellerName,
         COUNT(*) as total,
         SUM(CASE WHEN o.status = 'delivered' THEN 1 ELSE 0 END) as delivered
       FROM orders o
       LEFT JOIN users u ON o.seller_id = u.id
       ${baseWhere}
       GROUP BY o.seller_id, u.name
       ORDER BY total DESC
       LIMIT 20`,
      [...baseParams]
    );

    res.json({
      summary: {
        total: Number(summary.total),
        pending: Number(summary.pending),
        assigned: Number(summary.assigned),
        delivering: Number(summary.delivering),
        delivered: Number(summary.delivered),
        cancelled: Number(summary.cancelled),
      },
      daily: (dailyRows as any[]).map((r) => ({
        date: r.date instanceof Date ? r.date.toISOString().split('T')[0] : String(r.date),
        total: Number(r.total),
        delivered: Number(r.delivered),
        cancelled: Number(r.cancelled),
      })),
      byRepartidor: (repartidorRows as any[]).map((r) => ({
        repartidorId: r.repartidorId,
        repartidorName: r.repartidorName || 'Desconocido',
        total: Number(r.total),
        delivered: Number(r.delivered),
      })),
      bySeller: (sellerRows as any[]).map((r) => ({
        sellerId: r.sellerId,
        sellerName: r.sellerName,
        total: Number(r.total),
        delivered: Number(r.delivered),
      })),
    });
  } catch (err) {
    console.error('[reports] Error fetching order reports:', err);
    res.status(500).json({ error: 'Error al generar los reportes.' });
  }
});

export default router;
