import axios from 'axios';

const GRAPHQL_HTTP = 'https://graphigo.prd.dlive.tv/';

export async function postGraphQL(query, variables, accessToken) {
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
 * Mutation correcte = sendStreamchatMessage(input: { streamer: "...", message: "..." })
 * La réponse n’a probablement pas de champ id, donc on demande juste un booléen ok.
 */
export async function sendChatMessage(streamerUsername, message, userAccessToken) {
  const mutation = `
    mutation($input: SendStreamchatMessageInput!) {
      sendStreamchatMessage(input: $input) {
        ok
      }
    }
  `;

  const variables = {
    input: {
      streamer: streamerUsername,
      message: message
    }
  };

  return await postGraphQL(mutation, variables, userAccessToken);
}
