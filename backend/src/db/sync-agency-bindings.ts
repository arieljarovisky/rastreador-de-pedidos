import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';

/** Agencia MensajeriaGR (admin gabriel) y vendedor lupo en producción. */
const MENSAJERIA_ADMIN_ID = 'umqyieiu8oh1l';
const MENSAJERIA_AGENCY_ID = 'ag_default';
const MENSAJERIA_SELLER_USERNAMES = ['lupo', 'admin'];

interface AdminRow extends RowDataPacket {
  id: string;
  name: string;
  departure_address: string | null;
  departure_lat: number | null;
  departure_lng: number | null;
}

/**
 * Asegura que exista la agencia ag_default (MensajeriaGR), que gabriel sea su super_admin
 * y que el vendedor lupo pertenezca a esa agencia. Idempotente — seguro en cada arranque.
 */
export async function syncMensajeriaGrAgency(): Promise<void> {
  const [adminRows] = await pool.query<AdminRow[]>(
    `SELECT id, name, departure_address, departure_lat, departure_lng
     FROM users
     WHERE id = ? OR (role = 'super_admin' AND LOWER(username) = 'gabriel')
     LIMIT 1`,
    [MENSAJERIA_ADMIN_ID]
  );
  const admin = adminRows[0];
  if (!admin) return;

  await pool.query(
    `INSERT INTO agencies (id, name, departure_address, departure_lat, departure_lng, created_at)
     VALUES (?, ?, ?, ?, ?, NOW(3))
     ON DUPLICATE KEY UPDATE
       name = VALUES(name),
       departure_address = COALESCE(VALUES(departure_address), departure_address),
       departure_lat = COALESCE(VALUES(departure_lat), departure_lat),
       departure_lng = COALESCE(VALUES(departure_lng), departure_lng)`,
    [
      MENSAJERIA_AGENCY_ID,
      admin.name,
      admin.departure_address,
      admin.departure_lat,
      admin.departure_lng,
    ]
  );

  await pool.query(`UPDATE users SET agency_id = ? WHERE id = ?`, [
    MENSAJERIA_AGENCY_ID,
    admin.id,
  ]);

  for (const username of MENSAJERIA_SELLER_USERNAMES) {
    const [result] = await pool.query<ResultSetHeader>(
      `UPDATE users SET agency_id = ?, role = 'store_admin'
       WHERE LOWER(username) = LOWER(?)`,
      [MENSAJERIA_AGENCY_ID, username]
    );
    if (result.affectedRows > 0) {
      console.log(`[migrate] Vendedor @${username} asociado a agencia ${MENSAJERIA_AGENCY_ID}`);
    }
  }

  await pool.query(
    `UPDATE users SET agency_id = ?
     WHERE role = 'repartidor' AND agency_id IS NULL`,
    [MENSAJERIA_AGENCY_ID]
  );

  await pool.query(
    `UPDATE orders o
     INNER JOIN users s ON s.id = o.seller_id
     SET o.agency_id = ?
     WHERE s.agency_id = ?`,
    [MENSAJERIA_AGENCY_ID, MENSAJERIA_AGENCY_ID]
  );

  await pool.query(
    `UPDATE orders o
     INNER JOIN users s ON s.id = o.seller_id AND s.agency_id = ?
     SET o.agency_id = ?
     WHERE o.agency_id IS NULL`,
    [MENSAJERIA_AGENCY_ID, MENSAJERIA_AGENCY_ID]
  );

  console.log(
    `[migrate] Agencia ${MENSAJERIA_AGENCY_ID} (${admin.name}) vinculada al admin ${admin.id}`
  );
}

async function main(): Promise<void> {
  await syncMensajeriaGrAgency();
  console.log('Sincronización de agencia completada.');
  process.exit(0);
}

const invokedDirectly = process.argv[1]?.includes('sync-agency-bindings');
if (invokedDirectly) {
  main().catch((err) => {
    console.error('Error en sync-agency-bindings:', err);
    process.exit(1);
  });
}
