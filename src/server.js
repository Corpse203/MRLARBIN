import express from 'express';
import { CONFIG } from './config.js';
import { buildAuthUrl, exchangeCodeForTokens, refreshAccessToken } from './auth.js';
import { startChatListener } from './chat.js';
import { sendChatMessage } from './graphql.js';

let memoryTokens = {
  access_token: CONFIG.userAccessToken || '',
  refresh_token: CONFIG.userRefreshToken || ''
};

const app = express();

// Page d'accueil : statut & liens
app.get('/', (_req, res) => {
  const hasTokens = Boolean(memoryTokens.access_token && memoryTokens.refresh_token);
  res.send(`
    <h1>MrLarbin (DLive)</h1>
    <p>Status OAuth: ${hasTokens ? '✅ configured' : '❌ not configured'}</p>
    <ul>
      <li><a href="/auth">1) Connecter le bot via OAuth</a></li>
      <li>Streamer: <b>${CONFIG.streamerUsername}</b></li>
      <li>Réponse: <code>${CONFIG.botReplyText}</code></li>
    </ul>
  `);
});

// Optionnel: supprimer le 404 du favicon
app.get('/favicon.ico', (_req, res) => res.status(204).end());

// Démarre l’OAuth
app.get('/auth', (_req, res) => res.redirect(buildAuthUrl('mrlarbin')));

// Callback OAuth — capture tokens utilisateur
app.get('/oauth/callback', async (req, res) => {
  const { code, error } = req.query;
  if (error) return res.status(400).send(`OAuth error: ${error}`);
  if (!code) return res.status(400).send('Missing code');

  try {
    const data = await exchangeCodeForTokens(code);
    memoryTokens.access_token = data.access_token;
    memoryTokens.refresh_token = data.refresh_token || memoryTokens.refresh_token;

    res.send(`
      <h3>OAuth OK</h3>
      <p>Tokens reçus. Le bot peut maintenant envoyer des messages.</p>
      <p><b>Copiez ces valeurs comme variables d'environnement sur Render :</b></p>
      <pre>DLIVE_USER_ACCESS_TOKEN=${memoryTokens.access_token}</pre>
      <pre>DLIVE_USER_REFRESH_TOKEN=${memoryTokens.refresh_token || '(none provided)'}</pre>
      <a href="/">Retour</a>
    `);
  } catch (e) {
    res.status(500).send('Token exchange failed: ' + e.message);
  }
});

// Fournit un access token utilisateur valide (refresh si besoin)
async function getValidUserAccessToken() {
  if (!memoryTokens.access_token && memoryTokens.refresh_token) {
    const d = await refreshAccessToken(memoryTokens.refresh_token);
    memoryTokens.access_token = d.access_token;
    memoryTokens.refresh_token = d.refresh_token || memoryTokens.refresh_token;
  }
  return memoryTokens.access_token;
}

// Route de test d’envoi (debug; à retirer en prod si tu veux)
app.get('/test-say', async (_req, res) => {
  try {
    const token = await getValidUserAccessToken();
    await sendChatMessage(CONFIG.streamerUsername, CONFIG.botReplyText, token);
    res.send('OK sent');
  } catch (e) {
    console.error('TEST /test-say failed:', e.message);
    res.status(500).send('Send failed: ' + e.message);
  }
});

// Lancement du listener WS (utilise App Token pour écouter)
startChatListener(getValidUserAccessToken);

// Serveur HTTP
app.listen(CONFIG.port, () => {
  console.log(`MrLarbin bot running on :${CONFIG.port}`);
  console.log(`Open ${CONFIG.baseUrl}/ to configure OAuth.`);
});
