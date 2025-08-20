"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const morgan_1 = __importDefault(require("morgan"));
const auth_js_1 = require("./auth.js");
const db_js_1 = require("./db.js");
// ---- create app FIRST
const app = (0, express_1.default)();
// ---- config & middleware
const SWA_ORIGIN = process.env.SWA_ORIGIN || 'https://nice-ocean-0e8063c03.2.azurestaticapps.net';
app.use((0, cors_1.default)({ origin: [SWA_ORIGIN], credentials: false }));
app.use(express_1.default.json());
app.use((0, morgan_1.default)('tiny'));
// ---- health endpoints
app.get('/health', (_req, res) => res.json({ ok: true }));
app.get('/health/db', async (_req, res) => {
    try {
        const rows = await (0, db_js_1.q)('select now() as now');
        res.json({ ok: true, now: rows[0]?.now });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});
// ---- protected sample
app.get('/api/ping', auth_js_1.verifyBearer, (req, res) => {
    res.json({
        ok: true,
        sub: req.auth?.sub,
        username: req.auth?.preferred_username,
        scope: req.auth?.scp,
    });
});
// ---- users init/me
app.post('/api/users/init', auth_js_1.verifyBearer, async (req, res) => {
    const sub = req.auth?.sub;
    const email = req.auth?.preferred_username || '';
    const given = req.auth?.given_name;
    const family = req.auth?.family_name;
    const fullFromParts = [given, family].filter(Boolean).join(' ').trim();
    const name = req.auth?.name ||
        fullFromParts ||
        email.split('@')[0]; // last-resort: local part of email
    if (!sub || !email)
        return res.status(400).json({ error: 'missing_claims' });
    await (0, db_js_1.q)(`
    insert into app_user (subject, email, display_name, status)
    values ($1, $2, $3, 'pending')
    on conflict (subject) do update set
      email = excluded.email,
      display_name = excluded.display_name,
      updated_at = now()
  `, [sub, email, name]);
    await (0, db_js_1.q)(`insert into app_user_audit (subject, action, details)
     values ($1, 'created', jsonb_build_object('email',$2,'name',$3))`, [sub, email, name]);
    const [me] = await (0, db_js_1.q)(`select status from app_user where subject=$1`, [sub]);
    res.json({ ok: true, status: me?.status || 'pending' });
});
// ---- admin approve/reject (email guard for now)
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').toLowerCase();
app.post('/api/admin/users/:subject/approve', auth_js_1.verifyBearer, async (req, res) => {
    if ((req.auth?.preferred_username || '').toLowerCase() !== ADMIN_EMAIL) {
        return res.status(403).json({ error: 'forbidden' });
    }
    const subject = req.params.subject;
    await (0, db_js_1.q)(`update app_user set status='approved', updated_at=now() where subject=$1`, [subject]);
    await (0, db_js_1.q)(`insert into app_user_audit (subject, action, actor) values ($1,'approved',$2)`, [subject, ADMIN_EMAIL]);
    res.json({ ok: true });
});
app.post('/api/admin/users/:subject/reject', auth_js_1.verifyBearer, async (req, res) => {
    if ((req.auth?.preferred_username || '').toLowerCase() !== ADMIN_EMAIL) {
        return res.status(403).json({ error: 'forbidden' });
    }
    const subject = req.params.subject;
    await (0, db_js_1.q)(`update app_user set status='rejected', updated_at=now() where subject=$1`, [subject]);
    await (0, db_js_1.q)(`insert into app_user_audit (subject, action, actor) values ($1,'rejected',$2)`, [subject, ADMIN_EMAIL]);
    res.json({ ok: true });
});
// Admin: list users (optionally filter by status)
app.get('/api/admin/users', auth_js_1.verifyBearer, async (req, res) => {
    if ((req.auth?.preferred_username || '').toLowerCase() !== ADMIN_EMAIL) {
        return res.status(403).json({ error: 'forbidden' });
    }
    const status = req.query.status || '';
    const rows = status
        ? await (0, db_js_1.q)(`select subject, email, display_name, status, created_at, updated_at
         from app_user where status = $1
         order by created_at desc limit 200`, [status])
        : await (0, db_js_1.q)(`select subject, email, display_name, status, created_at, updated_at
         from app_user
         order by created_at desc limit 200`);
    res.json(rows);
});
// ---- 404
app.use((_req, res) => res.status(404).json({ error: 'not_found' }));
// ---- start
const port = +(process.env.PORT || 8080);
app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`API listening on :${port}`);
});
