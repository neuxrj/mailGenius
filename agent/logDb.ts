import { DB } from "https://deno.land/x/sqlite@v3.9.1/mod.ts";

const LOG_DB_PATH = Deno.env.get("LOG_DB_PATH") ?? `${Deno.cwd()}/log.sqlite`;
let db: DB | null = null;

function getDb(): DB {
  if (!db) {
    db = new DB(LOG_DB_PATH);
    db.execute(`
      CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts TEXT NOT NULL,
        source TEXT NOT NULL,
        content TEXT NOT NULL
      );
    `);
  }
  return db;
}

export function logInteraction(source: string, content: string) {
  try {
    const db = getDb();
    db.query("INSERT INTO logs (ts, source, content) VALUES (?, ?, ?)", [
      new Date().toISOString(),
      source,
      content,
    ]);
  } catch {
    // Logging should never break normal flow.
  }
}
