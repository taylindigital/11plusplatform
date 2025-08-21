import express, { type Request, type Response, type NextFunction } from 'express';
import cors, { type CorsOptionsDelegate } from 'cors';
import morgan from 'morgan';
import { verifyBearer, type AuthenticatedRequest } from './auth.js';
import { q } from './db.js';

/* -----------------------------------------------------------------------------
   Email/claims helpers
----------------------------------------------------------------------------- */

// Pull a string prop safely and normalize it
function getStr(obj: unknown, key: string): string {
  if (!obj || typeof obj !== 'object') return '';
  const v = (obj as Record<string, unknown>)[key];
  return typeof v === 'string' ? v.trim().toLowerCase() : '';
}

function emailFromClaimsObject(claims: Record<string, unknown> | undefined): string {
  if (!claims) return '';

  // Common places CIAM/AAD put email-like identifiers
  const preferred = getStr(claims, 'preferred_username');
  if (preferred) return preferred;

  const email = getStr(claims, 'email');
  if (email) return email;

  const emailsAny = (claims as Record<string, unknown>)['emails'];
  if (Array.isArray(emailsAny) && emailsAny[0]) {
    const first = String(emailsAny[0]).trim().toLowerCase();
    if (first) return first;
  }

  const upn = getStr(claims, 'upn');
  if (upn) return upn;

  const uniqueName = getStr(claims, 'unique_name');
  if (uniqueName) return uniqueName;

  const nameid = getStr(claims, 'nameid');
  if (nameid) return nameid;

  return '';
}

// Decode JWT payload from Authorization header WITHOUT verifying signature (debug/fallback)
function decodeHeaderClaims(req: Request): Record<string, unknown> | undefined {
  const auth = String(req.headers.authorization || '');
  const token = auth.replace(/^Bearer\s+/i, '');
  const parts = token.split('.');
  if (parts.length !== 3) return undefined;
  try {
    const json = Buffer.from(parts[1], 'base64url').toString('utf8');
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

// Derive the best email-like identifier for a request
async function deriveEmail(req: AuthenticatedRequest): Promise<string> {
  // 1) Verified claims, if middleware provided them
  const fromVerified = emailFromClaimsObject(req.auth as Record<string, unknown> | undefined);
  if (fromVerified) return fromVerified;

  // 2) Fallback to decoding the raw token claims (works because /debug/peek shows preferred_username)
  const decoded = decodeHeaderClaims(req);
  const fromDecoded = emailFromClaimsObject(decoded);
  if (fromDecoded) return fromDecoded;

  // 3) DB fallback by subject (if we have one)
  const sub = (req.auth?.sub as string) || '';
  if (sub) {
    const rows = await q<{ email: string }>(
      `select email from app_user where subject = $1 limit 1`,
      [sub],
    );
    const fromDb = (rows[0]?.email || '').trim().toLowerCase();
    if (fromDb) return fromDb;
  }

  return '';
}

/* -----------------------------------------------------------------------------
   App + CORS
----------------------------------------------------------------------------- */

const app = express();

const SWA_ORIGIN = (process.env.SWA_ORIGIN || 'https://nice-ocean-0e8063c03.2.azurestaticapps.net').replace(/\/+$/, '');

const isAllowedOrigin = (origin: string): boolean => {
  if (!origin) return false;
  const norm = origin.replace(/\/+$/, '');
  if (norm === SWA_ORIGIN) return true;
  if (norm.startsWith('http://localhost:') || norm.startsWith('http://127.0.0.1:')) return true;
  try {
    const host = new URL(norm).hostname.toLowerCase();
    if (host.endsWith('.azurestaticapps.net')) return true;
  } catch {
    // ignore
  }
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

/* -----------------------------------------------------------------------------
   Debug endpoints
----------------------------------------------------------------------------- */

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

// Show verified claims, decoded claims, and derived email (to verify pipeline end-to-end)
app.get('/debug/whoami', verifyBearer, async (req: AuthenticatedRequest, res: Response) => {
  const verified = (req.auth || {}) as Record<string, unknown>;
  const decoded = decodeHeaderClaims(req) || null;
  const derived = await deriveEmail(req);
  res.json({
    ok: true,
    verifiedKeys: Object.keys(verified).sort(),
    decodedKeys: decoded ? Object.keys(decoded).sort() : null,
    verified, // keep in while debugging; remove later
    decoded,  // keep in while debugging; remove later
    derivedEmail: derived,
    adminEmailEnv: (process.env.ADMIN_EMAIL || '').toLowerCase(),
  });
});

// Is the Authorization header arriving at all?
app.get('/debug/echo', (req: Request, res: Response) => {
  const auth = (req.headers.authorization || '').toString();
  res.json({
    ok: true,
    origin: (req.headers.origin || '').toString(),
    hasAuthHeader: Boolean(auth),
    authPrefix: auth ? auth.slice(0, 16) + '…' : '',
    method: req.method,
  });
});

// Peek claims WITHOUT verify (for quick cross-check with /debug/whoami)
app.get('/debug/peek', (req: Request, res: Response) => {
  const decoded = decodeHeaderClaims(req);
  res.json({
    ok: true,
    hasToken: Boolean(decoded),
    aud: decoded && (decoded['aud'] as string | undefined),
    preferred_username: decoded && (decoded['preferred_username'] as string | undefined),
    name: decoded && (decoded['name'] as string | undefined),
    scp: decoded && (decoded['scp'] as string | undefined),
  });
});

/* -----------------------------------------------------------------------------
   Health
----------------------------------------------------------------------------- */

app.get('/health', (_req: Request, res: Response) => res.json({ ok: true }));

app.get('/health/db', async (_req: Request, res: Response) => {
  try {
    const rows = await q<{ now: string }>('select now() as now');
    res.json({ ok: true, now: rows[0]?.now });
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
   Users init
----------------------------------------------------------------------------- */

app.post('/api/users/init', verifyBearer, async (req: AuthenticatedRequest, res: Response) => {
  const sub = (req.auth?.sub as string) || '';
  const email = await deriveEmail(req);

  const given = getStr(req.auth, 'given_name');
  const family = getStr(req.auth, 'family_name');
  const fullFromParts = [given, family].filter(Boolean).join(' ').trim();
  const name =
    getStr(req.auth, 'name') ||
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
   Admin endpoints (email-guard via derived email)
----------------------------------------------------------------------------- */

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();

app.post('/api/admin/users/:subject/approve', verifyBearer, async (req: AuthenticatedRequest, res: Response) => {
  const actor = await deriveEmail(req);
  if (!actor || actor !== ADMIN_EMAIL) {
    return res.status(403).json({ error: 'forbidden_not_admin', actor, admin: ADMIN_EMAIL });
  }
  const subject = req.params.subject;
  await q(`update app_user set status='approved', updated_at=now() where subject=$1`, [subject]);
  await q(`insert into app_user_audit (subject, action, actor) values ($1,'approved',$2)`, [subject, actor]);
  res.json({ ok: true });
});

app.post('/api/admin/users/:subject/reject', verifyBearer, async (req: AuthenticatedRequest, res: Response) => {
  const actor = await deriveEmail(req);
  if (!actor || actor !== ADMIN_EMAIL) {
    return res.status(403).json({ error: 'forbidden_not_admin', actor, admin: ADMIN_EMAIL });
  }
  const subject = req.params.subject;
  await q(`update app_user set status='rejected', updated_at=now() where subject=$1`, [subject]);
  await q(`insert into app_user_audit (subject, action, actor) values ($1,'rejected',$2)`, [subject, actor]);
  res.json({ ok: true });
});

app.get('/api/admin/users', verifyBearer, async (req: AuthenticatedRequest, res: Response) => {
  const actor = await deriveEmail(req);
  if (!actor || actor !== ADMIN_EMAIL) {
    return res.status(403).json({ error: 'forbidden_not_admin', actor, admin: ADMIN_EMAIL });
  }

  const status = (req.query.status as string) || '';
  const rows =
    status.trim() !== ''
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

/* -----------------------------------------------------------------------------
   404 + error handler (ensures CORS headers on errors)
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

const port = +(process.env.PORT || 8080);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`API listening on :${port}`);
});