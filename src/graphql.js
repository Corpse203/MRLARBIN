import axios from 'axios';

// Endpoint GraphQL HTTP usuel côté DLive
const GRAPHQL_HTTP = 'https://graphigo.prd.dlive.tv/';

export async function postGraphQL(query, variables, accessToken) {
  const res = await axios.post(
    GRAPHQL_HTTP,
    { query, variables },
    { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
  );
  if (res.data.errors) {
    throw new Error(`GraphQL error: ${JSON.stringify(res.data.errors)}`);
  }
  return res.data.data;
}

/** Envoi d’un message dans le chat (mutation HTTP, token UTILISATEUR) */
export async function sendChatMessage(streamerUsername, message, userAccessToken) {
  // Variante 1 fréquemment exposée
  const m1 = `
    mutation($streamer: String!, $message: String!) {
      sendChatMessage(streamer: $streamer, message: $message) { id }
    }
  `;
  try {
    return await postGraphQL(m1, { streamer: streamerUsername, message }, userAccessToken);
  } catch (e) {
    // Variante 2 (fallback)
    const m2 = `
      mutation($streamer: String!, $message: String!) {
        sendStreamMessage(streamer: $streamer, message: $message) { id }
      }
    `;
    return await postGraphQL(m2, { streamer: streamerUsername, message }, userAccessToken);
  }
}
