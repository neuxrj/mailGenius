import path from 'node:path'
import { open, type Database } from 'sqlite'
import sqlite3 from 'sqlite3'
import { LOG_DB_PATH } from './config'

let dbPromise: Promise<Database> | null = null

async function getLogDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await open({
        filename: LOG_DB_PATH,
        driver: sqlite3.Database,
      })
      await db.exec(`
        CREATE TABLE IF NOT EXISTS logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ts TEXT NOT NULL,
          source TEXT NOT NULL,
          content TEXT NOT NULL
        );
      `)
      return db
    })()
  }
  return dbPromise
}

export async function logInteraction(source: string, content: string) {
  try {
    const db = await getLogDb()
    await db.run(`INSERT INTO logs (ts, source, content) VALUES (?, ?, ?)`, [
      new Date().toISOString(),
      source,
      content,
    ])
  } catch {
    // Logging should never break normal flow.
  }
}
