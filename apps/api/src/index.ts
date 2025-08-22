// apps/api/src/index.ts
import express, { type Request, type Response } from 'express';
import cors, { type CorsOptionsDelegate } from 'cors';
import morgan from 'morgan';
import { verifyBearer, type AuthenticatedRequest } from './auth.js';
import { q } from './db.js';

/* -----------------------------------------------------------------------------
   Email derivation (robust against different token shapes)
----------------------------------------------------------------------------- */

function emailFromClaims(claims: Record<string, unknown> | undefined): string {
  if (!claims) return '';
  const take = (k: string) => {
    const v = (claims as any)[k];
    return typeof v === 'string' ? v.trim().toLowerCase() : '';
  };

  // 1) preferred_username (most common in Entra External ID / CIAM)
  const preferred = take('preferred_username');
  if (preferred) return preferred;

  // 2) email
  const single = take('email');
  if (single) return single;

  // 3) emails[]
  const arr = (claims as any).emails;
  if (Array.isArray(arr) && arr.length > 0) {
    const first = String(arr[0] ?? '').trim().toLowerCase();
    if (first) return first;
  }

  // 4) upn, 5) unique_name, 6) nameid (seen in various AAD configs)
  const upn = take('upn');
  if (upn) return upn;

  const uniqueName = take('unique_name');
  if (uniqueName) return uniqueName;

  const nameId = take('nameid');
  if (nameId) return nameId;

  return '';
}

async function deriveEmail(req: AuthenticatedRequest): Promise<string> {
  // try from token first
  const fromToken = emailFromClaims(req.auth as any);
  if (fromToken) return fromToken;

  // fallback to DB by subject if present
  const sub = (req.auth?.sub as string) || '';
  if (sub) {
    const rows = await q<{ email: string }>(
      `select email from app_user where subject = $1 limit 1`,
      [sub],
    );
    const dbEmail = (rows[0]?.email || '').trim().toLowerCase();
    if (dbEmail) return dbEmail;
  }
  return '';
}

/* -----------------------------------------------------------------------------
   App + CORS
----------------------------------------------------------------------------- */

const app = express();

const SWA_ORIGIN = (process.env.SWA_ORIGIN || 'https://nice-ocean-0e8063c03.2.azurestaticapps.net')
  .replace(/\/+$/, '');

const isAllowedOrigin = (origin: string): boolean => {
  if (!origin) return false;
  const norm = origin.replace(/\/+$/, '');
  if (norm === SWA_ORIGIN) return true;
  if (norm.startsWith('http://localhost:') || norm.startsWith('http://127.0.0.1:')) return true;
  try {
    const host = new URL(norm).hostname.toLowerCase();
    if (host.endsWith('.azurestaticapps.net')) return true; // SWA preview/staging slots
  } catch {
    /* ignore */
  }
  return false;
};

const corsOptions: CorsOptionsDelegate = (req, cb) => {
  const origin = String(req.headers.origin || '');
  cb(null, {
    origin: isAllowedOrigin(origin) ? origin : false,
    credentials: false,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    maxAge: 600,
  });
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json());
app.use(morgan('tiny'));

/* -----------------------------------------------------------------------------
   Health
----------------------------------------------------------------------------- */

app.get('/health', (_req: Request, res: Response) => res.json({ ok: true }));

app.get('/health/db', async (_req: Request, res: Response) => {
  try {
    const rows = await q<{ now: string; usr: string }>('select now() as now, current_user as usr');
    res.json({ ok: true, rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: (e as Error).message });
  }
});

/* -----------------------------------------------------------------------------
   Minimal debug (safe to keep)
----------------------------------------------------------------------------- */

app.get('/debug/env', (_req, res) => {
  res.json({
    ADMIN_EMAIL: process.env.ADMIN_EMAIL,
    SWA_ORIGIN,
  });
});

app.get('/debug/whoami', verifyBearer, async (req: AuthenticatedRequest, res: Response) => {
  const derived = await deriveEmail(req);
  res.json({
    ok: true,
    preferred_username: (req.auth?.preferred_username as string | undefined) ?? null,
    derivedEmail: derived,
    adminEnv: (process.env.ADMIN_EMAIL || '').trim().toLowerCase(),
    sub: req.auth?.sub ?? null,
    scp: req.auth?.scp ?? null,
  });
});

/* -----------------------------------------------------------------------------
   Sample protected ping
----------------------------------------------------------------------------- */

app.get('/api/ping', verifyBearer, async (req: AuthenticatedRequest, res: Response) => {
  res.json({
    ok: true,
    sub: req.auth?.sub,
    username: await deriveEmail(req),
    scope: req.auth?.scp,
  });
});

/* -----------------------------------------------------------------------------
   Users: init
----------------------------------------------------------------------------- */

app.post('/api/users/init', verifyBearer, async (req: AuthenticatedRequest, res: Response) => {
  const sub = (req.auth?.sub as string) || '';
  const email = await deriveEmail(req);

  const given = (req.auth as any)?.given_name as string | undefined;
  const family = (req.auth as any)?.family_name as string | undefined;
  const fullFromParts = [given, family].filter(Boolean).join(' ').trim();
  const name =
    (req.auth?.name as string) ||
    fullFromParts ||
    (email ? email.split('@')[0] : '');

  if (!sub || !email) {
    return res.status(400).json({ error: 'missing_claims' });
  }

  await q(
    `
    insert into app_user (subject, email, display_name, status)
    values ($1, $2, $3, 'pending')
    on conflict (subject) do update set
      email = excluded.email,
      display_name = excluded.display_name,
      updated_at = now()
  `,
    [sub, email, name],
  );

  await q(
    `insert into app_user_audit (subject, action, details)
     values ($1, 'created', jsonb_build_object('email',$2,'name',$3))`,
    [sub, email, name],
  );

  const [me] = await q<{ status: string }>(`select status from app_user where subject=$1`, [sub]);
  res.json({ ok: true, status: me?.status || 'pending' });
});

/* -----------------------------------------------------------------------------
   Admin endpoints (email-guard using derived email)
----------------------------------------------------------------------------- */

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();

app.get('/api/admin/users', verifyBearer, async (req: AuthenticatedRequest, res: Response) => {
  const actor = (await deriveEmail(req)).toLowerCase();
  if (!actor || actor !== ADMIN_EMAIL) {
    return res.status(403).json({ error: 'forbidden_not_admin', actor, admin: ADMIN_EMAIL });
  }

  const status = (req.query.status as string | undefined)?.trim() ?? '';
  const rows =
    status
      ? await q(
          `select subject, email, display_name, status, created_at, updated_at
           from app_user where status = $1
           order by created_at desc limit 200`,
          [status],
        )
      : await q(
          `select subject, email, display_name, status, created_at, updated_at
           from app_user
           order by created_at desc limit 200`,
        );

  res.json({ ok: true, users: rows });
});

app.post('/api/admin/users/:subject/approve', verifyBearer, async (req: AuthenticatedRequest, res: Response) => {
  const actor = (await deriveEmail(req)).toLowerCase();
  if (!actor || actor !== ADMIN_EMAIL) {
    return res.status(403).json({ error: 'forbidden_not_admin', actor, admin: ADMIN_EMAIL });
  }
  const subject = req.params.subject;
  await q(`update app_user set status='approved', updated_at=now() where subject=$1`, [subject]);
  await q(`insert into app_user_audit (subject, action, actor) values ($1,'approved',$2)`, [
    subject,
    actor,
  ]);
  res.json({ ok: true });
});

app.post('/api/admin/users/:subject/reject', verifyBearer, async (req: AuthenticatedRequest, res: Response) => {
  const actor = (await deriveEmail(req)).toLowerCase();
  if (!actor || actor !== ADMIN_EMAIL) {
    return res.status(403).json({ error: 'forbidden_not_admin', actor, admin: ADMIN_EMAIL });
  }
  const subject = req.params.subject;
  await q(`update app_user set status='rejected', updated_at=now() where subject=$1`, [subject]);
  await q(`insert into app_user_audit (subject, action, actor) values ($1,'rejected',$2)`, [
    subject,
    actor,
  ]);
  res.json({ ok: true });
});

/* -----------------------------------------------------------------------------
   404 + error handler (keeps CORS headers on errors)
----------------------------------------------------------------------------- */

app.use((_req: Request, res: Response) => res.status(404).json({ error: 'not_found' }));

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, req: Request, res: Response, _next: Function) => {
  // eslint-disable-next-line no-console
  console.error('ERROR:', err);
  if (!res.headersSent) {
    const origin = String(req.headers.origin || '');
    res.setHeader('Vary', 'Origin');
    if (isAllowedOrigin(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    }
  }
  const status = (err as { status?: number }).status ?? 500;
  res.status(status).json({ error: 'server_error' });
});

/* -----------------------------------------------------------------------------
   Start
----------------------------------------------------------------------------- */

const port = +(process.env.PORT || 8080);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`API listening on :${port}`);
});