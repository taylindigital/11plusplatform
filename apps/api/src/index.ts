import express, { type Request, type Response, type NextFunction } from 'express';
import cors, { type CorsOptionsDelegate } from 'cors';
import morgan from 'morgan';
import { verifyBearer, type AuthenticatedRequest } from './auth.js';
import { q } from './db.js';

/* -----------------------------------------------------------------------------
   Email derivation helpers (no 'any')
----------------------------------------------------------------------------- */

function getStringClaim(obj: Record<string, unknown> | undefined, key: string): string {
  if (!obj) return '';
  const v = obj[key];
  return typeof v === 'string' ? v.trim() : '';
}

function getFirstStringArrayClaim(
  obj: Record<string, unknown> | undefined,
  key: string,
): string {
  if (!obj) return '';
  const v = obj[key];
  if (Array.isArray(v) && v.length > 0) {
    const first = v[0];
    return typeof first === 'string' ? first.trim() : '';
  }
  return '';
}

/** Tolerant email extraction from Entra/B2C/CIAM token shapes. */
function emailFromClaims(claims: Record<string, unknown> | undefined): string {
  const preferred = getStringClaim(claims, 'preferred_username');
  if (preferred) return preferred.toLowerCase();

  const email = getStringClaim(claims, 'email');
  if (email) return email.toLowerCase();

  const firstEmail = getFirstStringArrayClaim(claims, 'emails');
  if (firstEmail) return firstEmail.toLowerCase();

  const upn = getStringClaim(claims, 'upn');
  if (upn) return upn.toLowerCase();

  const uniqueName = getStringClaim(claims, 'unique_name');
  if (uniqueName) return uniqueName.toLowerCase();

  const nameId = getStringClaim(claims, 'nameid');
  if (nameId) return nameId.toLowerCase();

  return '';
}

async function deriveEmail(req: AuthenticatedRequest): Promise<string> {
  const fromToken = emailFromClaims(req.auth as Record<string, unknown> | undefined);
  if (fromToken) return fromToken;

  const sub = typeof req.auth?.sub === 'string' ? req.auth.sub : '';
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

const SWA_ORIGIN = (process.env.SWA_ORIGIN || '').replace(/\/+$/, ''); // exact SWA origin (no trailing /)
const isLocal = (o: string) => /^http:\/\/(localhost|127\.0\.0\.1):\d+$/i.test(o);

function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  const norm = origin.replace(/\/+$/, '');
  if (SWA_ORIGIN && norm === SWA_ORIGIN) return true;
  if (isLocal(norm)) return true;
  try {
    const host = new URL(norm).hostname.toLowerCase();
    if (host.endsWith('.azurestaticapps.net')) return true;
  } catch {
    /* ignore */
  }
  return false;
}

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
    res.json({ ok: true, now: rows[0]?.now, user: rows[0]?.usr });
  } catch (e) {
    res.status(500).json({ ok: false, error: (e as Error).message });
  }
});

/* -----------------------------------------------------------------------------
   Protected sample
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
   Users
----------------------------------------------------------------------------- */

app.post('/api/users/init', verifyBearer, async (req: AuthenticatedRequest, res: Response) => {
  const sub = typeof req.auth?.sub === 'string' ? req.auth.sub : '';
  const email = await deriveEmail(req);

  // Construct display name from optional claims (no 'any')
  const claims = (req.auth || {}) as Record<string, unknown>;
  const given = getStringClaim(claims, 'given_name');
  const family = getStringClaim(claims, 'family_name');
  const fullFromParts = [given, family].filter(Boolean).join(' ').trim();
  const name = (getStringClaim(claims, 'name') || fullFromParts || (email ? email.split('@')[0] : '')).trim();

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

/* -----------------------------------------------------------------------------
   Admin (email-guard)
----------------------------------------------------------------------------- */

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();

function isAdmin(req: AuthenticatedRequest): boolean {
  const actor = emailFromClaims(req.auth as Record<string, unknown> | undefined);
  return !!actor && actor === ADMIN_EMAIL;
}

app.get('/api/admin/users', verifyBearer, async (req: AuthenticatedRequest, res: Response) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'forbidden' });

  const status = typeof req.query.status === 'string' ? req.query.status.trim() : '';
  const rows =
    status !== ''
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
  if (!isAdmin(req)) return res.status(403).json({ error: 'forbidden' });
  const subject = req.params.subject;
  await q(`update app_user set status='approved', updated_at=now() where subject=$1`, [subject]);
  await q(`insert into app_user_audit (subject, action, actor) values ($1,'approved',$2)`, [
    subject,
    ADMIN_EMAIL,
  ]);
  res.json({ ok: true });
});

app.post('/api/admin/users/:subject/reject', verifyBearer, async (req: AuthenticatedRequest, res: Response) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'forbidden' });
  const subject = req.params.subject;
  await q(`update app_user set status='rejected', updated_at=now() where subject=$1`, [subject]);
  await q(`insert into app_user_audit (subject, action, actor) values ($1,'rejected',$2)`, [
    subject,
    ADMIN_EMAIL,
  ]);
  res.json({ ok: true });
});

/* -----------------------------------------------------------------------------
   404 + error handler (keeps CORS headers)
----------------------------------------------------------------------------- */

app.use((_req: Request, res: Response) => res.status(404).json({ error: 'not_found' }));

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
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

const port = Number(process.env.PORT || 8080);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`API listening on :${port}`);
});