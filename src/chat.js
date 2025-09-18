import WebSocket from 'ws';
import { sendChatMessage } from './graphql.js';
import { CONFIG } from './config.js';

const WS_ENDPOINT = 'wss://api-ws.dlive.tv';

export function startChatListener(getValidUserAccessToken) {
  let ws;
  let reconnectTimer;

  const connect = async () => {
    clearTimeout(reconnectTimer);

    // DLive exige le sous-protocole "graphql-ws"
    ws = new WebSocket(WS_ENDPOINT, 'graphql-ws', {
      headers: { Origin: 'https://dlive.tv' }
    });

    ws.on('open', async () => {
      try {
        const userToken = await getValidUserAccessToken();

        // Handshake GraphQL over WS
        ws.send(JSON.stringify({
          type: 'connection_init',
          payload: { authorization: userToken }
        }));

        // Abonnement au chat (ATTENTION: username exact du streamer)
        const q = `subscription {
          streamMessageReceived(streamer: "${CONFIG.streamerUsername}") {
            __typename
            type
            id
            content
            sender { username displayname }
          }
        }`;

        ws.send(JSON.stringify({ id: '1', type: 'start', payload: { query: q } }));
        console.log('WS connected. Subscription sent for streamer =', CONFIG.streamerUsername);
      } catch (e) {
        console.error('WS init error:', e.message);
        try { ws.close(); } catch (_) {}
      }
    });

    ws.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw);

        // keep-alive / ack
        if (msg.type === 'ka' || msg.type === 'connection_ack') return;
        if (msg.type !== 'data') return;

        const node = msg?.payload?.data?.streamMessageReceived;
        if (!node) return;

        // La payload peut être un objet ou un tableau selon les évènements → normalise
        const events = Array.isArray(node) ? node : [node];

        for (const it of events) {
          // Debug minimal pour vérifier la réception
          if (it?.__typename && it?.sender?.username) {
            console.log(`Chat evt: ${it.__typename} from ${it.sender.username} -> ${String(it.content || '').slice(0,120)}`);
          }

          if (it.__typename === 'ChatText' && typeof it.content === 'string') {
            const text = it.content.trim();

            // Commande !discord
            if (/^!discord\b/i.test(text)) {
              try {
                const token = await getValidUserAccessToken();
                await sendChatMessage(CONFIG.streamerUsername, CONFIG.botReplyText, token);
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
