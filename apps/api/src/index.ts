import express, { type Request, type Response } from 'express';
import cors, { CorsOptionsDelegate } from 'cors';
import morgan from 'morgan';
import { verifyBearer, type AuthenticatedRequest } from './auth.js';
import { q } from './db.js';

// ----------------------
// App + CORS
// ----------------------
const app = express();

const SWA_ORIGIN = (process.env.SWA_ORIGIN || 'https://nice-ocean-0e8063c03.2.azurestaticapps.net').replace(/\/+$/, '');

const isAllowedOrigin = (origin: string): boolean => {
  if (!origin) return false;
  const norm = origin.replace(/\/+$/, '');
  if (norm === SWA_ORIGIN) return true;
  if (/^http:\/\/(localhost|127\.0\.0\.1):\d+$/i.test(norm)) return true;
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

// ----------------------
// Health
// ----------------------
app.get('/health', (_req: Request, res: Response) => res.json({ ok: true }));

app.get('/health/db', async (_req: Request, res: Response) => {
  try {
    const rows = await q<{ now: string }>('select now() as now');
    res.json({ ok: true, now: rows[0]?.now });
  } catch (e) {
    res.status(500).json({ ok: false, error: (e as Error).message });
  }
});

// ----------------------
// Debug helpers
// ----------------------
app.get('/debug/env', (_req: Request, res: Response) => {
  res.json({
    ADMIN_EMAIL: (process.env.ADMIN_EMAIL || '').toString(),
    SWA_ORIGIN,
  });
});

// shows what the token actually contains (only with a token)
app.get('/debug/whoami', verifyBearer, (req: AuthenticatedRequest, res: Response) => {
  res.json({
    preferred_username: req.auth?.preferred_username,
    sub: req.auth?.sub,
    name: req.auth?.name,
    email_hint: (req.auth?.preferred_username || '').toString(),
  });
});

// shows the exact comparison the admin gate uses
app.get('/debug/admin-check', verifyBearer, (req: AuthenticatedRequest, res: Response) => {
  const adminEnv = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const fromToken = (req.auth?.preferred_username || '').trim().toLowerCase();
  res.json({
    ADMIN_EMAIL_env: adminEnv,
    preferred_username_token: fromToken,
    equal: adminEnv && fromToken ? adminEnv === fromToken : false,
  });
});

// ----------------------
// Sample protected ping
// ----------------------
app.get('/api/ping', verifyBearer, (req: AuthenticatedRequest, res: Response) => {
  res.json({
    ok: true,
    sub: req.auth?.sub,
    username: req.auth?.preferred_username,
    scope: req.auth?.scp,
  });
});

// ----------------------
// Users: init (+audit) and me
// ----------------------
app.post('/api/users/init', verifyBearer, async (req: AuthenticatedRequest, res: Response) => {
  const sub = req.auth?.sub;
  const email = (req.auth?.preferred_username as string) || '';
  const given = (req.auth as unknown as { given_name?: string })?.given_name;
  const family = (req.auth as unknown as { family_name?: string })?.family_name;
  const fullFromParts = [given, family].filter(Boolean).join(' ').trim();
  const name =
    (req.auth?.name as string) ||
    fullFromParts ||
    email.split('@')[0];

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

// Optional: who am I endpoint used by the UI (if you call it)
app.get('/api/users/me', verifyBearer, async (req: AuthenticatedRequest, res: Response) => {
  const sub = req.auth?.sub;
  if (!sub) return res.status(400).json({ error: 'missing_sub' });
  const [me] = await q<{ status: string; email: string; display_name: string }>(
    `select status, email, display_name from app_user where subject=$1`,
    [sub],
  );
  if (!me) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true, me });
});

// ----------------------
// Admin gates (email guard with normalization)
// ----------------------
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();

function isAdmin(req: AuthenticatedRequest): boolean {
  const fromToken = (req.auth?.preferred_username || '').trim().toLowerCase();
  return ADMIN_EMAIL.length > 0 && fromToken === ADMIN_EMAIL;
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

// ----------------------
// 404 + global error
// ----------------------
app.use((_req: Request, res: Response) => res.status(404).json({ error: 'not_found' }));

// final error handler (adds CORS if needed)
app.use((err: unknown, req: Request, res: Response, _next: Function) => {
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

// ----------------------
// Start
// ----------------------
const port = +(process.env.PORT || 8080);
app.listen(port, () => {
  console.log(`API listening on :${port}`);
});