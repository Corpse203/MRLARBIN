import axios from 'axios';
import { CONFIG } from './config.js';

const AUTHORIZE_URL = 'https://dlive.tv/o/authorize';
const TOKEN_URL = 'https://dlive.tv/o/token';

/** URL d’auth (Authorization Code) — nécessite au moins 1 scope */
export function buildAuthUrl(state = 'xyz') {
  const scopes = encodeURIComponent('email:read');
  const redirect = encodeURIComponent(`${CONFIG.baseUrl}/oauth/callback`);
  return `${AUTHORIZE_URL}?client_id=${CONFIG.clientId}&redirect_uri=${redirect}&response_type=code&scope=${scopes}&state=${state}`;
}

/** Échange du code pour tokens utilisateur */
export async function exchangeCodeForTokens(code) {
  const redirect_uri = `${CONFIG.baseUrl}/oauth/callback`;
  const auth = Buffer.from(`${CONFIG.clientId}:${CONFIG.clientSecret}`).toString('base64');

  const res = await axios.post(
    TOKEN_URL,
    new URLSearchParams({
      grant_type: 'authorization_code',
      redirect_uri,
      code
    }),
    { headers: { Authorization: `Basic ${auth}` } }
  );

  return res.data; // { access_token, refresh_token, ... }
}

/** Refresh token utilisateur */
export async function refreshAccessToken(refreshToken, scopeSubset) {
  const auth = Buffer.from(`${CONFIG.clientId}:${CONFIG.clientSecret}`).toString('base64');
  const params = { grant_type: 'refresh_token', refresh_token: refreshToken };
  if (scopeSubset) params.scope = scopeSubset;

  const res = await axios.post(
    TOKEN_URL,
    new URLSearchParams(params),
    { headers: { Authorization: `Basic ${auth}` } }
  );
  return res.data; // { access_token, refresh_token, ... }
}

/** === App Access Token (client_credentials) pour le WS === */
export async function getAppAccessToken() {
  const auth = Buffer.from(`${CONFIG.clientId}:${CONFIG.clientSecret}`).toString('base64');
  const res = await axios.post(
    TOKEN_URL,
    new URLSearchParams({ grant_type: 'client_credentials' }),
    { headers: { Authorization: `Basic ${auth}` } }
  );
  return res.data.access_token; // à utiliser pour le WebSocket
}
