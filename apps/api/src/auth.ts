// apps/api/src/auth.ts
import type { Request, Response, NextFunction } from 'express';
import { createRemoteJWKSet, jwtVerify, JWTPayload } from 'jose';

/** Extend Express Request with a place to put verified claims */
export interface AuthenticatedRequest extends Request {
  auth?: JWTPayload & Record<string, unknown>;
}

/**
 * ENV you MUST have in the App Service:
 * - API_AUDIENCE = 86e5f581-3f41-4b24-a7a1-3a987016f841
 * - CIAM_TENANT_ID = 662ecf18-5239-4e7f-b4bd-a0d8e32d1026
 * - CIAM_DOMAIN = 11plusdevuks.ciamlogin.com            (your branded subdomain)
 *
 * We accept both issuer host forms that CIAM uses:
 *   1) https://<TENANT_ID>.ciamlogin.com/<TENANT_ID>/v2.0
 *   2) https://<CIAM_DOMAIN>/<TENANT_ID>/v2.0
 *
 * And we fetch keys from: https://<CIAM_DOMAIN>/<TENANT_ID>/discovery/v2.0/keys
 * (This is stable for your tenant; jose will cache keys.)
 */
const API_AUDIENCE = (process.env.API_AUDIENCE || '').trim();
const CIAM_TENANT_ID = (process.env.CIAM_TENANT_ID || '').trim();
const CIAM_DOMAIN = (process.env.CIAM_DOMAIN || '').trim();

if (!API_AUDIENCE || !CIAM_TENANT_ID || !CIAM_DOMAIN) {
  // eslint-disable-next-line no-console
  console.warn(
    '[auth] Missing one of required envs: API_AUDIENCE, CIAM_TENANT_ID, CIAM_DOMAIN. ' +
      'Verification may fail.',
  );
}

// JWKS from your branded CIAM domain
const JWKS_URL = new URL(
  `https://${CIAM_DOMAIN}/${CIAM_TENANT_ID}/discovery/v2.0/keys`,
);
const jwks = createRemoteJWKSet(JWKS_URL);

// Accepted issuer values
const ISS_ALLOW = [
  // GUID host
  `https://${CIAM_TENANT_ID}.ciamlogin.com/${CIAM_TENANT_ID}/v2.0`,
  // branded subdomain
  `https://${CIAM_DOMAIN}/${CIAM_TENANT_ID}/v2.0`,
];

/**
 * Express middleware: verifies "Authorization: Bearer <token>" and
 * attaches the verified JWT payload to req.auth
 */
export async function verifyBearer(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const auth = (req.headers.authorization || '').toString();
    const token = auth.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      return res.status(401).json({ error: 'missing_token' });
    }

    const { payload, protectedHeader } = await jwtVerify(token, jwks, {
      algorithms: ['RS256'],
      audience: API_AUDIENCE || undefined,
      issuer: ISS_ALLOW,
      // a bit of leeway for clock skew
      clockTolerance: 60,
    });

    // Basic scope presence check (optional)
    const scp = payload['scp'];
    if (typeof scp !== 'string' || !scp.split(' ').includes('access_as_user')) {
      return res.status(403).json({ error: 'insufficient_scope', scp });
    }

    req.auth = {
      ...payload,
      // carry a few helpful bits explicitly
      _kid: protectedHeader.kid,
      _issAccepted: ISS_ALLOW.includes(payload.iss as string),
    };
    return next();
  } catch (err: any) {
    // Helpful diagnostics while we stabilize
    // eslint-disable-next-line no-console
    console.error('[auth.verifyBearer] error:', err?.code || err?.name || err, {
      audience: API_AUDIENCE,
      issAllow: ISS_ALLOW,
      jwks: JWKS_URL.toString(),
    });

    const status =
      err?.code === 'ERR_JWT_EXPIRED'
        ? 401
        : err?.code === 'ERR_JWT_CLAIM_INVALID'
        ? 401
        : 401;

    return res
      .status(status)
      .json({ error: 'invalid_token', detail: err?.message || String(err) });
  }
}