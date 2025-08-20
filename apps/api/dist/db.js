"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.q = q;
exports.qOne = qOne;
const pg_1 = require("pg");
const pool = new pg_1.Pool({
    host: process.env.PGHOST,
    port: +(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    ssl: process.env.PGSSLMODE ? { rejectUnauthorized: false } : undefined,
});
async function q(sql, params) {
    const { rows } = await pool.query(sql, params);
    return rows;
}
// Optional helper if you ever want exactly one row
async function qOne(sql, params) {
    const rows = await q(sql, params);
    return rows[0] ?? null;
}
