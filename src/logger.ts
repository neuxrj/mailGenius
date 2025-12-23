import fs from 'node:fs'
import { DEBUG, LOG_PATH } from './config'

type Level = 'debug' | 'info' | 'warn' | 'error'

export function log(level: Level, message: string, meta?: Record<string, unknown>) {
  if (level === 'debug' && !DEBUG) return
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    message,
    ...(meta ? { meta } : {}),
  })
  // eslint-disable-next-line no-console
  console.log(line)
  if (LOG_PATH) {
    fs.promises.appendFile(LOG_PATH, line + '\n').catch(() => undefined)
  }
}
