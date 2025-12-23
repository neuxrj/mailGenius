import { google } from 'googleapis'
import { ensureDatabase, migrateUnknownAccountEmail } from './db'
import { logInteraction } from './logDb'

type GmailHeader = { name?: string; value?: string }
const LOG_SOURCE = 'src/sync.ts'

export type NormalizedMessage = {
  id: string
  threadId?: string | null
  internalDate?: number | null
  date?: string | null
  from?: string | null
  to?: string | null
  subject?: string | null
  snippet?: string | null
  isRead?: number
  bodyText?: string | null
  bodyHtml?: string | null
  raw?: string
  priority?: number
}

function parseDateOnly(dateStr: string): Date {
  const match = /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
  if (!match) {
    throw new Error(`Invalid date format: ${dateStr}. Use YYYY-MM-DD.`)
  }
  const d = new Date(`${dateStr}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid date value: ${dateStr}.`)
  }
  return d
}

function formatDateUTC(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
    d.getUTCDate(),
  ).padStart(2, '0')}`
}

function addDaysUTC(date: Date, days: number): Date {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function toGmailQueryRange(from: string, to: string): { after: string; before: string } {
  const fromDate = parseDateOnly(from)
  const toDate = parseDateOnly(to)
  if (fromDate > toDate) {
    throw new Error('from must be <= to')
  }
  const after = fromDate
  const before = addDaysUTC(toDate, 1)

  const toQueryDate = (d: Date) =>
    `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(
      d.getUTCDate(),
    ).padStart(2, '0')}`

  return { after: toQueryDate(after), before: toQueryDate(before) }
}

function toGmailQueryRangeMs(fromMs: number, toMs: number): { after: number; before: number } {
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) {
    throw new Error('Invalid timestamp range.')
  }
  if (fromMs >= toMs) {
    throw new Error('from must be < to')
  }
  const after = Math.floor(fromMs / 1000)
  const before = Math.floor(toMs / 1000)
  return { after, before }
}

export function defaultRange(): { from: string; to: string } {
  const today = new Date()
  const utcToday = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  )
  const from = formatDateUTC(addDaysUTC(utcToday, -6))
  const to = formatDateUTC(utcToday)
  return { from, to }
}

export function defaultSentRange(): { from: string; to: string } {
  const today = new Date()
  const utcToday = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  )
  const from = formatDateUTC(addDaysUTC(utcToday, -29))
  const to = formatDateUTC(utcToday)
  return { from, to }
}

function getHeader(headers: GmailHeader[] | undefined, name: string): string | null {
  if (!headers) return null
  const found = headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())
  return found?.value ?? null
}

function decodeBase64(data: string): string {
  const normalized = data.replace(/-/g, '+').replace(/_/g, '/')
  return Buffer.from(normalized, 'base64').toString('utf8')
}

function extractBody(payload: any): { text: string | null; html: string | null } {
  const bodies: { text: string | null; html: string | null } = { text: null, html: null }

  const walk = (part: any) => {
    if (!part) return
    if (part.mimeType === 'text/plain' && part.body?.data && !bodies.text) {
      bodies.text = decodeBase64(part.body.data)
    }
    if (part.mimeType === 'text/html' && part.body?.data && !bodies.html) {
      bodies.html = decodeBase64(part.body.data)
    }
    if (Array.isArray(part.parts)) {
      part.parts.forEach(walk)
    }
  }

  walk(payload)
  return bodies
}

export async function syncMessages(auth: any, accountEmail: string, from: string, to: string) {
  const gmail = google.gmail({ version: 'v1', auth })
  const { after, before } = toGmailQueryRange(from, to)
  const q = `after:${after} before:${before}`
  const db = await ensureDatabase()
  await migrateUnknownAccountEmail(db, accountEmail)

  let pageToken: string | undefined
  let processedCount = 0
  void logInteraction(LOG_SOURCE, `syncMessages start account=${accountEmail} from=${from} to=${to}`)

  do {
    const listResponse = await gmail.users.messages.list({
      userId: 'me',
      q,
      pageToken,
      maxResults: 100,
    })

    const messages = listResponse.data.messages ?? []
    const hasNext = Boolean(listResponse.data.nextPageToken)
    void logInteraction(
      LOG_SOURCE,
      `syncMessages list count=${messages.length} page=${pageToken ?? 'first'} next=${hasNext}`,
    )
    for (const msg of messages) {
      if (!msg.id) continue
      const messageResponse = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id,
        format: 'full',
      })

      const message = messageResponse.data
      const payload = message.payload
      const headers = payload?.headers as GmailHeader[] | undefined
      const { text, html } = extractBody(payload)

      await saveMessage(db, accountEmail, {
        id: message.id!,
        threadId: message.threadId ?? null,
        internalDate: message.internalDate ? Number(message.internalDate) : null,
        date: getHeader(headers, 'Date'),
        from: getHeader(headers, 'From'),
        to: getHeader(headers, 'To'),
        subject: getHeader(headers, 'Subject'),
        snippet: message.snippet ?? null,
        isRead: message.labelIds?.includes('UNREAD') ? 0 : 1,
        bodyText: text,
        bodyHtml: html,
        raw: JSON.stringify(message),
        priority: 0, // 批量导入设为未分析
      })

      processedCount += 1
    }

    pageToken = listResponse.data.nextPageToken ?? undefined
  } while (pageToken)

  await db.close()
  void logInteraction(
    LOG_SOURCE,
    `syncMessages done processed=${processedCount} account=${accountEmail} from=${from} to=${to}`,
  )
  return { processedCount, from, to }
}

export async function syncMessagesByTimestamp(
  auth: any,
  accountEmail: string,
  fromMs: number,
  toMs: number,
) {
  const gmail = google.gmail({ version: 'v1', auth })
  const { after, before } = toGmailQueryRangeMs(fromMs, toMs)
  const q = `after:${after} before:${before}`
  const db = await ensureDatabase()
  await migrateUnknownAccountEmail(db, accountEmail)

  let pageToken: string | undefined
  let processedCount = 0
  const newMessageIds: string[] = []

  do {
    const listResponse = await gmail.users.messages.list({
      userId: 'me',
      q,
      pageToken,
      maxResults: 100,
    })

    const messages = listResponse.data.messages ?? []
    for (const msg of messages) {
      if (!msg.id) continue
      const messageResponse = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id,
        format: 'full',
      })

      const message = messageResponse.data
      const payload = message.payload
      const headers = payload?.headers as GmailHeader[] | undefined
      const { text, html } = extractBody(payload)

      await saveMessage(db, accountEmail, {
        id: message.id!,
        threadId: message.threadId ?? null,
        internalDate: message.internalDate ? Number(message.internalDate) : null,
        date: getHeader(headers, 'Date'),
        from: getHeader(headers, 'From'),
        to: getHeader(headers, 'To'),
        subject: getHeader(headers, 'Subject'),
        snippet: message.snippet ?? null,
        isRead: message.labelIds?.includes('UNREAD') ? 0 : 1,
        bodyText: text,
        bodyHtml: html,
        raw: JSON.stringify(message),
        priority: 1, // 自动同步新邮件默认为低优先级
      })

      newMessageIds.push(message.id!)
      processedCount += 1
    }

    pageToken = listResponse.data.nextPageToken ?? undefined
  } while (pageToken)

  await db.close()
  return { processedCount, fromMs, toMs, newMessageIds }
}

export async function saveMessage(db: any, accountEmail: string, msg: NormalizedMessage) {
  await db.run(
    `
      INSERT OR REPLACE INTO gmail_messages (
        account_email,
        message_id,
        thread_id,
        internal_date,
        date,
        from_email,
        to_email,
        subject,
        snippet,
        is_read,
        body_text,
        body_html,
        raw,
        priority
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      accountEmail,
      msg.id,
      msg.threadId ?? null,
      msg.internalDate ?? null,
      msg.date ?? null,
      msg.from ?? null,
      msg.to ?? null,
      msg.subject ?? null,
      msg.snippet ?? null,
      msg.isRead ?? 1,
      msg.bodyText ?? null,
      msg.bodyHtml ?? null,
      msg.raw ?? null,
      msg.priority ?? 0,
    ],
  )
}
