import { randomUUID } from 'node:crypto'
import { open, type Database } from 'sqlite'
import sqlite3 from 'sqlite3'
import { AGENT_DB_PATH } from './config'

type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

type ChatSession = {
  id: string
  title: string | null
  created_at: string
  last_message_at: string | null
}

let dbPromise: Promise<Database> | null = null

async function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await open({
        filename: AGENT_DB_PATH,
        driver: sqlite3.Database,
      })
      await db.exec(`
        CREATE TABLE IF NOT EXISTS chat_sessions (
          id TEXT PRIMARY KEY,
          title TEXT,
          created_at TEXT NOT NULL
        );
      `)
      await db.exec(`
        CREATE TABLE IF NOT EXISTS chat_messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id TEXT NOT NULL,
          role TEXT NOT NULL,
          content TEXT NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY (session_id) REFERENCES chat_sessions(id)
        );
      `)
      await db.exec(
        `CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id_created ON chat_messages (session_id, created_at);`,
      )
      return db
    })()
  }
  return dbPromise
}

export async function createChatSession(title?: string): Promise<string> {
  const db = await getDb()
  const id = randomUUID()
  const createdAt = new Date().toISOString()
  await db.run(`INSERT INTO chat_sessions (id, title, created_at) VALUES (?, ?, ?)`, [
    id,
    title ?? null,
    createdAt,
  ])
  return id
}

export async function ensureChatSession(id: string): Promise<void> {
  const db = await getDb()
  const row = await db.get(`SELECT id FROM chat_sessions WHERE id = ?`, [id])
  if (row) return
  await db.run(`INSERT INTO chat_sessions (id, title, created_at) VALUES (?, ?, ?)`, [
    id,
    null,
    new Date().toISOString(),
  ])
}

export async function listChatSessions(limit = 20): Promise<ChatSession[]> {
  const db = await getDb()
  const rows = await db.all<ChatSession[]>(
    `
      SELECT s.id, s.title, s.created_at, MAX(m.created_at) as last_message_at
      FROM chat_sessions s
      LEFT JOIN chat_messages m ON m.session_id = s.id
      GROUP BY s.id
      ORDER BY COALESCE(last_message_at, s.created_at) DESC
      LIMIT ?
    `,
    [limit],
  )
  return rows as ChatSession[]
}

export async function getChatMessages(sessionId: string, limit = 200): Promise<ChatMessage[]> {
  const db = await getDb()
  const rows = await db.all<ChatMessage[]>(
    `
      SELECT role, content, created_at
      FROM chat_messages
      WHERE session_id = ?
      ORDER BY created_at ASC
      LIMIT ?
    `,
    [sessionId, limit],
  )
  return rows as ChatMessage[]
}

export async function appendChatMessage(
  sessionId: string,
  role: 'user' | 'assistant',
  content: string,
) {
  const db = await getDb()
  await db.run(
    `INSERT INTO chat_messages (session_id, role, content, created_at) VALUES (?, ?, ?, ?)`,
    [sessionId, role, content, new Date().toISOString()],
  )
}

export async function updateChatSessionTitleIfEmpty(sessionId: string, title: string) {
  const db = await getDb()
  await db.run(
    `
      UPDATE chat_sessions
      SET title = ?
      WHERE id = ? AND (title IS NULL OR title = '')
    `,
    [title, sessionId],
  )
}
