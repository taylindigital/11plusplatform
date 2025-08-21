import express, { type Request, type Response } from 'express';
import cors, { CorsOptionsDelegate } from 'cors';
import morgan from 'morgan';
import { verifyBearer, type AuthenticatedRequest } from './auth.js';
import { q } from './db.js';

// ---- helper: derive an email/username from various CIAM claims
function emailFromClaims(claims: any): string {
  if (!claims) return '';
  const p = (claims.preferred_username ?? '').toString().trim().toLowerCase();
  if (p) return p;

  const emails = claims.emails;
  if (Array.isArray(emails) && emails[0]) {
    return String(emails[0]).trim().toLowerCase();
  }

  const upn = (claims.upn ?? '').toString().trim().toLowerCase();
  if (upn) return upn;

  return '';
}

// ---- create app FIRST
const app = express();

// ---- config & middleware
const SWA_ORIGIN = (process.env.SWA_ORIGIN || 'https://nice-ocean-0e8063c03.2.azurestaticapps.net').replace(/\/+$/, '');

// allow exact SWA origin, localhost, and any *.azurestaticapps.net
const isAllowedOrigin = (origin: string): boolean => {
  if (!origin) return false;
  const norm = origin.replace(/\/+$/, '');
  if (norm === SWA_ORIGIN) return true;
  if (norm.startsWith('http://localhost:') || norm.startsWith('http://127.0.0.1:')) return true;
  try {
    const host = new URL(norm).hostname.toLowerCase();
    if (host.endsWith('.azurestaticapps.net')) return true;
  } catch {}
  return false;
};

const corsOptions: CorsOptionsDelegate = (req, cb) => {
  const origin = String(req.headers.origin || '');
  const allowed = isAllowedOrigin(origin);
  cb(null, {
    origin: allowed ? origin : false,
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

// ---- debug endpoints (handy while we finish wiring)
app.get('/debug/cors', (req, res) => {
  const origin = (req.headers['origin'] || '').toString();
  res.json({ origin, SWA_ORIGIN, allowed: isAllowedOrigin(origin) });
});

app.get('/debug/env', (_req, res) => {
  res.json({
    ADMIN_EMAIL: process.env.ADMIN_EMAIL,
    SWA_ORIGIN: process.env.SWA_ORIGIN,
  });
});

// Protected: echo claims and derived email
app.get('/debug/claims', verifyBearer, (req: AuthenticatedRequest, res: Response) => {
  const derivedEmail = emailFromClaims(req.auth);
  res.json({
    claims: req.auth || {},
    derivedEmail,
    adminEmail: (process.env.ADMIN_EMAIL || '').toLowerCase(),
  });
});

// ---- health endpoints
app.get('/health', (_req: Request, res: Response) => res.json({ ok: true }));

app.get('/health/db', async (_req: Request, res: Response) => {
  try {
    const rows = await q<{ now: string }>('select now() as now');
    res.json({ ok: true, now: rows[0]?.now });
  } catch (e) {
    res.status(500).json({ ok: false, error: (e as Error).message });
  }
});

// ---- protected sample
app.get('/api/ping', verifyBearer, (req: AuthenticatedRequest, res: Response) => {
  res.json({
    ok: true,
    sub: req.auth?.sub,
    username: emailFromClaims(req.auth),
    scope: req.auth?.scp,
  });
});

// ---- users init
app.post('/api/users/init', verifyBearer, async (req: AuthenticatedRequest, res: Response) => {
  const sub = req.auth?.sub as string | undefined;
  const email = emailFromClaims(req.auth);

  const given = (req.auth as any)?.given_name as string | undefined;
  const family = (req.auth as any)?.family_name as string | undefined;
  const fullFromParts = [given, family].filter(Boolean).join(' ').trim();
  const name =
    (req.auth?.name as string) ||
    fullFromParts ||
    (email ? email.split('@')[0] : ''); // last-resort

  if (!sub || !email) return res.status(400).json({ error: 'missing_claims' });

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

// ---- admin approve/reject (email guard)
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').toLowerCase();

function isAdmin(req: AuthenticatedRequest): boolean {
  const email = emailFromClaims(req.auth);
  return email === ADMIN_EMAIL;
}

app.post('/api/admin/users/:subject/approve', verifyBearer, async (req: AuthenticatedRequest, res: Response) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'forbidden' });

  const subject = req.params.subject;
  await q(`update app_user set status='approved', updated_at=now() where subject=$1`, [subject]);
  await q(`insert into app_user_audit (subject, action, actor) values ($1,'approved',$2)`, [subject, ADMIN_EMAIL]);
  res.json({ ok: true });
});

app.post('/api/admin/users/:subject/reject', verifyBearer, async (req: AuthenticatedRequest, res: Response) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'forbidden' });

  const subject = req.params.subject;
  await q(`update app_user set status='rejected', updated_at=now() where subject=$1`, [subject]);
  await q(`insert into app_user_audit (subject, action, actor) values ($1,'rejected',$2)`, [subject, ADMIN_EMAIL]);
  res.json({ ok: true });
});

// Admin: list users (optionally filter by status)
app.get('/api/admin/users', verifyBearer, async (req: AuthenticatedRequest, res: Response) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'forbidden' });

  const status = (req.query.status as string) || '';
  const rows = status
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

// ---- 404
app.use((_req: Request, res: Response) => res.status(404).json({ error: 'not_found' }));

// ---- last middleware: global error handler that still adds CORS headers
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, req: Request, res: Response, _next: Function) => {
  // eslint-disable-next-line no-console
  console.error('ERROR:', err);

  if (!res.headersSent) {
    const origin = String(req.headers.origin || '');
    res.setHeader('Vary', 'Origin');
    const allowed = isAllowedOrigin(origin);
    if (allowed) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    }
  }

  const status = (err as { status?: number }).status ?? 500;
  res.status(status).json({ error: 'server_error' });
});

// ---- start
const port = +(process.env.PORT || 8080);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`API listening on :${port}`);
});