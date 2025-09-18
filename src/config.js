import 'dotenv/config';

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export const CONFIG = {
  clientId:        required('DLIVE_CLIENT_ID'),
  clientSecret:    required('DLIVE_CLIENT_SECRET'),
  streamerUsername:required('STREAMER_USERNAME'),
  botReplyText:    required('BOT_REPLY_TEXT'),
  port:            Number(process.env.PORT || 3000),
  baseUrl:         required('PUBLIC_BASE_URL'),
  userAccessToken: process.env.DLIVE_USER_ACCESS_TOKEN || '',
  userRefreshToken:process.env.DLIVE_USER_REFRESH_TOKEN || ''
};
