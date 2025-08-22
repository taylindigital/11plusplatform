import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { NextFunction, Request, Response } from 'express';

// These three values must match your tenant + API app
const TENANT_ID = '662ecf18-5239-4e7f-b4bd-a0d8e32d1026';
const SUBDOMAIN = '11plusdevuks'; // <tenantSubdomain>.ciamlogin.com
const API_AUDIENCE = process.env.API_AUDIENCE || process.env.NEXT_PUBLIC_API_AUDIENCE || ''; // <- API app's clientId (GUID)

// CIAM discovery (you already validated this)
const ISSUER = `https://${TENANT_ID}.ciamlogin.com/${TENANT_ID}/v2.0`;
const JWKS_URL = `https://${SUBDOMAIN}.ciamlogin.com/${TENANT_ID}/discovery/v2.0/keys`;

const JWKS = createRemoteJWKSet(new URL(JWKS_URL));

export interface AuthenticatedRequest extends Request {
  auth?: {
    sub: string;
    tid: string;
    scp?: string;
    preferred_username?: string;
    name?: string;
    [k: string]: unknown;
  };
}

export async function verifyBearer(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const authz = String(req.headers.authorization || '');
    const m = authz.match(/^Bearer\s+(.+)$/i);
    if (!m) {
      return res.status(401).json({ error: 'missing_token' });
    }

    // ... verify JWT, set req.auth ...

    return next();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('verifyBearer error:', e);
    return res.status(401).json({ error: 'invalid_token' });
  }
}