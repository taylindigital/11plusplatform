import { Pool } from 'pg';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';

const {
  PGHOST,
  PGPORT = '5432',
  PGDATABASE,
  PGUSER,
  PGPASSWORD,
  PGSSLMODE,
} = process.env;

if (!PGHOST || !PGDATABASE || !PGUSER || !PGPASSWORD) {
  // eslint-disable-next-line no-console
  console.error('Missing PG* env vars. Set PGHOST, PGDATABASE, PGUSER, PGPASSWORD (optional: PGPORT, PGSSLMODE).');
  process.exit(1);
}

const pool = new Pool({
  host: PGHOST,
  port: Number(PGPORT),
  database: PGDATABASE,
  user: PGUSER,
  password: PGPASSWORD,
  ssl: PGSSLMODE ? { rejectUnauthorized: false } : undefined,
});

async function ensureMigrationsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id serial PRIMARY KEY,
      name text NOT NULL UNIQUE,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}

function checksum(sql: string) {
  return createHash('sha256').update(sql).digest('hex');
}

async function alreadyApplied(name: string, sum: string) {
  const { rows } = await pool.query(
    `SELECT 1 FROM schema_migrations WHERE name = $1 AND checksum = $2`,
    [name, sum]
  );
  return rows.length > 0;
}

async function applyMigration(name: string, sql: string, sum: string) {
  // Run migration in a transaction
  await pool.query('BEGIN');
  try {
    await pool.query(sql);
    await pool.query(
      `INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)`,
      [name, sum]
    );
    await pool.query('COMMIT');
    // eslint-disable-next-line no-console
    console.log(`✔ Applied ${name}`);
  } catch (e) {
    await pool.query('ROLLBACK');
    throw new Error(`Failed ${name}: ${(e as Error).message}`);
  }
}

async function main() {
  const dir = join(process.cwd(), 'apps', 'api', 'migrations');
  const files = readdirSync(dir)
    .filter(f => f.endsWith('.sql'))
    .sort(); // run in order e.g. 001_..., 002_...

  await ensureMigrationsTable();

  for (const file of files) {
    const full = join(dir, file);
    const sql = readFileSync(full, 'utf8');
    const sum = checksum(sql);
    const done = await alreadyApplied(file, sum);
    if (done) {
      // eslint-disable-next-line no-console
      console.log(`↷ Skipping ${file} (already applied)`);
      continue;
    }
    await applyMigration(file, sql, sum);
  }

  await pool.end();
}

main().catch(err => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});