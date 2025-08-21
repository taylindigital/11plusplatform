import express, { type Request, type Response } from 'express';
import cors, { CorsOptionsDelegate } from 'cors';
import morgan from 'morgan';
import { verifyBearer, type AuthenticatedRequest } from './auth.js';
import { q } from './db.js';

/* -----------------------------------------------------------------------------
   Email derivation helpers
----------------------------------------------------------------------------- */

function emailFromClaimsSync(claims: Record<string, unknown> | undefined): string {
  if (!claims) return '';

  // Normalize accessor helper
  const getStr = (k: string) => {
    const v = (claims as any)[k];
    return typeof v === 'string' ? v.trim().toLowerCase() : '';
  };

  // 1) preferred_username (most common in Entra)
  const pu = getStr('preferred_username');
  if (pu) return pu;

  // 2) email (single)
  const email = getStr('email');
  if (email) return email;

  // 3) emails (array)
  const emails = (claims as any).emails;
  if (Array.isArray(emails) && emails[0]) {
    const v = String(emails[0]).trim().toLowerCase();
    if (v) return v;
  }

  // 4) upn (some tenants use this)
  const upn = getStr('upn');
  if (upn) return upn;

  // 5) unique_name (seen in some AAD tokens)
  const uniqueName = getStr('unique_name');
  if (uniqueName) return uniqueName;

  // 6) nameid (rare)
  const nameId = getStr('nameid');
  if (nameId) return nameId;

  return '';
}

async function deriveEmail(req: AuthenticatedRequest): Promise<string> {
  // Try all token claim shapes
  const fromToken = emailFromClaimsSync(req.auth as any);
  if (fromToken) return fromToken;

  // DB fallback by subject, if present
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

const SWA_ORIGIN = (process.env.SWA_ORIGIN || 'https://nice-ocean-0e8063c03.2.azurestaticapps.net').replace(/\/+$/, '');

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

// Show claims and derived email (helps confirm what the API actually sees)
app.get('/debug/claims', verifyBearer, async (req: AuthenticatedRequest, res: Response) => {
  const claims = (req.auth || {}) as Record<string, unknown>;
  const keys = Object.keys(claims).sort();
  const derivedEmail = await deriveEmail(req);
  res.json({
    keys,
    claims,           // OK for debug—remove in production
    derivedEmail,
    adminEmail: (process.env.ADMIN_EMAIL || '').toLowerCase(),
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

  const given = (req.auth as any)?.given_name as string | undefined;
  const family = (req.auth as any)?.family_name as string | undefined;
  const fullFromParts = [given, family].filter(Boolean).join(' ').trim();
  const name =
    (req.auth?.name as string) ||
    fullFromParts ||
    (email ? email.split('@')[0] : '');

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
   Admin endpoints (email-guard)
----------------------------------------------------------------------------- */

// ---- users init/me (keep your existing code above this)

// ====== Helpers ======
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();

/** Pull an email-like identifier from token claims in a tolerant way. */
function emailFromAuth(auth: unknown): string {
  const a = auth as Record<string, unknown> | undefined;
  const preferred = (a?.preferred_username as string | undefined)?.trim();
  const email = (a?.email as string | undefined)?.trim();
  const emailsArr = Array.isArray(a?.emails) ? (a!.emails as string[]) : [];
  const firstFromArray = (emailsArr[0] || '').trim();

  return (preferred || email || firstFromArray || '').toLowerCase();
}

// ====== DEBUG: see what the protected path sees ======
app.get('/debug/whoami', verifyBearer, (req: AuthenticatedRequest, res: Response) => {
  const claims = claimsFromReq(req);
  const derived = emailFromClaims(claims);

  res.json({
    ok: true,
    derivedEmail: derived,
    adminEnv: ADMIN_EMAIL,
    isAdmin: derived === ADMIN_EMAIL,
    rawClaimsKeys: Object.keys(claims || {})
  });
});

// ====== Admin endpoints (use robust email derivation) ======
app.post(
  '/api/admin/users/:subject/approve',
  verifyBearer,
  async (req: AuthenticatedRequest, res: Response) => {
    const claims = claimsFromReq(req);
    const actor = emailFromClaims(claims);

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
  },
);

app.post(
  '/api/admin/users/:subject/reject',
  verifyBearer,
  async (req: AuthenticatedRequest, res: Response) => {
    const claims = claimsFromReq(req);
    const actor = emailFromClaims(claims);
    
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
  },
);

/* -----------------------------------------------------------------------------
   Claims fallback (decode raw token if verifyBearer doesn't give enough)
----------------------------------------------------------------------------- */

function claimsFromReq(req: AuthenticatedRequest): Record<string, unknown> | undefined {
  // Prefer what verifyBearer already parsed
  if (req.auth && typeof req.auth === 'object') {
    return req.auth as Record<string, unknown>;
  }

  // Fallback: decode token payload without verifying signature
  const auth = String(req.headers.authorization || '');
  const token = auth.replace(/^Bearer\s+/i, '');
  const parts = token.split('.');
  if (parts.length !== 3) return undefined;

  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function emailFromClaims(claims: Record<string, unknown> | undefined): string {
  if (!claims) return '';

  const getStr = (k: string) => {
    const v = (claims as any)[k];
    return typeof v === 'string' ? v.trim().toLowerCase() : '';
  };

  return (
    getStr('preferred_username') ||
    getStr('email') ||
    (Array.isArray((claims as any).emails) ? String((claims as any).emails[0] || '').toLowerCase() : '') ||
    getStr('upn') ||
    getStr('unique_name') ||
    ''
  );
}

// Admin: list users (optionally filter by status)
app.get('/api/admin/users', verifyBearer, async (req: AuthenticatedRequest, res: Response) => {
  const claims = claimsFromReq(req);
  const actor = emailFromClaims(claims);
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

// ===== DEBUG: token reachability & claims (remove after debugging) =====

// Is the Authorization header arriving at the app at all?
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

// Peek at claims WITHOUT verifying signature (debug only)
app.get('/debug/peek', (req: Request, res: Response) => {
  const auth = (req.headers.authorization || '').toString();
  const token = auth.replace(/^Bearer\s+/i, '');
  const parts = token.split('.');
  let claims: Record<string, unknown> | null = null;

  try {
    if (parts.length === 3) {
      const json = Buffer.from(parts[1], 'base64url').toString('utf8');
      claims = JSON.parse(json);
    }
  } catch {
    // ignore – will return claims: null
  }

  res.json({
    ok: true,
    hasToken: Boolean(token),
    aud: claims && (claims['aud'] as string | undefined),
    preferred_username: claims && (claims['preferred_username'] as string | undefined),
    name: claims && (claims['name'] as string | undefined),
    scp: claims && (claims['scp'] as string | undefined),
    // full claims if you need them:
    // claims,
  });
});

/* -----------------------------------------------------------------------------
   404 + error handler
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