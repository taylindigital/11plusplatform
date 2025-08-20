"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyBearer = verifyBearer;
const jose_1 = require("jose");
// These three values must match your tenant + API app
const TENANT_ID = '662ecf18-5239-4e7f-b4bd-a0d8e32d1026';
const SUBDOMAIN = '11plusdevuks'; // <tenantSubdomain>.ciamlogin.com
const API_AUDIENCE = process.env.API_AUDIENCE || process.env.NEXT_PUBLIC_API_AUDIENCE || ''; // <- API app's clientId (GUID)
// CIAM discovery (you already validated this)
const ISSUER = `https://${TENANT_ID}.ciamlogin.com/${TENANT_ID}/v2.0`;
const JWKS_URL = `https://${SUBDOMAIN}.ciamlogin.com/${TENANT_ID}/discovery/v2.0/keys`;
const JWKS = (0, jose_1.createRemoteJWKSet)(new URL(JWKS_URL));
async function verifyBearer(req, res, next) {
    try {
        const header = req.headers.authorization || '';
        const token = header.startsWith('Bearer ') ? header.slice(7) : null;
        if (!token)
            return res.status(401).json({ error: 'missing_authorization' });
        if (!API_AUDIENCE)
            return res.status(500).json({ error: 'api_not_configured' });
        const { payload } = await (0, jose_1.jwtVerify)(token, JWKS, {
            issuer: ISSUER,
            audience: API_AUDIENCE, // aud must equal API app clientId (GUID)
        });
        req.auth = payload;
        return next();
    }
    catch (e) {
        return res.status(401).json({ error: 'invalid_token', detail: e.message });
    }
}
