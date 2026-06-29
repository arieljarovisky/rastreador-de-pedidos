-- Ejecutar en Railway MySQL si necesitás aplicar el vínculo sin redeploy.
-- Agencia MensajeriaGR (gabriel) + vendedor lupo → ag_default

INSERT INTO agencies (id, name, departure_address, departure_lat, departure_lng, created_at)
SELECT
  'ag_default',
  name,
  departure_address,
  departure_lat,
  departure_lng,
  NOW(3)
FROM users
WHERE id = 'umqyieiu8oh1l'
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  departure_address = COALESCE(VALUES(departure_address), departure_address),
  departure_lat = COALESCE(VALUES(departure_lat), departure_lat),
  departure_lng = COALESCE(VALUES(departure_lng), departure_lng);

UPDATE users SET agency_id = 'ag_default' WHERE id = 'umqyieiu8oh1l';

UPDATE users SET agency_id = 'ag_default', role = 'store_admin'
WHERE LOWER(username) IN ('lupo', 'admin');

UPDATE users SET agency_id = 'ag_default'
WHERE role = 'repartidor' AND agency_id IS NULL;

UPDATE orders o
INNER JOIN users s ON s.id = o.seller_id
SET o.agency_id = 'ag_default'
WHERE s.agency_id = 'ag_default';

UPDATE orders o
INNER JOIN users s ON s.id = o.seller_id AND s.agency_id = 'ag_default'
SET o.agency_id = 'ag_default'
WHERE o.agency_id IS NULL;
