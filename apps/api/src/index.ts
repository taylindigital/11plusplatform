import express, { type Request, type Response } from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { verifyBearer, type AuthenticatedRequest } from './auth.js';

const app = express();

const SWA_ORIGIN = process.env.SWA_ORIGIN || 'https://nice-ocean-0e8063c03.2.azurestaticapps.net';
app.use(cors({ origin: [SWA_ORIGIN], credentials: false }));

app.use(express.json());
app.use(morgan('tiny'));

app.get('/health', (_req: Request, res: Response) => res.json({ ok: true }));

app.get('/api/ping', verifyBearer, (req: AuthenticatedRequest, res: Response) => {
  res.json({
    ok: true,
    sub: req.auth?.sub,
    username: req.auth?.preferred_username,
    scope: req.auth?.scp,
  });
});

app.use((_req: Request, res: Response) => res.status(404).json({ error: 'not_found' }));

const port = +(process.env.PORT || 8080);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`API listening on :${port}`);
});