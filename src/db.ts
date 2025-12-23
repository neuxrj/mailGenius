import { open, type Database } from 'sqlite'
import sqlite3 from 'sqlite3'
import { SQLITE_PATH } from './config'

export type DB = Database

export async function ensureDatabase(): Promise<DB> {
  const db = await open({
    filename: SQLITE_PATH,
    driver: sqlite3.Database,
  })

  await db.exec(`
    CREATE TABLE IF NOT EXISTS gmail_messages (
      account_email TEXT NOT NULL,
      message_id TEXT NOT NULL,
      thread_id TEXT,
      internal_date INTEGER,
      date TEXT,
      from_email TEXT,
      to_email TEXT,
      subject TEXT,
      snippet TEXT,
      is_read INTEGER,
      body_text TEXT,
      body_html TEXT,
      raw TEXT,
      priority INTEGER DEFAULT 0,
      PRIMARY KEY (account_email, message_id)
    );
  `)

  const columns: Array<{ name: string }> = await db.all(`PRAGMA table_info(gmail_messages);`)
  const hasAccountEmail = columns.some((col) => col.name === 'account_email')
  const hasMessageId = columns.some((col) => col.name === 'message_id')
  const hasPriority = columns.some((col) => col.name === 'priority')

  // 添加 priority 字段迁移（如果表已存在但缺少该字段）
  if (hasAccountEmail && hasMessageId && !hasPriority) {
    await db.exec(`ALTER TABLE gmail_messages ADD COLUMN priority INTEGER DEFAULT 0;`)
  }

  if (!hasAccountEmail || !hasMessageId) {
    const legacyHasIsRead = columns.some((col) => col.name === 'is_read')
    await db.exec(`
      CREATE TABLE IF NOT EXISTS gmail_messages_migrated (
        account_email TEXT NOT NULL,
        message_id TEXT NOT NULL,
        thread_id TEXT,
        internal_date INTEGER,
        date TEXT,
        from_email TEXT,
        to_email TEXT,
        subject TEXT,
        snippet TEXT,
        is_read INTEGER,
        body_text TEXT,
        body_html TEXT,
        raw TEXT,
        priority INTEGER DEFAULT 0,
        PRIMARY KEY (account_email, message_id)
      );
    `)

    const isReadExpr = legacyHasIsRead ? 'is_read' : 'NULL as is_read'
    await db.exec(`
      INSERT OR REPLACE INTO gmail_messages_migrated (
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
      )
      SELECT
        '' as account_email,
        id as message_id,
        thread_id,
        internal_date,
        date,
        from_email,
        to_email,
        subject,
        snippet,
        ${isReadExpr},
        body_text,
        body_html,
        raw,
        0 as priority
      FROM gmail_messages;
    `)

    await db.exec(`DROP TABLE gmail_messages;`)
    await db.exec(`ALTER TABLE gmail_messages_migrated RENAME TO gmail_messages;`)
  }

  await db.exec(`
    CREATE TABLE IF NOT EXISTS gmail_import_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_email TEXT NOT NULL,
      from_date TEXT NOT NULL,
      to_date TEXT NOT NULL,
      finished_at INTEGER NOT NULL,
      processed_count INTEGER NOT NULL
    );
  `)

  await db.exec(`
    CREATE TABLE IF NOT EXISTS mail_drafts (
      id TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      to_email TEXT NOT NULL,
      subject TEXT NOT NULL,
      text TEXT,
      html TEXT
    );
  `)

  return db
}

export async function migrateUnknownAccountEmail(db: DB, accountEmail: string) {
  await db.run(`UPDATE gmail_messages SET account_email = ? WHERE account_email = ''`, [accountEmail])
}
