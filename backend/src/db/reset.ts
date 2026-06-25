import { resetDatabase } from './reset-database.js';

resetDatabase()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error en db:reset:', err);
    process.exit(1);
  });
