import fs from 'node:fs'
import { google } from 'googleapis'
import {
  AUTO_SYNC_MINUTES,
  CREDENTIALS_PATH,
  PORT,
  REDIRECT_URI,
  SCOPES,
  TOKEN_PATH,
  setRedirectUri,
} from './config'
import { logInteraction } from './logDb'
import { log } from './logger'

let cachedAccountEmail: string | null = null
let lastAuthError: string | null = null
const LOG_SOURCE = 'src/gmail.ts'

export function getCachedAccountEmail() {
  return cachedAccountEmail
}

export function getLastAuthError() {
  return lastAuthError
}

export function hasAnyCredential(authClient: any): boolean {
  const creds = authClient?.credentials ?? {}
  return Boolean(creds.access_token || creds.refresh_token)
}

export async function ensureAccessToken(authClient: any): Promise<boolean> {
  if (!hasAnyCredential(authClient)) return false
  try {
    const token = await authClient.getAccessToken()
    lastAuthError = null
    const ok = Boolean(token?.token)
    void logInteraction(LOG_SOURCE, `ensureAccessToken ok=${ok}`)
    return ok
  } catch (err: any) {
    lastAuthError = err?.message ?? String(err)
    log('warn', 'ensureAccessToken failed', { error: lastAuthError })
    return false
  }
}

async function loadCredentials() {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    throw new Error(`Missing ${CREDENTIALS_PATH}. Download OAuth client credentials.`)
  }
  const content = await fs.promises.readFile(CREDENTIALS_PATH, 'utf8')
  return JSON.parse(content)
}

export async function createOAuthClient() {
  const credentials = await loadCredentials()
  const config = credentials.installed ?? credentials.web ?? {}
  const { client_secret, client_id, redirect_uris } = config
  if (!client_id || !client_secret || !redirect_uris?.length) {
    throw new Error('Invalid credentials.json. Expect installed/web client info.')
  }

  const fallback = `http://localhost:${PORT.toString()}/auth/callback`
  const first = redirect_uris[0]
  const preferLoopback =
    first === 'http://localhost' || first === 'http://127.0.0.1'
      ? fallback
      : first ?? fallback

  const chosenRedirect = process.env.REDIRECT_URI ?? preferLoopback
  setRedirectUri(chosenRedirect)

  if (!redirect_uris.includes(chosenRedirect)) {
    log('warn', 'Redirect URI not in credentials.json; using it anyway', { chosenRedirect })
  }

  const client = new google.auth.OAuth2(client_id, client_secret, chosenRedirect)
  if (fs.existsSync(TOKEN_PATH)) {
    const token = await fs.promises.readFile(TOKEN_PATH, 'utf8')
    client.setCredentials(JSON.parse(token))
  }
  return client
}

export async function getAccountEmail(auth: any): Promise<string> {
  if (cachedAccountEmail) return cachedAccountEmail
  const gmail = google.gmail({ version: 'v1', auth })
  const profile = await gmail.users.getProfile({ userId: 'me' })
  const email = profile.data.emailAddress
  if (!email) throw new Error('Unable to determine account email')
  cachedAccountEmail = email
  void logInteraction(LOG_SOURCE, `getAccountEmail ok email=${email}`)
  return email
}

export function clearCachedAccount() {
  cachedAccountEmail = null
}

export async function handleOauthCallback(oauthClient: any, code: string) {
  const tokenResponse = await oauthClient.getToken(code)
  let existingRefreshToken: string | undefined =
    typeof oauthClient.credentials?.refresh_token === 'string'
      ? oauthClient.credentials.refresh_token
      : undefined
  if (!existingRefreshToken && fs.existsSync(TOKEN_PATH)) {
    try {
      const prior = JSON.parse(await fs.promises.readFile(TOKEN_PATH, 'utf8'))
      existingRefreshToken =
        typeof prior?.refresh_token === 'string' ? prior.refresh_token : undefined
    } catch {
      existingRefreshToken = undefined
    }
  }

  const mergedTokens = {
    ...tokenResponse.tokens,
    refresh_token: tokenResponse.tokens.refresh_token ?? existingRefreshToken,
  }

  oauthClient.setCredentials(mergedTokens)
  clearCachedAccount()
  void logInteraction(LOG_SOURCE, `oauth callback tokens access=${Boolean(mergedTokens.access_token)} refresh=${Boolean(mergedTokens.refresh_token)}`)
  try {
    await getAccountEmail(oauthClient)
  } catch (err: any) {
    log('warn', 'oauth callback: failed to read profile', { error: err?.message ?? String(err) })
  }
  await fs.promises.writeFile(TOKEN_PATH, JSON.stringify(mergedTokens, null, 2))
  if (!mergedTokens.refresh_token) {
    log('warn', 'oauth callback: refresh_token missing; may break after access token expires', {
      hint: 'Revoke app access in Google Account and re-authorize',
    })
  }
}

export function autoSyncEnabled(): boolean {
  return AUTO_SYNC_MINUTES > 0
}
