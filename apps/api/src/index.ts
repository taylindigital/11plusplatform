import express, { type Request, type Response, type NextFunction } from 'express';
import cors, { type CorsOptions } from 'cors';
import morgan from 'morgan';
import { verifyBearer, type AuthenticatedRequest } from './auth.js';
import { q } from './db.js';

// ---- create app FIRST - 20250821-09:32am version
const app = express();

// ---- config & middleware
const SWA_ORIGIN = (process.env.SWA_ORIGIN || 'https://nice-ocean-0e8063c03.2.azurestaticapps.net').replace(/\/+$/, '');

const isAllowedOrigin = (origin: string | undefined | null): boolean => {
  if (!origin) return false;
  const norm = origin.replace(/\/+$/, '');
  if (norm === SWA_ORIGIN) return true;
  if (/^http:\/\/(localhost|127\.0\.0\.1):\d+$/i.test(norm)) return true;
  try {
    const host = new URL(norm).hostname.toLowerCase();
    if (host.endsWith('.azurestaticapps.net')) return true;
  } catch { /* ignore */ }
  return false;
};

const corsOptions: CorsOptions = {
  origin: (origin, cb) => cb(null, isAllowedOrigin(origin) ? origin : false),
  credentials: false,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type'],
  optionsSuccessStatus: 204,
  maxAge: 600,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use(express.json());
app.use(morgan('tiny'));

// ---- debug CORS endpoint
app.get('/debug/cors', (req, res) => {
  const origin = (req.headers['origin'] || '').toString();
  res.json({ origin, SWA_ORIGIN, allowed: isAllowedOrigin(origin) });
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
    username: req.auth?.preferred_username,
    scope: req.auth?.scp,
  });
});

// ---- users: init + me
app.post('/api/users/init', verifyBearer, async (req: AuthenticatedRequest, res: Response) => {
  const claims = req.auth as any;
  const sub = claims?.sub as string | undefined;
  const email =
    (claims?.preferred_username as string | undefined)
    || (claims?.emails?.[0] as string | undefined)
    || '';

  const given = (claims?.given_name as string | undefined) || '';
  const family = (claims?.family_name as string | undefined) || '';
  const nameFromParts = [given, family].filter(Boolean).join(' ').trim();
  const name = (claims?.name as string | undefined) || nameFromParts || (email.split('@')[0] || '').trim();

  if (!sub) return res.status(400).json({ error: 'missing_claim_sub', debug: { claimsPresent: Object.keys(claims || {}) } });
  if (!email) return res.status(400).json({ error: 'missing_claim_email', debug: { preferred_username: claims?.preferred_username, emails: claims?.emails } });

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

app.get('/api/users/me', verifyBearer, async (req: AuthenticatedRequest, res: Response) => {
  const sub = req.auth?.sub;
  const email =
  (req.auth?.preferred_username as string) ||
  ((req.auth as Record<string, unknown>)?.['emails'] as string[] | undefined)?.[0] ||
  '';
  const given = (req.auth as Record<string, unknown>)?.['given_name'] as string | undefined;  
  const family = (req.auth as Record<string, unknown>)?.['family_name'] as string | undefined;
  if (!sub) return res.status(401).json({ error: 'missing_claims' });
  const rows = await q<{ subject: string; email: string; display_name: string; status: string }>(
    `select subject, email, display_name, status from app_user where subject=$1`,
    [sub],
  );
  if (!rows[0]) return res.status(404).json({ error: 'not_found' });
  res.json(rows[0]);
});

// ---- admin approve/reject (email guard for now)
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').toLowerCase();

app.post('/api/admin/users/:subject/approve', verifyBearer, async (req: AuthenticatedRequest, res: Response) => {
const actorEmail =
  (req.auth?.preferred_username || '').toLowerCase() ||
  ((((req.auth as any)?.emails?.[0] as string) || '').toLowerCase());

if (actorEmail !== ADMIN_EMAIL) {
  return res.status(403).json({ error: 'forbidden' });
}
  const subject = req.params.subject;
  await q(`update app_user set status='approved', updated_at=now() where subject=$1`, [subject]);
  await q(`insert into app_user_audit (subject, action, actor) values ($1,'approved',$2)`, [subject, ADMIN_EMAIL]);
  res.json({ ok: true });
});

app.post('/api/admin/users/:subject/reject', verifyBearer, async (req: AuthenticatedRequest, res: Response) => {
const actorEmail =
  (req.auth?.preferred_username || '').toLowerCase() ||
  ((((req.auth as any)?.emails?.[0] as string) || '').toLowerCase());

if (actorEmail !== ADMIN_EMAIL) {
  return res.status(403).json({ error: 'forbidden' });
}
  const subject = req.params.subject;
  await q(`update app_user set status='rejected', updated_at=now() where subject=$1`, [subject]);
  await q(`insert into app_user_audit (subject, action, actor) values ($1,'rejected',$2)`, [subject, ADMIN_EMAIL]);
  res.json({ ok: true });
});

app.get('/api/admin/users', verifyBearer, async (req: AuthenticatedRequest, res: Response) => {
  if ((req.auth?.preferred_username || '').toLowerCase() !== ADMIN_EMAIL) {
    return res.status(403).json({ error: 'forbidden' });
  }
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

// --- TEMP: see token claims the API is using
app.get('/debug/auth', verifyBearer, (req: AuthenticatedRequest, res: Response) => {
  res.json({
    preferred_username: (req.auth?.preferred_username || '').toLowerCase(),
    emails0: (((req.auth as any)?.emails?.[0] as string) || '').toLowerCase(),
    name: (req.auth?.name || ''),
    sub: req.auth?.sub,
    scope: req.auth?.scp,
    ADMIN_EMAIL: (process.env.ADMIN_EMAIL || '').toLowerCase(),
  });
});
// --- DEBUG: see the claims the API receives
app.get('/debug/auth', verifyBearer, (req: AuthenticatedRequest, res: Response) => {
  res.json({
    preferred_username: (req.auth?.preferred_username || '').toLowerCase(),
    emails0: (((req.auth as any)?.emails?.[0] as string) || '').toLowerCase(),
    name: req.auth?.name || '',
    sub: req.auth?.sub || '',
    scope: req.auth?.scp || '',
    aud: (req.auth as any)?.aud || '',
    ADMIN_EMAIL, // from earlier helper
  });
});

// --- who am I / current status
app.get('/api/users/me', verifyBearer, async (req: AuthenticatedRequest, res: Response) => {
  const sub = req.auth?.sub || '';
  if (!sub) return res.status(400).json({ error: 'missing_sub' });

  const rows = await q<{ subject: string; email: string; display_name: string; status: string }>(
    `select subject, email, display_name, status from app_user where subject=$1`,
    [sub]
  );

  if (!rows.length) return res.status(404).json({ error: 'not_found' });
  res.json(rows[0]);
});

// ---- 404
app.use((_req: Request, res: Response) => res.status(404).json({ error: 'not_found' }));

// ---- last middleware: global error handler that still adds CORS
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  // eslint-disable-next-line no-console
  console.error('ERROR:', err);

  if (!res.headersSent) {
    const origin = String(req.headers.origin || '');
    if (isAllowedOrigin(origin)) {
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    }
  }

  const status = (err as { status?: number }).status ?? 500;
  res.status(status).json({ error: 'server_error' });
});

app.get('/api/whoami', verifyBearer, (req: AuthenticatedRequest, res: Response) => {
  res.json({
    sub: req.auth?.sub,
    preferred_username: req.auth?.preferred_username,
    emails: (req.auth as any)?.emails,
    name: req.auth?.name,
    scp: req.auth?.scp,
    iss: (req.auth as any)?.iss,
    aud: (req.auth as any)?.aud,
  });
});

// ---- start
const port = +(process.env.PORT || 8080);
app.listen(port, () => console.log(`API listening on :${port}`));