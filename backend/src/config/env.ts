import dotenv from 'dotenv';

dotenv.config();

function firstDefined(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => value !== undefined && value !== '');
}

export const env = {
  port: Number(process.env.PORT) || 4000,
  db: {
    host: firstDefined(process.env.DB_HOST, process.env.MYSQLHOST, process.env.MYSQL_HOST) || 'localhost',
    port: Number(firstDefined(process.env.DB_PORT, process.env.MYSQLPORT, process.env.MYSQL_PORT) || '3306'),
    user: firstDefined(process.env.DB_USER, process.env.MYSQLUSER, process.env.MYSQL_USER) || 'root',
    password: firstDefined(process.env.DB_PASSWORD, process.env.MYSQLPASSWORD, process.env.MYSQL_PASSWORD) || '',
    database: firstDefined(process.env.DB_NAME, process.env.MYSQLDATABASE, process.env.MYSQL_DATABASE) || 'lupo_tracking',
  },
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
};
