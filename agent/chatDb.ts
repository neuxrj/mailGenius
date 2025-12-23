import { DB } from "https://deno.land/x/sqlite@v3.9.1/mod.ts";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

type ChatSession = {
  id: string;
  title: string | null;
  created_at: string;
};

const CHAT_DB_PATH = Deno.env.get("AGENT_DB_PATH") ?? `${Deno.cwd()}/agent.sqlite`;
let db: DB | null = null;

function getDb(): DB {
  if (!db) {
    db = new DB(CHAT_DB_PATH);
    db.execute(`
      CREATE TABLE IF NOT EXISTS chat_sessions (
        id TEXT PRIMARY KEY,
        title TEXT,
        created_at TEXT NOT NULL
      );
    `);
    db.execute(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES chat_sessions(id)
      );
    `);
    db.execute(
      `CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id_created ON chat_messages (session_id, created_at);`,
    );
  }
  return db;
}

export function createChatSession(title?: string): string {
  const db = getDb();
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  db.query("INSERT INTO chat_sessions (id, title, created_at) VALUES (?, ?, ?)", [
    id,
    title ?? null,
    createdAt,
  ]);
  return id;
}

export function ensureChatSession(id: string) {
  const db = getDb();
  const rows = db.query("SELECT id FROM chat_sessions WHERE id = ?", [id]);
  if (rows.length > 0) return;
  db.query("INSERT INTO chat_sessions (id, title, created_at) VALUES (?, ?, ?)", [
    id,
    null,
    new Date().toISOString(),
  ]);
}

export function listChatSessions(limit = 20): ChatSession[] {
  const db = getDb();
  const rows = db.query(
    `
      SELECT s.id, s.title, s.created_at
      FROM chat_sessions s
      ORDER BY s.created_at DESC
      LIMIT ?
    `,
    [limit],
  );
  return rows.map((row) => ({
    id: row[0] as string,
    title: row[1] as string | null,
    created_at: row[2] as string,
  }));
}

export function getChatMessages(sessionId: string, limit = 200): ChatMessage[] {
  const db = getDb();
  const rows = db.query(
    `
      SELECT role, content, created_at
      FROM chat_messages
      WHERE session_id = ?
      ORDER BY created_at ASC
      LIMIT ?
    `,
    [sessionId, limit],
  );
  return rows.map((row) => ({
    role: row[0] as "user" | "assistant",
    content: row[1] as string,
    created_at: row[2] as string,
  }));
}

export function appendChatMessage(sessionId: string, role: "user" | "assistant", content: string) {
  const db = getDb();
  db.query(
    "INSERT INTO chat_messages (session_id, role, content, created_at) VALUES (?, ?, ?, ?)",
    [sessionId, role, content, new Date().toISOString()],
  );
}

export function updateChatSessionTitleIfEmpty(sessionId: string, title: string) {
  const db = getDb();
  db.query(
    `
      UPDATE chat_sessions
      SET title = ?
      WHERE id = ? AND (title IS NULL OR title = '')
    `,
    [title, sessionId],
  );
}
