import axios from 'axios';

const GRAPHQL_HTTP = 'https://graphigo.prd.dlive.tv/';

export async function postGraphQL(query, variables, accessToken)  {
  try {
    const res = await axios.post(
      GRAPHQL_HTTP,
      { query, variables },
      { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
    );
    if (res.data.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(res.data.errors)}`);
    }
    return res.data.data;
  } catch (e) {
    if (e.response?.data) {
      throw new Error(`HTTP ${e.response.status}: ${JSON.stringify(e.response.data)}`);
    }
    throw e;
  }
}

/**
 * Envoi d’un message dans le chat.
 * On essaie en cascade car le schéma public peut varier :
 *  1) sendChatMessage
 *  2) sendStreamchatMessage   (comme suggéré par l’erreur du serveur)
 *  3) sendStreamMessage       (fallback historique)
 */
export async function sendChatMessage(streamerUsername, message, userAccessToken) {
  const attempts = [
    {
      name: 'sendChatMessage',
      gql: `
        mutation($streamer: String!, $message: String!) {
          sendChatMessage(streamer: $streamer, message: $message) { id }
        }
      `
    },
    {
      name: 'sendStreamchatMessage',
      gql: `
        mutation($streamer: String!, $message: String!) {
          sendStreamchatMessage(streamer: $streamer, message: $message) { id }
        }
      `
    },
    {
      name: 'sendStreamMessage',
      gql: `
        mutation($streamer: String!, $message: String!) {
          sendStreamMessage(streamer: $streamer, message: $message) { id }
        }
      `
    }
  ];

  let lastErr;
  for (const { name, gql } of attempts) {
    try {
      const data = await postGraphQL(gql, { streamer: streamerUsername, message }, userAccessToken);
      if (data) {
        // succès sur cette variante
        return data;
      }
    } catch (e) {
      lastErr = e;
      // log utile côté serveur
      console.warn(`[sendChatMessage] ${name} failed:`, e.message);
      // on continue sur la variante suivante
    }
  }
  // Toutes les variantes ont échoué
  throw lastErr || new Error('All send chat mutations failed');
}
