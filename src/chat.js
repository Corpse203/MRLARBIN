import WebSocket from 'ws';
import { sendChatMessage } from './graphql.js';
import { CONFIG } from './config.js';

const WS_ENDPOINT = 'wss://api-ws.dlive.tv';

export function startChatListener(getValidUserAccessToken) {
  let ws;
  let reconnectTimer;

  const connect = async () => {
    clearTimeout(reconnectTimer);
    ws = new WebSocket(WS_ENDPOINT);

    ws.on('open', async () => {
      const userToken = await getValidUserAccessToken();
      ws.send(JSON.stringify({
        type: 'connection_init',
        payload: { authorization: userToken }
      }));
      ws.send(JSON.stringify({
        id: '1',
        type: 'start',
        payload: {
          query: `subscription{
            streamMessageReceived(streamer: "${CONFIG.streamerUsername}") { __typename type id content sender{username displayname} }
          }`
        }
      }));
      console.log('WS connected & subscribed to chat.');
    });

    ws.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw);
        if (msg.type === 'ka' || msg.type === 'connection_ack') return;
        if (msg.type !== 'data') return;

        const items = msg?.payload?.data?.streamMessageReceived || [];
        for (const it of items) {
          if (it.__typename === 'ChatText' && typeof it.content === 'string') {
            const text = it.content.trim();
            if (/^!discord\b/i.test(text)) {
              const token = await getValidUserAccessToken();
              await sendChatMessage(CONFIG.streamerUsername, CONFIG.botReplyText, token);
              console.log(`Replied to !discord with: "${CONFIG.botReplyText}"`);
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
      ws.close();
    });
  };

  connect();
}
