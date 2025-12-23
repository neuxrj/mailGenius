import path from 'node:path'

export const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
]
export const TOKEN_PATH = path.join(process.cwd(), 'token.json')
export const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json')
export const SQLITE_PATH = process.env.SQLITE_PATH ?? path.join(process.cwd(), 'gmail.sqlite')
export const LOG_DB_PATH = process.env.LOG_DB_PATH ?? path.join(process.cwd(), 'log.sqlite')
export const AGENT_DB_PATH = process.env.AGENT_DB_PATH ?? path.join(process.cwd(), 'agent.sqlite')
export const PORT = Number(process.env.PORT ?? 3000)
export let REDIRECT_URI = process.env.REDIRECT_URI ?? ''
export const AUTO_SYNC_MINUTES = Number(process.env.AUTO_SYNC_MINUTES ?? 0)
export const LOG_PATH = process.env.LOG_PATH
export const DEBUG = process.env.DEBUG === '1' || process.env.DEBUG === 'true'

export function setRedirectUri(uri: string) {
  REDIRECT_URI = uri
}
