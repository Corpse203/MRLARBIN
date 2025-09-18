import WebSocket from 'ws';
import { sendChatMessage, postGraphQL } from './graphql.js';
import { CONFIG } from './config.js';
import { getAppAccessToken } from './auth.js';

const WS_ENDPOINT = 'wss://api-ws.dlive.tv';

export function startChatListener(getValidUserAccessToken) {
  let ws;
  let reconnectTimer;
  let appToken = '';                   // pour WS
  let canonStreamer = CONFIG.streamerUsername; // username canonique

  // Récupère username canonique via 2 variantes : userByUsername puis fallback userByDisplayName
  const resolveCanonicalUsername = async () => {
    const run = async (query, vars, label) => {
      const tok = await getValidUserAccessToken();
      try {
        const d = await postGraphQL(query, vars, tok);
        const u = d?.userByUsername?.username ?? d?.userByDisplayName?.username;
        const disp = d?.userByUsername?.displayname ?? d?.userByDisplayName?.displayname;
        if (u) {
          console.log(`[INFO] (${label}) Username API = ${u} (display=${disp})`);
          return { u, disp };
        }
      } catch (e) {
        console.warn(`[WARN] ${label} failed:`, e.message);
      }
      return null;
    };

    // 1) userByUsername
    const q1 = `query($u:String!){ userByUsername(username:$u){ username displayname } }`;
    const r1 = await run(q1, { u: CONFIG.streamerUsername }, 'userByUsername');
    if (r1?.u) { canonStreamer = r1.u; return; }

    // 2) fallback: userByDisplayName
    const q2 = `query($d:String!){ userByDisplayName(displayname:$d){ username displayname } }`;
    const r2 = await run(q2, { d: CONFIG.streamerUsername }, 'userByDisplayName');
    if (r2?.u) { canonStreamer = r2.u; return; }

    console.warn(`[WARN] Impossible de résoudre le username pour "${CONFIG.streamerUsername}". On continue avec la valeur fournie.`);
  };

  const connect = async () => {
    clearTimeout(reconnectTimer);

    try {
      if (!appToken) {
        appToken = await getAppAccessToken();
        console.log('[INFO] App access token récupéré pour WS.');
      }
      await resolveCanonicalUsername();
    } catch (e) {
      console.error('[ERR] Pré-connexion WS:', e.message);
    }

    // DLive WS exige le sous-protocole "graphql-ws"
    ws = new WebSocket(WS_ENDPOINT, 'graphql-ws', {
      headers: { Origin: 'https://dlive.tv' }
    });

    ws.on('open', async () => {
      try {
        // Handshake GraphQL over WS avec App Token
        ws.send(JSON.stringify({
          type: 'connection_init',
          payload: { authorization: appToken }
        }));

        // Essaye 2 variantes d'abonnement
        const sub1 = `subscription {
          streamMessageReceived(streamer: "${canonStreamer}") {
            __typename
            type
            id
            content
            sender { username displayname }
          }
        }`;

        const sub2 = `subscription {
          streamChatMessage(streamer: "${canonStreamer}") {
            __typename
            type
            id
            content
            sender { username displayname }
          }
        }`;

        // On envoie d’abord sub1; si le serveur renvoie une erreur sur l’op id "1", on réessaie sub2 sur l’op id "2".
        ws.send(JSON.stringify({ id: '1', type: 'start', payload: { query: sub1 } }));
        console.log('WS connected. Subscription (v1) sent for =', canonStreamer);
      } catch (e) {
        console.error('WS init error:', e.message);
        try { ws.close(); } catch (_) {}
      }
    });

    ws.on('message', async (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { console.error('[WS] non-JSON:', raw?.toString?.()); return; }

      // Log utile pour debug
      if (msg.type && msg.type !== 'data' && msg.type !== 'ka') {
        console.log('[WS]', msg.type, JSON.stringify(msg.payload || msg, null, 2).slice(0, 500));
      }

      // Si le serveur dit "error" pour l'opération "1", on tente la variante 2
      if (msg.type === 'error' && msg.id === '1') {
        console.warn('[WS] Subscription v1 refused. Trying fallback v2...');
        const sub2 = `subscription {
          streamChatMessage(streamer: "${canonStreamer}") {
            __typename
            type
            id
            content
            sender { username displayname }
          }
        }`;
        ws.send(JSON.stringify({ id: '2', type: 'start', payload: { query: sub2 } }));
        return;
      }

      if (msg.type !== 'data') return;

      // Normalise la payload en tableau
      const root =
        msg?.payload?.data?.streamMessageReceived ??
        msg?.payload?.data?.streamChatMessage;
      if (!root) return;

      const events = Array.isArray(root) ? root : [root];
      for (const it of events) {
        if (it?.__typename) {
          console.log(`Chat evt: ${it.__typename} from ${it?.sender?.username ?? 'unknown'} -> ${String(it?.content ?? '').slice(0,120)}`);
        }

        if (it.__typename === 'ChatText' && typeof it.content === 'string') {
          const text = it.content.trim();
          if (/^!discord\b/i.test(text)) {
            try {
              const userToken = await getValidUserAccessToken(); // ENVOI = token UTILISATEUR
              await sendChatMessage(canonStreamer, CONFIG.botReplyText, userToken);
              console.log(`Replied to !discord with: "${CONFIG.botReplyText}"`);
            } catch (err) {
              console.error('Failed to send chat message:', err?.message || err);
            }
          }
        }
      }
    });

    ws.on('close', () => {
      console.warn('WS closed. Reconnecting in 3s…');
      reconnectTimer = setTimeout(connect, 3000);
    });

    ws.on('error', (err) => {
      console.error('WS error:', err.message);
      try { ws.close(); } catch (_) {}
    });
  };

  connect();
}
