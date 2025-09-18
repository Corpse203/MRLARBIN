# MrLarbin — Bot DLive (Node.js)

Répond à `!discord` par :

```
DLIVE CEST DE LA MERDE MON BOT FONCTIONNE
```

## 1) Prérequis

- App DLive fournie par l'équipe (Client ID/Secret) et **Bot Account** activé sur votre compte (lié à `skrymi.com`).
- URL de redirection OAuth autorisée par DLive (voir § OAuth).

Docs officielles :
- OAuth 2.0 (flow Authorization Code + refresh) — docs.dlive.tv
- WebSocket GraphQL (écoute du chat) — docs.dlive.tv
- Bot Account (tokens, slow mode, etc.) — docs.dlive.tv

## 2) Configuration locale

```bash
git clone <VOTRE_REPO_GIT>.git mrlarbin-dlive-bot
cd mrlarbin-dlive-bot
npm i
cp .env.example .env
# éditez .env
# - DLIVE_CLIENT_ID / DLIVE_CLIENT_SECRET
# - STREAMER_USERNAME=skrymi
# - PUBLIC_BASE_URL=http://localhost:3000
npm run dev
```
Ouvrir http://localhost:3000 puis cliquer **Connecter le bot via OAuth**. Une fois validé, les tokens sont affichés et le bot commence à écouter le chat.

## 3) Déploiement Render

1. Créez un **Web Service** (Node) depuis ce repo.
2. **Environment → Variables** :
   - `DLIVE_CLIENT_ID`
   - `DLIVE_CLIENT_SECRET`
   - `STREAMER_USERNAME=skrymi`
   - `BOT_REPLY_TEXT=DLIVE CEST DE LA MERDE MON BOT FONCTIONNE`
   - `PUBLIC_BASE_URL=https://skrymi.com` *(recommandé, si vous faites le reverse-proxy)*
     - À défaut : mettez l’URL Render `https://<service>.onrender.com` et **demandez à DLive** d’ajouter cette URL comme redirect.
3. Build/Start → Render lancera `npm start`.
4. Ouvrez `https://skrymi.com/auth` (ou l’URL Render `/auth`) pour compléter l’OAuth.
5. La page de callback affiche `DLIVE_USER_ACCESS_TOKEN` et `DLIVE_USER_REFRESH_TOKEN` :
   - Copiez-les dans **Environment** Render.
   - Redeploy.

## 4) Brancher `skrymi.com` (reverse proxy vers Render)

Si vous voulez que l’OAuth se fasse sur **skrymi.com**:

- **DNS** : pointez `skrymi.com` (ou `bot.skrymi.com`) vers votre reverse proxy (ex: votre VPS / Nginx) ou utilisez Cloudflare → Page Rule / Worker pour proxy vers `https://<service>.onrender.com`.
- **Nginx** (exemple minimal) :
```nginx
server {
  server_name skrymi.com;
  location / {
    proxy_pass https://<service>.onrender.com;
    proxy_set_header Host <service>.onrender.com;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
}
```
- **IMPORTANT** : informez DLive que l’URL de redirection est `https://skrymi.com/oauth/callback`.

> Alternative : si vous ne pouvez pas faire le reverse-proxy, utilisez directement `https://<service>.onrender.com` comme `PUBLIC_BASE_URL` et demandez à DLive d’autoriser cette URL de callback.

## 5) Fichiers

- `src/server.js` — serveur express, routes OAuth, lancement du listener chat
- `src/auth.js` — helpers OAuth (authorize URL, échange de code, refresh token)
- `src/chat.js` — WebSocket `wss://api-ws.dlive.tv` et écoute des messages
- `src/graphql.js` — mutation GraphQL HTTP pour **envoyer** un message dans le chat
- `src/config.js` — lecture des variables d’environnement

## 6) Sécurité

- Ne commitez jamais `DLIVE_CLIENT_SECRET` ni les access tokens, gardez-les en variables d’environnement.
- `BOT_REPLY_TEXT` est configurable via `.env`.

## 7) Test

Dans le chat du streamer `skrymi`, tapez `!discord` → le bot répondra.

---

Bon stream !
