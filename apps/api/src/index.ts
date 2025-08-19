import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { verifyBearer, type AuthenticatedRequest } from './auth.js';

const app = express();

// Allow your SWA origin
const SWA_ORIGIN = process.env.SWA_ORIGIN || 'https://gentle-ground-04180fa03.1.azurestaticapps.net';
app.use(cors({ origin: [SWA_ORIGIN], credentials: false }));

app.use(express.json());
app.use(morgan('tiny'));

// Health
app.get('/health', (_req, res) => res.json({ ok: true }));

// Protected test endpoint
app.get('/api/ping', verifyBearer, (req: AuthenticatedRequest, res) => {
  res.json({
    ok: true,
    sub: req.auth?.sub,
    username: req.auth?.preferred_username,
    scope: req.auth?.scp,
  });
});

// 404
app.use((_req, res) => res.status(404).json({ error: 'not_found' }));

const port = +(process.env.PORT || 8080);
app.listen(port, () => {
  console.log(`API listening on :${port}`);
});