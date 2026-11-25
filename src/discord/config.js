// src/discord/config.js
//
// Which parts of Discord are switched on, from settings read by name from
// the environment (never committed; docs/HOSTING.md, "Connecting Discord").
// Each part works without the other; with none set, there is no Discord at
// all and the game is exactly as it was.
//
//   sign-in    DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, PUBLIC_URL, SESSION_SECRET
//   the bot    DISCORD_TOKEN, DISCORD_GUILD_ID (messages, roles), and
//              DISCORD_BATTLES_CHANNEL_ID for the battles' threads
//   tests      DISCORD_API_URL, DISCORD_AUTHORIZE_URL: a stand-in Discord

const API = 'https://discord.com/api/v10'
const AUTHORIZE = 'https://discord.com/oauth2/authorize'

const set = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null)

/**
 * @returns {null | { api, authorize, publicUrl, secure, signIn, bot }}
 *   signIn  { clientId, clientSecret, sessionSecret } or null
 *   bot     { token, guildId, channelId } or null (channelId may be null)
 */
function discordConfig(env = process.env) {
  const publicUrl = set(env.PUBLIC_URL)?.replace(/\/+$/, '') ?? null
  const signIn = set(env.DISCORD_CLIENT_ID) && set(env.DISCORD_CLIENT_SECRET) && publicUrl && set(env.SESSION_SECRET)
    ? { clientId: set(env.DISCORD_CLIENT_ID), clientSecret: set(env.DISCORD_CLIENT_SECRET), sessionSecret: set(env.SESSION_SECRET) }
    : null
  // Messages carry a link to the player's tent, so the bot needs PUBLIC_URL too.
  const bot = set(env.DISCORD_TOKEN) && set(env.DISCORD_GUILD_ID) && publicUrl
    ? { token: set(env.DISCORD_TOKEN), guildId: set(env.DISCORD_GUILD_ID), channelId: set(env.DISCORD_BATTLES_CHANNEL_ID) }
    : null
  if (!signIn && !bot) return null
  return {
    api: (set(env.DISCORD_API_URL) ?? API).replace(/\/+$/, ''),
    authorize: set(env.DISCORD_AUTHORIZE_URL) ?? AUTHORIZE,
    publicUrl,
    secure: /^https:/i.test(publicUrl ?? ''),
    signIn,
    bot
  }
}

/** One plain line for the start-up log: what is on. Never a value. */
function describe(config) {
  if (!config) return 'Discord: not connected.'
  return `Discord: sign-in ${config.signIn ? 'on' : 'off'}; messages ${config.bot ? 'on' : 'off'}; battle threads ${config.bot?.channelId ? 'on' : 'off'}.`
}

module.exports = { discordConfig, describe }
