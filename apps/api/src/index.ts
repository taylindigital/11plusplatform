import express, { type Request, type Response } from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { verifyBearer, type AuthenticatedRequest } from './auth.js';
import { q } from './db.js';

// ---- create app FIRST
const app = express();

// ---- config & middleware
const SWA_ORIGIN =
  process.env.SWA_ORIGIN || 'https://nice-ocean-0e8063c03.2.azurestaticapps.net';
app.use(cors({ origin: [SWA_ORIGIN], credentials: false }));

app.use(express.json());
app.use(morgan('tiny'));

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

// ---- users init/me
app.post('/api/users/init', verifyBearer, async (req: AuthenticatedRequest, res: Response) => {
  const sub = req.auth?.sub;
  const email = (req.auth?.preferred_username as string) || '';
  const name = (req.auth?.name as string) || '';
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

app.get('/api/users/me', verifyBearer, async (req: AuthenticatedRequest, res: Response) => {
  const sub = req.auth?.sub;
  const rows = await q(
    `select subject, email, display_name, status from app_user where subject=$1`,
    [sub],
  );
  if (!rows.length) return res.status(404).json({ error: 'not_found' });
  res.json(rows[0]);
});

// ---- admin approve/reject (email guard for now)
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').toLowerCase();

app.post('/api/admin/users/:subject/approve', verifyBearer, async (req: AuthenticatedRequest, res: Response) => {
  if ((req.auth?.preferred_username || '').toLowerCase() !== ADMIN_EMAIL) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const subject = req.params.subject;
  await q(`update app_user set status='approved', updated_at=now() where subject=$1`, [subject]);
  await q(`insert into app_user_audit (subject, action, actor) values ($1,'approved',$2)`, [subject, ADMIN_EMAIL]);
  res.json({ ok: true });
});

app.post('/api/admin/users/:subject/reject', verifyBearer, async (req: AuthenticatedRequest, res: Response) => {
  if ((req.auth?.preferred_username || '').toLowerCase() !== ADMIN_EMAIL) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const subject = req.params.subject;
  await q(`update app_user set status='rejected', updated_at=now() where subject=$1`, [subject]);
  await q(`insert into app_user_audit (subject, action, actor) values ($1,'rejected',$2)`, [subject, ADMIN_EMAIL]);
  res.json({ ok: true });
});

// Admin: list users (optionally filter by status)
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
  res.json(rows);
});

// ---- 404
app.use((_req: Request, res: Response) => res.status(404).json({ error: 'not_found' }));

// ---- start
const port = +(process.env.PORT || 8080);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`API listening on :${port}`);
});