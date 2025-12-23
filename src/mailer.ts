import { google } from 'googleapis'
import { saveMessage } from './sync'
import { ensureDatabase, migrateUnknownAccountEmail } from './db'
import { logInteraction } from './logDb'
import { log } from './logger'

type SendInput = {
  to: string
  subject: string
  text?: string
  html?: string
}
const LOG_SOURCE = 'src/mailer.ts'

function encodeBase64Url(str: string) {
  return Buffer.from(str, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_')
}

function buildMime(from: string, input: SendInput): string {
  const boundary = 'mailagent_boundary'
  const headers = [
    `From: ${from}`,
    `To: ${input.to}`,
    `Subject: ${input.subject}`,
    input.html ? 'MIME-Version: 1.0' : undefined,
  ].filter(Boolean)

  if (!input.html) {
    return `${headers.join('\r\n')}\r\n\r\n${input.text ?? ''}`
  }

  const parts = [
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    input.text ?? '',
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    '',
    input.html,
    `--${boundary}--`,
  ].join('\r\n')

  return `${headers.join('\r\n')}\r\nContent-Type: multipart/alternative; boundary="${boundary}"\r\n\r\n${parts}`
}

export async function sendEmail(auth: any, accountEmail: string, input: SendInput) {
  const gmail = google.gmail({ version: 'v1', auth })
  const raw = buildMime(accountEmail, input)
  const encoded = encodeBase64Url(raw)
  const sendResult = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: encoded },
  })

  const messageId = sendResult.data.id
  if (!messageId) {
    log('warn', 'sendEmail: missing message id in send response')
    void logInteraction(LOG_SOURCE, `sendEmail missing message id to=${input.to} subject=${input.subject}`)
    return { id: null }
  }
  void logInteraction(LOG_SOURCE, `sendEmail ok id=${messageId} to=${input.to} subject=${input.subject}`)

  // Fetch full message to store locally
  try {
    const fetched = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full',
    })
    const msg = fetched.data
    const payload = msg.payload
    const headers = payload?.headers as Array<{ name?: string; value?: string }> | undefined
    const getHeader = (name: string) =>
      headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? null
    const decodeBody = (data: string | undefined) =>
      data ? Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8') : null

    const text =
      payload?.parts?.find((p) => p.mimeType === 'text/plain')?.body?.data ??
      payload?.body?.data ??
      undefined
    const html = payload?.parts?.find((p) => p.mimeType === 'text/html')?.body?.data ?? undefined

    const db = await ensureDatabase()
    await migrateUnknownAccountEmail(db, accountEmail)
    await saveMessage(db, accountEmail, {
      id: msg.id!,
      threadId: msg.threadId ?? null,
      internalDate: msg.internalDate ? Number(msg.internalDate) : null,
      date: getHeader('Date'),
      from: getHeader('From'),
      to: getHeader('To'),
      subject: getHeader('Subject'),
      snippet: msg.snippet ?? null,
      isRead: 1,
      bodyText: decodeBody(text ?? undefined),
      bodyHtml: decodeBody(html ?? undefined),
      raw: JSON.stringify(msg),
    })
    await db.close()
  } catch (err: any) {
    log('warn', 'sendEmail: storing sent message failed', { error: err?.message ?? String(err) })
  }

  return { id: messageId }
}
