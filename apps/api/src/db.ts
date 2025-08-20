import { Pool, type QueryResultRow } from 'pg';

const pool = new Pool({
  host: process.env.PGHOST,
  port: +(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  ssl: process.env.PGSSLMODE ? { rejectUnauthorized: false } : undefined,
});

export async function q<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params?: unknown[]
): Promise<T[]> {
  const { rows } = await pool.query<T>(sql as any, params as any);
  return rows;
}

// Optional helper if you ever want exactly one row
export async function qOne<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params?: unknown[]
): Promise<T | null> {
  const rows = await q<T>(sql, params);
  return rows[0] ?? null;
}