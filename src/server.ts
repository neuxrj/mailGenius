import express, { type Request, type Response } from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { google } from 'googleapis'
import type { Server } from 'node:http'
import { ensureDatabase, migrateUnknownAccountEmail } from './db'
import {
  clearCachedAccount,
  createOAuthClient,
  ensureAccessToken,
  getAccountEmail,
  getCachedAccountEmail,
  getLastAuthError,
  handleOauthCallback,
} from './gmail'
import { log } from './logger'
import { defaultRange, defaultSentRange, saveMessage, syncMessages, syncMessagesByTimestamp } from './sync'
import { sendEmail } from './mailer'
import { AUTO_SYNC_MINUTES, PORT, REDIRECT_URI, SCOPES, SQLITE_PATH, TOKEN_PATH } from './config'
import {
  AGENT_CONFIG_PATH,
  maskApiKey,
  readAgentConfig,
  saveAgentConfig,
} from './agentConfig'
import { deleteDraft, getDraft, listDrafts, saveDraft } from './drafts'
import {
  createChatSession,
  ensureChatSession,
  getChatMessages,
  listChatSessions,
} from './chatDb'
import { logInteraction } from './logDb'
import { analyzeEmailPriority } from './agent'

let autoSyncTimer: NodeJS.Timeout | null = null
let autoSyncRunning = false
let autoSyncEnabled = AUTO_SYNC_MINUTES > 0
let autoSyncIntervalMinutes = AUTO_SYNC_MINUTES
let autoSyncLastSyncAt: number | null = autoSyncEnabled ? Date.now() : null
const LOG_SOURCE = 'src/server.ts'

async function runAutoSync(oauthClient: any) {
  if (autoSyncRunning) return
  autoSyncRunning = true
  try {
    const ok = await ensureAccessToken(oauthClient)
    if (!ok) {
      log('warn', 'auto-sync skipped: not authorized')
      void logInteraction(LOG_SOURCE, 'auto-sync skipped: not authorized')
      autoSyncRunning = false
      return
    }
    const accountEmail = await getAccountEmail(oauthClient)
    const now = Date.now()
    const fromMs = autoSyncLastSyncAt ?? now
    if (now <= fromMs) {
      autoSyncRunning = false
      return
    }
    log('info', 'auto-sync start', { accountEmail, fromMs, toMs: now })
    const result = await syncMessagesByTimestamp(oauthClient, accountEmail, fromMs, now)
    const db = await ensureDatabase()
    await migrateUnknownAccountEmail(db, accountEmail)
    const countRow = await db.get(
      `SELECT COUNT(*) as count FROM gmail_messages WHERE account_email = ?`,
      [accountEmail],
    )
    if (result.processedCount > 0) {
      await db.run(
        `
          INSERT INTO gmail_import_runs (account_email, from_date, to_date, finished_at, processed_count)
          VALUES (?, ?, ?, ?, ?)
        `,
        [accountEmail, new Date(fromMs).toISOString().split('T')[0], new Date(now).toISOString().split('T')[0], Date.now(), result.processedCount],
      )
    }
    await db.close()
    autoSyncLastSyncAt = now
    log('info', 'auto-sync finished', {
      accountEmail,
      fromMs,
      toMs: now,
      processed: result.processedCount,
      importedCount: Number(countRow?.count ?? 0),
    })
    void logInteraction(
      LOG_SOURCE,
      `auto-sync finished account=${accountEmail} processed=${result.processedCount} fromMs=${fromMs} toMs=${now}`,
    )

    // 触发 Agent 分析新邮件优先级（后台异步执行）
    if (result.processedCount > 0 && result.newMessageIds && result.newMessageIds.length > 0) {
      void analyzeEmailPriority(accountEmail, result.newMessageIds).catch(err => {
        log('warn', 'agent priority analysis failed', { error: err?.message ?? String(err) })
        void logInteraction(LOG_SOURCE, `agent priority analysis failed error=${err?.message ?? String(err)}`)
      })
    }
  } catch (err: any) {
    log('warn', 'auto-sync failed', { error: err?.message ?? String(err) })
    void logInteraction(LOG_SOURCE, `auto-sync failed error=${err?.message ?? String(err)}`)
  }
  autoSyncRunning = false
}

function scheduleAutoSync(oauthClient: any) {
  if (autoSyncTimer) {
    clearInterval(autoSyncTimer)
    autoSyncTimer = null
  }
  if (!autoSyncEnabled || autoSyncIntervalMinutes <= 0) {
    return
  }
  autoSyncTimer = setInterval(
    () => runAutoSync(oauthClient),
    autoSyncIntervalMinutes * 60 * 1000,
  )
}

export async function startServer() {
  const app = express()
  app.set('etag', false)
  app.use(express.json())
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) {
      res.set('Cache-Control', 'no-store')
    }
    const start = Date.now()
    res.on('finish', () => {
      log('info', 'http', {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        ms: Date.now() - start,
      })
    })
    next()
  })
  // Handle desktop-app redirect to root with ?code=...
  app.use((req, res, next) => {
    if (req.path === '/' && typeof req.query.code === 'string') {
      res.redirect(`/auth/callback?code=${encodeURIComponent(String(req.query.code))}`)
      return
    }
    next()
  })
  app.use(express.static(process.cwd() + '/public'))

  const oauthClient = await createOAuthClient()

  if (oauthClient.credentials?.access_token) {
    getAccountEmail(oauthClient).catch(() => undefined)
  }

  if (autoSyncEnabled) {
    log('info', 'auto-sync enabled', { minutes: autoSyncIntervalMinutes })
    scheduleAutoSync(oauthClient)
    setTimeout(() => runAutoSync(oauthClient), 5_000)
  }

  app.get('/api/auto-sync', (_req: Request, res: Response) => {
    res.json({
      enabled: autoSyncEnabled,
      intervalMinutes: autoSyncIntervalMinutes,
      lastSyncAt: autoSyncLastSyncAt,
    })
  })

  app.post('/api/auto-sync', (req: Request, res: Response) => {
    const { enabled, intervalMinutes } = req.body ?? {}
    autoSyncEnabled = Boolean(enabled)
    if (typeof intervalMinutes === 'number' && Number.isFinite(intervalMinutes)) {
      autoSyncIntervalMinutes = Math.max(1, Math.floor(intervalMinutes))
    }
    if (autoSyncEnabled) {
      autoSyncLastSyncAt = Date.now()
    }
    scheduleAutoSync(oauthClient)
    res.json({
      enabled: autoSyncEnabled,
      intervalMinutes: autoSyncIntervalMinutes,
      lastSyncAt: autoSyncLastSyncAt,
    })
  })

  app.get('/api/status', async (req: Request, res: Response) => {
    const authorized = await ensureAccessToken(oauthClient)
    let email: string | null = null
    if (authorized) {
      try {
        email = await getAccountEmail(oauthClient)
      } catch {
        email = null
      }
    }
    res.json({
      authorized,
      email,
      hasRefreshToken: Boolean(oauthClient.credentials?.refresh_token),
      lastAuthError: getLastAuthError(),
    })
  })

  app.get('/api/profile', async (req: Request, res: Response) => {
    const ok = await ensureAccessToken(oauthClient)
    if (!ok) {
      res.json({ authorized: false })
      return
    }
    try {
      const email = await getAccountEmail(oauthClient)
      const db = await ensureDatabase()
      await migrateUnknownAccountEmail(db, email)
      const row = await db.get(
        `SELECT COUNT(*) as count FROM gmail_messages WHERE account_email = ?`,
        [email],
      )
      await db.close()
      res.json({ authorized: true, email, importedCount: Number(row?.count ?? 0), sqlitePath: SQLITE_PATH })
    } catch (err: any) {
      log('error', 'api/profile failed', { error: err?.message ?? String(err) })
      res.status(500).json({ error: err?.message ?? 'Failed to load profile' })
    }
  })

  app.get('/api/debug', async (req: Request, res: Response) => {
    const db = await ensureDatabase()
    const totalRow = await db.get(`SELECT COUNT(*) as count FROM gmail_messages`)
    const runsRow = await db.get(`SELECT COUNT(*) as count FROM gmail_import_runs`)
    await db.close()

    res.json({
      port: PORT,
      redirectUri: REDIRECT_URI,
      sqlitePath: SQLITE_PATH,
      tokenPathExists: fs.existsSync(TOKEN_PATH),
      hasAccessToken: Boolean(oauthClient.credentials?.access_token),
      hasRefreshToken: Boolean(oauthClient.credentials?.refresh_token),
      expiryDate: oauthClient.credentials?.expiry_date ?? null,
      cachedAccountEmail: getCachedAccountEmail(),
      lastAuthError: getLastAuthError(),
      totalMessages: Number(totalRow?.count ?? 0),
      importRuns: Number(runsRow?.count ?? 0),
    })
  })

  app.get('/api/messages', async (req: Request, res: Response) => {
    const ok = await ensureAccessToken(oauthClient)
    if (!ok) {
      res.status(401).json({ error: 'Not authorized. Login first.' })
      return
    }
    try {
      const accountEmail = await getAccountEmail(oauthClient)
      const order = req.query.order === 'asc' ? 'ASC' : 'DESC'
      const limit = Math.min(Number(req.query.limit ?? 50), 200)
      const offset = Math.max(Number(req.query.offset ?? 0), 0)
      const includeSent = req.query.include_sent === '1'
      const readFilter = typeof req.query.read === 'string' ? req.query.read : 'all'
      const priorityFilter = typeof req.query.priority === 'string' ? req.query.priority : 'all'

      const whereClauses: string[] = []
      const params: Array<string | number> = []

      whereClauses.push('account_email = ?')
      params.push(accountEmail)
      if (!includeSent) {
        whereClauses.push('COALESCE(from_email, \'\') NOT LIKE ?')
        params.push(`%${accountEmail}%`)
      }

      if (readFilter === 'read') {
        whereClauses.push('is_read = 1')
      } else if (readFilter === 'unread') {
        whereClauses.push('is_read = 0')
      }

      if (priorityFilter === '0' || priorityFilter === '1' || priorityFilter === '2') {
        whereClauses.push('priority = ?')
        params.push(Number(priorityFilter))
      }

      const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : ''
      const db = await ensureDatabase()
      await migrateUnknownAccountEmail(db, accountEmail)
      const rows = await db.all(
        `
        SELECT message_id as id, subject, from_email, date, snippet, internal_date, is_read, priority
        FROM gmail_messages
        ${whereSql}
        ORDER BY internal_date ${order}
        LIMIT ? OFFSET ?
      `,
        [...params, limit, offset],
      )
      await db.close()
      log('debug', 'api/messages ok', { accountEmail, rows: rows.length, order, limit, offset, readFilter, priorityFilter })
      res.json({ messages: rows, offset, limit })
    } catch (err: any) {
      log('error', 'api/messages failed', { error: err?.message ?? String(err) })
      res.status(500).json({ error: err?.message ?? 'Failed to load messages' })
    }
  })

  app.get('/api/search', async (req: Request, res: Response) => {
    const ok = await ensureAccessToken(oauthClient)
    if (!ok) {
      res.status(401).json({ error: 'Not authorized. Login first.' })
      return
    }
    try {
      const accountEmail = await getAccountEmail(oauthClient)
      const sender = typeof req.query.sender === 'string' ? req.query.sender.trim() : ''
      const subject = typeof req.query.subject === 'string' ? req.query.subject.trim() : ''
      const threadId = typeof req.query.thread_id === 'string' ? req.query.thread_id.trim() : ''
      const messageId = typeof req.query.message_id === 'string' ? req.query.message_id.trim() : ''
      const limit = Math.min(Number(req.query.limit ?? 50), 200)

      const whereClauses: string[] = ['account_email = ?']
      const params: Array<string | number> = [accountEmail]

      if (sender) {
        whereClauses.push('from_email LIKE ?')
        params.push(`%${sender}%`)
      }
      if (subject) {
        whereClauses.push('subject LIKE ?')
        params.push(`%${subject}%`)
      }
      if (threadId) {
        whereClauses.push('thread_id = ?')
        params.push(threadId)
      }
      if (messageId) {
        whereClauses.push('message_id = ?')
        params.push(messageId)
      }

      if (whereClauses.length === 1) {
        res.status(400).json({ error: 'Provide at least one search field.' })
        return
      }

      const whereSql = `WHERE ${whereClauses.join(' AND ')}`
      const db = await ensureDatabase()
      await migrateUnknownAccountEmail(db, accountEmail)
      const rows = await db.all(
        `
        SELECT message_id as id, subject, from_email, date, snippet, internal_date, is_read, priority
        FROM gmail_messages
        ${whereSql}
        ORDER BY internal_date DESC
        LIMIT ?
      `,
        [...params, limit],
      )
      await db.close()
      res.json({ messages: rows })
    } catch (err: any) {
      log('error', 'api/search failed', { error: err?.message ?? String(err) })
      res.status(500).json({ error: err?.message ?? 'Failed to search messages' })
    }
  })

  app.get('/api/sent', async (req: Request, res: Response) => {
    const ok = await ensureAccessToken(oauthClient)
    if (!ok) {
      res.status(401).json({ error: 'Not authorized. Login first.' })
      return
    }
    const def = defaultSentRange()
    const from = typeof req.query.from === 'string' ? req.query.from : def.from
    const to = typeof req.query.to === 'string' ? req.query.to : def.to
    try {
      const accountEmail = await getAccountEmail(oauthClient)
      const gmail = google.gmail({ version: 'v1', auth: oauthClient })
      const { after, before } = (() => {
        const fromDate = new Date(`${from}T00:00:00Z`)
        const toDate = new Date(`${to}T00:00:00Z`)
        const toQuery = (d: Date) =>
          `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(
            d.getUTCDate(),
          ).padStart(2, '0')}`
        const beforeDate = new Date(toDate)
        beforeDate.setUTCDate(beforeDate.getUTCDate() + 1)
        return { after: toQuery(fromDate), before: toQuery(beforeDate) }
      })()

      const q = `in:sent after:${after} before:${before}`
      const pageToken = typeof req.query.pageToken === 'string' ? req.query.pageToken : undefined
      const maxResults = Math.min(Number(req.query.limit ?? 50), 200)
      const listResponse = await gmail.users.messages.list({
        userId: 'me',
        q,
        maxResults,
        pageToken,
      })
      const messages = listResponse.data.messages ?? []
      const results: Array<{
        id: string
        subject: string | null
        to_email: string | null
        date: string | null
        snippet: string | null
        internal_date: number | null
      }> = []

      for (const msg of messages) {
        if (!msg.id) continue
        const messageResponse = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id,
          format: 'metadata',
          metadataHeaders: ['To', 'Subject', 'Date'],
        })
        const headers = messageResponse.data.payload?.headers ?? []
        const getHeader = (name: string) =>
          headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? null
        results.push({
          id: msg.id,
          subject: getHeader('Subject'),
          to_email: getHeader('To'),
          date: getHeader('Date'),
          snippet: messageResponse.data.snippet ?? null,
          internal_date: messageResponse.data.internalDate
            ? Number(messageResponse.data.internalDate)
            : null,
        })
      }

      void logInteraction(LOG_SOURCE, `api/sent ok count=${results.length} from=${from} to=${to}`)
      res.json({ messages: results, from, to, nextPageToken: listResponse.data.nextPageToken ?? null })
    } catch (err: any) {
      log('error', 'api/sent failed', { error: err?.message ?? String(err) })
      void logInteraction(LOG_SOURCE, `api/sent failed error=${err?.message ?? String(err)}`)
      res.status(500).json({ error: err?.message ?? 'Failed to load sent messages' })
    }
  })

  app.post('/api/send', async (req: Request, res: Response) => {
    const ok = await ensureAccessToken(oauthClient)
    if (!ok) {
      res.status(401).json({ error: 'Not authorized. Login first.' })
      return
    }
    const { to, subject, text, html } = req.body ?? {}
    if (!to || !subject) {
      res.status(400).json({ error: 'Missing "to" or "subject"' })
      return
    }
    try {
      const accountEmail = await getAccountEmail(oauthClient)
      const result = await sendEmail(oauthClient, accountEmail, {
        to,
        subject,
        text: typeof text === 'string' ? text : '',
        html: typeof html === 'string' ? html : undefined,
      })
      res.json({ id: result.id, to, subject })
    } catch (err: any) {
      log('error', 'api/send failed', { error: err?.message ?? String(err) })
      res.status(500).json({ error: err?.message ?? 'Failed to send email' })
    }
  })

  app.get('/api/drafts', async (_req: Request, res: Response) => {
    try {
      const db = await ensureDatabase()
      const drafts = await listDrafts(db)
      await db.close()
      res.json({ drafts })
    } catch (err: any) {
      log('error', 'api/drafts failed', { error: err?.message ?? String(err) })
      res.status(500).json({ error: err?.message ?? 'Failed to load drafts' })
    }
  })

  app.get('/api/drafts/:id', async (req: Request, res: Response) => {
    try {
      const db = await ensureDatabase()
      const draft = await getDraft(db, req.params.id)
      await db.close()
      if (!draft) {
        res.status(404).json({ error: 'Draft not found' })
        return
      }
      res.json({ draft })
    } catch (err: any) {
      log('error', 'api/draft get failed', { error: err?.message ?? String(err) })
      res.status(500).json({ error: err?.message ?? 'Failed to load draft' })
    }
  })

  app.post('/api/drafts', async (req: Request, res: Response) => {
    const { to, subject, text, html, id } = req.body ?? {}
    if (!to || !subject) {
      res.status(400).json({ error: 'Missing "to" or "subject"' })
      return
    }
    try {
      const db = await ensureDatabase()
      const draftId = await saveDraft(
        db,
        {
          to: String(to),
          subject: String(subject),
          text: typeof text === 'string' ? text : undefined,
          html: typeof html === 'string' ? html : undefined,
        },
        typeof id === 'string' ? id : undefined,
      )
      await db.close()
      res.json({ id: draftId })
    } catch (err: any) {
      log('error', 'api/draft save failed', { error: err?.message ?? String(err) })
      res.status(500).json({ error: err?.message ?? 'Failed to save draft' })
    }
  })

  app.delete('/api/drafts/:id', async (req: Request, res: Response) => {
    try {
      const db = await ensureDatabase()
      await deleteDraft(db, req.params.id)
      await db.close()
      res.json({ ok: true })
    } catch (err: any) {
      log('error', 'api/draft delete failed', { error: err?.message ?? String(err) })
      res.status(500).json({ error: err?.message ?? 'Failed to delete draft' })
    }
  })

  app.get('/api/agent/config', (req: Request, res: Response) => {
    const config = readAgentConfig()
    res.json({
      provider: config.provider,
      model: config.model ?? null,
      baseUrl: config.baseUrl ?? null,
      hasApiKey: Boolean(config.apiKey),
      apiKeyMasked: maskApiKey(config.apiKey),
      systemPrompt: config.systemPrompt ?? '',
      primaryEmail: config.primaryEmail ?? '',
    })
  })

  app.get('/api/agent/sessions', async (req: Request, res: Response) => {
    const sessions = await listChatSessions(50)
    res.json({ sessions })
  })

  app.post('/api/agent/sessions', async (req: Request, res: Response) => {
    const title =
      typeof req.body?.title === 'string' && req.body.title.trim() ? req.body.title.trim() : undefined
    const id = await createChatSession(title)
    res.json({ id })
  })

  app.get('/api/agent/sessions/:id/messages', async (req: Request, res: Response) => {
    const sessionId = req.params.id
    await ensureChatSession(sessionId)
    const messages = await getChatMessages(sessionId, 500)
    res.json({ sessionId, messages })
  })

  app.post('/api/agent/config', (req: Request, res: Response) => {
    const current = readAgentConfig()
    const { provider, apiKey, baseUrl, model, systemPrompt, primaryEmail } = req.body ?? {}
    const next = saveAgentConfig({
      ...current,
      provider: provider === 'openai' ? provider : current.provider,
      baseUrl: typeof baseUrl === 'string' ? baseUrl : current.baseUrl,
      model: typeof model === 'string' ? model : current.model,
      systemPrompt: typeof systemPrompt === 'string' ? systemPrompt : current.systemPrompt,
      primaryEmail: typeof primaryEmail === 'string' ? primaryEmail : current.primaryEmail,
      apiKey: typeof apiKey === 'string' && apiKey.trim() ? apiKey.trim() : current.apiKey,
    })
    res.json({
      provider: next.provider,
      model: next.model ?? null,
      baseUrl: next.baseUrl ?? null,
      hasApiKey: Boolean(next.apiKey),
      apiKeyMasked: maskApiKey(next.apiKey),
      systemPrompt: next.systemPrompt ?? '',
      primaryEmail: next.primaryEmail ?? '',
    })
  })

  app.post('/api/agent/chat', async (req: Request, res: Response) => {
    const { message, model, sessionId: sessionIdRaw, currentEmailId } = req.body ?? {}
    if (!message || typeof message !== 'string') {
      res.status(400).json({ error: 'Missing message' })
      return
    }

    const config = readAgentConfig()
    if (!config.apiKey) {
      res.status(400).json({ error: 'Missing agent API key. Configure it first.' })
      return
    }

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders?.()

    const sessionId =
      typeof sessionIdRaw === 'string' && sessionIdRaw.trim()
        ? sessionIdRaw.trim()
        : await createChatSession()
    await ensureChatSession(sessionId)

    let messageWithContext = message
    if (currentEmailId && typeof currentEmailId === 'string') {
      try {
        const accountEmail = await getAccountEmail(oauthClient)
        const db = await ensureDatabase()
        const emailData = await db.get(
          `SELECT message_id as id, subject, from_email, to_email, date, snippet
           FROM gmail_messages
           WHERE account_email = ? AND message_id = ?`,
          [accountEmail, currentEmailId]
        )
        await db.close()

        if (emailData) {
          const contextInfo = `<system-context>
当前用户正在查看以下邮件：
- 邮件ID: ${emailData.id}
- 主题: ${emailData.subject || '(无主题)'}
- 发件人: ${emailData.from_email || '(未知)'}
- 收件人: ${emailData.to_email || '(未知)'}
- 日期: ${emailData.date || '(未知)'}
- 摘要: ${emailData.snippet || '(无摘要)'}

当用户提到"这封邮件"、"回复"、"回复这个"等时，指的是上述邮件。
</system-context>

`
          messageWithContext = contextInfo + message

          void logInteraction(
            LOG_SOURCE,
            `agent chat with email context emailId=${currentEmailId}`
          )
        }
      } catch (err: any) {
        log('warn', 'failed to fetch email context', { error: err?.message ?? String(err) })
      }
    }

    const runnerPath = path.join(process.cwd(), 'agent', 'zypher_runner.ts')
    const args = ['run', '-A', runnerPath, '--config', AGENT_CONFIG_PATH, '--session', sessionId]
    if (typeof model === 'string' && model.trim()) {
      args.push('--model', model.trim())
    }

    log('info', 'agent chat spawn', { runnerPath, model: model ?? config.model ?? null })
    void logInteraction(
      LOG_SOURCE,
      `agent chat spawn model=${model ?? config.model ?? null}`,
    )
    res.write(`event: start\ndata: ${JSON.stringify({ type: 'start', sessionId })}\n\n`)

    const proc = spawn('deno', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
    })

    proc.stdin.write(messageWithContext)
    proc.stdin.end()

    let buffer = ''

    proc.stdout.on('data', (chunk) => {
      buffer += chunk.toString()
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        res.write(`data: ${trimmed}\n\n`)
      }
    })

    proc.stderr.on('data', (chunk) => {
      const msg = chunk.toString()
      log('warn', 'agent chat stderr', { message: msg })
      void logInteraction(LOG_SOURCE, `agent chat stderr ${msg.trim()}`)
      const payload = JSON.stringify({ type: 'stderr', message: msg })
      res.write(`event: stderr\ndata: ${payload}\n\n`)
    })

    proc.on('error', (err) => {
      log('error', 'agent chat spawn failed', { error: err.message })
      void logInteraction(LOG_SOURCE, `agent chat spawn failed error=${err.message}`)
      const payload = JSON.stringify({ type: 'error', message: err.message })
      res.write(`event: error\ndata: ${payload}\n\n`)
      res.end()
    })

    proc.on('close', (code, signal) => {
      const leftover = buffer.trim()
      if (leftover) {
        res.write(`data: ${leftover}\n\n`)
      }
      log('info', 'agent chat closed', { code, signal })
      void logInteraction(LOG_SOURCE, `agent chat closed code=${code ?? 'null'} signal=${signal ?? 'null'}`)
      const payload = JSON.stringify({ type: 'done', code, signal })
      res.write(`event: done\ndata: ${payload}\n\n`)
      res.end()
    })

    req.on('aborted', () => {
      log('warn', 'agent chat aborted by client')
      proc.kill('SIGTERM')
    })

    res.on('close', () => {
      if (!res.writableEnded) {
        log('warn', 'agent chat response closed early')
        proc.kill('SIGTERM')
      }
    })
  })

  app.get('/api/messages/:id', async (req: Request, res: Response) => {
    const ok = await ensureAccessToken(oauthClient)
    if (!ok) {
      res.status(401).json({ error: 'Not authorized. Login first.' })
      return
    }
    const id = req.params.id
    try {
      const accountEmail = await getAccountEmail(oauthClient)
      const db = await ensureDatabase()
      await migrateUnknownAccountEmail(db, accountEmail)
      const row = await db.get(
        `
        SELECT message_id as id, subject, from_email, to_email, date, snippet, is_read, body_text, body_html, priority
        FROM gmail_messages
        WHERE account_email = ? AND message_id = ?
      `,
        [accountEmail, id],
      )
      if (row) {
        if (row.is_read === 0) {
          try {
            const gmail = google.gmail({ version: 'v1', auth: oauthClient })
            await gmail.users.messages.modify({
              userId: 'me',
              id,
              requestBody: { removeLabelIds: ['UNREAD'] },
            })
            await db.run(
              `UPDATE gmail_messages SET is_read = 1 WHERE account_email = ? AND message_id = ?`,
              [accountEmail, id],
            )
            row.is_read = 1
          } catch (err: any) {
            log('warn', 'mark read failed', { error: err?.message ?? String(err), id })
          }
        }
        await db.close()
        res.json(row)
        return
      }

      // Fallback: fetch from Gmail live
      const gmail = google.gmail({ version: 'v1', auth: oauthClient })
      const live = await gmail.users.messages.get({
        userId: 'me',
        id,
        format: 'full',
      })
      const message = live.data
      const headers = message.payload?.headers ?? []
      const getHeader = (name: string) =>
        headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? null
      const decode = (data: string | undefined | null) =>
        data ? Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8') : null
      const textPart =
        message.payload?.parts?.find((p) => p.mimeType === 'text/plain')?.body?.data ??
        message.payload?.body?.data ??
        null
      const htmlPart = message.payload?.parts?.find((p) => p.mimeType === 'text/html')?.body?.data ?? null

      if (message.labelIds?.includes('UNREAD')) {
        try {
          await gmail.users.messages.modify({
            userId: 'me',
            id,
            requestBody: { removeLabelIds: ['UNREAD'] },
          })
        } catch (err: any) {
          log('warn', 'mark read failed (live fetch)', { error: err?.message ?? String(err), id })
        }
      }

      await saveMessage(db, accountEmail, {
        id: message.id!,
        threadId: message.threadId ?? null,
        internalDate: message.internalDate ? Number(message.internalDate) : null,
        date: getHeader('Date'),
        from: getHeader('From'),
        to: getHeader('To'),
        subject: getHeader('Subject'),
        snippet: message.snippet ?? null,
        isRead: 1,
        bodyText: decode(textPart),
        bodyHtml: decode(htmlPart),
        raw: JSON.stringify(message),
      })
      await db.close()

      res.json({
        id: message.id,
        subject: getHeader('Subject'),
        from_email: getHeader('From'),
        to_email: getHeader('To'),
        date: getHeader('Date'),
        snippet: message.snippet ?? null,
        is_read: 1,
        body_text: decode(textPart),
        body_html: decode(htmlPart),
      })
    } catch (err: any) {
      log('error', 'api/messages/:id failed', { error: err?.message ?? String(err), id })
      res.status(500).json({ error: err?.message ?? 'Failed to load message' })
    }
  })

  app.get('/auth/start', (req: Request, res: Response) => {
    const authUrl = oauthClient.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent',
    })
    log('info', 'oauth start', { redirectUri: REDIRECT_URI })
    void logInteraction(LOG_SOURCE, `oauth start redirectUri=${REDIRECT_URI}`)
    res.redirect(authUrl)
  })

  app.get('/auth/callback', async (req: Request, res: Response) => {
    const code = String(req.query.code ?? '')
    if (!code) {
      res.status(400).send('Missing code in callback.')
      return
    }

    try {
      await handleOauthCallback(oauthClient, code)
      void logInteraction(LOG_SOURCE, 'oauth callback ok')
      res.redirect('/?authed=1')
    } catch (err: any) {
      log('error', 'oauth callback failed', { error: err?.message ?? String(err) })
      void logInteraction(LOG_SOURCE, `oauth callback failed error=${err?.message ?? String(err)}`)
      res.status(500).send(`Failed to exchange code: ${err?.message ?? 'Unknown error'}`)
    }
  })

  app.get('/api/sync', async (req: Request, res: Response) => {
    const ok = await ensureAccessToken(oauthClient)
    if (!ok) {
      res.status(401).json({ error: 'Not authorized. Login first.' })
      return
    }

    const from = typeof req.query.from === 'string' ? req.query.from : undefined
    const to = typeof req.query.to === 'string' ? req.query.to : undefined
    const range = from && to ? { from, to } : defaultRange()
    const force = req.query.force === '1'

    try {
      const accountEmail = await getAccountEmail(oauthClient)
      log('info', 'sync start', { accountEmail, from: range.from, to: range.to, force })
      const db = await ensureDatabase()
      await migrateUnknownAccountEmail(db, accountEmail)

      const existing = await db.get(
        `
        SELECT id FROM gmail_import_runs
        WHERE account_email = ? AND from_date = ? AND to_date = ?
        LIMIT 1
      `,
        [accountEmail, range.from, range.to],
      )

      if (existing && !force) {
        const row = await db.get(
          `SELECT COUNT(*) as count FROM gmail_messages WHERE account_email = ?`,
          [accountEmail],
        )
        await db.close()
        log('info', 'sync skipped (already imported range)', {
          accountEmail,
          from: range.from,
          to: range.to,
          importedCount: Number(row?.count ?? 0),
        })
        void logInteraction(
          LOG_SOURCE,
          `sync skipped account=${accountEmail} from=${range.from} to=${range.to}`,
        )
        res.json({
          skipped: true,
          processed: 0,
          from: range.from,
          to: range.to,
          email: accountEmail,
          importedCount: Number(row?.count ?? 0),
          sqlitePath: SQLITE_PATH,
        })
        return
      }

      await db.close()

      const result = await syncMessages(oauthClient, accountEmail, range.from, range.to)

      const db2 = await ensureDatabase()
      await migrateUnknownAccountEmail(db2, accountEmail)
      await db2.run(
        `
        INSERT INTO gmail_import_runs (account_email, from_date, to_date, finished_at, processed_count)
        VALUES (?, ?, ?, ?, ?)
      `,
        [accountEmail, result.from, result.to, Date.now(), result.processedCount],
      )
      const countRow = await db2.get(
        `SELECT COUNT(*) as count FROM gmail_messages WHERE account_email = ?`,
        [accountEmail],
      )
      await db2.close()

      log('info', 'sync finished', {
        accountEmail,
        from: result.from,
        to: result.to,
        processed: result.processedCount,
        importedCount: Number(countRow?.count ?? 0),
      })
      res.json({
        processed: result.processedCount,
        from: result.from,
        to: result.to,
        email: accountEmail,
        importedCount: Number(countRow?.count ?? 0),
        sqlitePath: SQLITE_PATH,
      })
    } catch (err: any) {
      res.status(400).json({ error: err?.message ?? 'Failed to sync' })
    }
  })

  const server: Server = app.listen(PORT, () => {
    log('info', 'server started', { port: PORT, redirectUri: REDIRECT_URI, autoSync: AUTO_SYNC_MINUTES })
  })

  server.on('error', (err: any) => {
    if (err?.code === 'EADDRINUSE') {
      console.error(
        `Port ${PORT} is already in use. Stop the other process or run with PORT=3001 (and update your OAuth redirect URI).`,
      )
      process.exit(1)
    }
    console.error(err)
    process.exit(1)
  })

  const shutdown = () => {
    if (autoSyncTimer) clearInterval(autoSyncTimer)
    clearCachedAccount()
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}
