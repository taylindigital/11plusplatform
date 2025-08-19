import { Pool } from 'pg';

const pool = new Pool({
  host: process.env.PGHOST,
  port: +(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  ssl: process.env.PGSSLMODE ? { rejectUnauthorized: false } : undefined,
});

export async function q<T = unknown>(sql: string, params?: unknown[]) {
  const { rows } = await pool.query<T>(sql, params);
  return rows;
}