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

  // Récupère la forme "canonique" du username (casse exacte)
  const resolveCanonicalUsername = async () => {
    try {
      const userToken = await getValidUserAccessToken();
      const q = `query($u:String!){ userByUsername(username:$u){ username displayname } }`;
      const data = await postGraphQL(q, { u: CONFIG.streamerUsername }, userToken);
      const u = data?.userByUsername?.username;
      if (u) {
        canonStreamer = u;
        console.log(`[INFO] Username canonique côté DLive = ${u} (display=${data.userByUsername.displayname})`);
      } else {
        console.warn(`[WARN] DLive ne trouve pas "${CONFIG.streamerUsername}". Vérifie la casse/le slug exact du channel.`);
      }
    } catch (e) {
      console.warn('[WARN] resolveCanonicalUsername failed:', e.message);
    }
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
      console.error('[ERR] Pré-connexion WS (app token / username):', e.message);
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

        // Abonnement au chat (username canonique)
        const q = `subscription {
          streamMessageReceived(streamer: "${canonStreamer}") {
            __typename
            type
            id
            content
            sender { username displayname }
          }
        }`;

        ws.send(JSON.stringify({ id: '1', type: 'start', payload: { query: q } }));
        console.log('WS connected. Subscription sent for streamer =', canonStreamer);
      } catch (e) {
        console.error('WS init error:', e.message);
        try { ws.close(); } catch (_) {}
      }
    });

    ws.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw);

        // keep-alive / acks
        if (msg.type && msg.type !== 'data') {
          if (msg.type !== 'ka') console.log('[WS]', msg.type);
        }
        if (msg.type !== 'data') return;

        // Normalisation en tableau
        const node = msg?.payload?.data?.streamMessageReceived;
        if (!node) return;
        const events = Array.isArray(node) ? node : [node];

        for (const it of events) {
          if (it?.__typename) {
            console.log(`Chat evt: ${it.__typename} from ${it?.sender?.username ?? 'unknown'} -> ${String(it?.content ?? '').slice(0,120)}`);
          }

          if (it.__typename === 'ChatText' && typeof it.content === 'string') {
            const text = it.content.trim();

            // Commande !discord en début de message
            if (/^!discord\b/i.test(text)) {
              try {
                // ENVOI = token UTILISATEUR (pas App token)
                const userToken = await getValidUserAccessToken();
                await sendChatMessage(canonStreamer, CONFIG.botReplyText, userToken);
                console.log(`Replied to !discord with: "${CONFIG.botReplyText}"`);
              } catch (err) {
                console.error('Failed to send chat message:', err?.message || err);
              }
            }
          }
        }
      } catch (e) {
        console.error('WS parse/handle error:', e.message);
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
