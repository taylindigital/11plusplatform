import { Pool } from 'pg';
const pool = new Pool({
    host: process.env.PGHOST,
    port: +(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    ssl: process.env.PGSSLMODE ? { rejectUnauthorized: false } : undefined,
});
export async function q(sql, params) {
    const { rows } = await pool.query(sql, params);
    return rows;
}
// Optional helper if you ever want exactly one row
export async function qOne(sql, params) {
    const rows = await q(sql, params);
    return rows[0] ?? null;
}
