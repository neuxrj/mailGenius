import { randomUUID } from 'node:crypto'
import type { DB } from './db'

export type Draft = {
  id: string
  created_at: number
  updated_at: number
  to_email: string
  subject: string
  text: string | null
  html: string | null
}

export async function saveDraft(
  db: DB,
  input: { to: string; subject: string; text?: string; html?: string },
  id?: string,
) {
  const now = Date.now()
  const draftId = id ?? randomUUID()
  await db.run(
    `
      INSERT INTO mail_drafts (id, created_at, updated_at, to_email, subject, text, html)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        updated_at = excluded.updated_at,
        to_email = excluded.to_email,
        subject = excluded.subject,
        text = excluded.text,
        html = excluded.html
    `,
    [
      draftId,
      now,
      now,
      input.to,
      input.subject,
      input.text ?? null,
      input.html ?? null,
    ],
  )
  return draftId
}

export async function listDrafts(db: DB): Promise<Draft[]> {
  const rows = await db.all<Draft[]>(
    `
      SELECT id, created_at, updated_at, to_email, subject, text, html
      FROM mail_drafts
      ORDER BY updated_at DESC
    `,
  )
  return rows as Draft[]
}

export async function getDraft(db: DB, id: string): Promise<Draft | null> {
  const row = await db.get<Draft>(
    `
      SELECT id, created_at, updated_at, to_email, subject, text, html
      FROM mail_drafts
      WHERE id = ?
      LIMIT 1
    `,
    [id],
  )
  return (row as Draft) ?? null
}

export async function deleteDraft(db: DB, id: string) {
  await db.run(`DELETE FROM mail_drafts WHERE id = ?`, [id])
}
