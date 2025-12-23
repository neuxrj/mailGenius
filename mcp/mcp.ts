import path from "node:path";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { logInteraction } from "../src/logDb";

type MessageRow = {
    account_email: string;
    message_id: string;
    thread_id: string | null;
    internal_date: number | null;
    date: string | null;
    from_email: string | null;
    to_email: string | null;
    subject: string | null;
    snippet: string | null;
    is_read: number | null;
    priority: number | null;
};

const DEFAULT_DB_PATH = path.join(process.cwd(), "gmail.sqlite");
const DB_PATH = process.env.GMAIL_DB_PATH ?? DEFAULT_DB_PATH;

const db = new Database(DB_PATH);
const LOG_SOURCE = "mcp/mcp.ts";
void logInteraction(LOG_SOURCE, `mcp server starting dbPath=${DB_PATH}`);

const server = new Server(
    { name: "gmail-sqlite-mcp", version: "1.0.0" },
    { capabilities: { tools: {} } }
);

const tools = [
    {
        name: "gmail_query",
        description:
            "Summarize emails with flexible filters. Provide any combination of date range, sender, keyword, unread, subject, recipient, or account_email. At least one filter is required.",
        inputSchema: {
            type: "object",
            properties: {
                start_date: { type: ["string", "null"] },
                end_date: { type: ["string", "null"] },
                sender: { type: ["string", "null"] },
                keyword: { type: ["string", "null"] },
                unread: { type: ["boolean", "null"] },
                subject: { type: ["string", "null"] },
                recipient: { type: ["string", "null"] },
                account_email: { type: ["string", "null"] },
                priority: { type: ["number", "null"], enum: [0, 1, 2, null] },
                limit: { type: ["number", "null"], minimum: 1, maximum: 200 },
            },
            additionalProperties: false,
        },
        outputSchema: {
            type: "object",
            properties: {
                total: { type: "number" },
                returned: { type: "number" },
                items: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            account_email: { type: "string" },
                            message_id: { type: "string" },
                            thread_id: { type: ["string", "null"] },
                            internal_date: { type: ["number", "null"] },
                            date: { type: ["string", "null"] },
                            from_email: { type: ["string", "null"] },
                            to_email: { type: ["string", "null"] },
                            subject: { type: ["string", "null"] },
                            snippet: { type: ["string", "null"] },
                            is_read: { type: ["number", "null"] },
                            priority: { type: ["number", "null"] },
                        },
                        additionalProperties: false,
                    },
                },
            },
            required: ["total", "returned", "items"],
            additionalProperties: false,
        },
    },
    {
        name: "gmail_draft_create",
        description:
            "Create a draft email and store it in the local SQLite database for later sending.",
        inputSchema: {
            type: "object",
            properties: {
                to: { type: "string" },
                subject: { type: "string" },
                text: { type: "string" },
                html: { type: "string" },
            },
            required: ["to", "subject"],
            additionalProperties: false,
        },
    },
    {
        name: "gmail_draft_reply",
        description:
            "Create a reply draft to a stored message (by message_id). Uses stored message content for quoting.",
        inputSchema: {
            type: "object",
            properties: {
                message_id: { type: "string" },
                account_email: { type: "string" },
                body: { type: "string", description: "Agent 生成的回复正文内容" },
            },
            required: ["message_id", "body"],
            additionalProperties: false,
        },
    },
    {
        name: "gmail_update_priority",
        description:
            "批量更新邮件优先级。只有重要邮件才调用此工具更新为高优先级(2)，默认邮件保持低优先级(1)。",
        inputSchema: {
            type: "object",
            properties: {
                updates: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            message_id: { type: "string" },
                            priority: { type: "number", enum: [1, 2] },
                            reason: { type: "string" },
                        },
                        required: ["message_id", "priority"],
                        additionalProperties: false,
                    },
                },
                account_email: { type: "string" },
            },
            required: ["updates"],
            additionalProperties: false,
        },
    },
    {
        name: "gmail_mark_analyzed",
        description:
            "将未分析邮件标记为已分析(低优先级1)。Agent读过邮件内容后调用此工具，表示已分析但不重要。",
        inputSchema: {
            type: "object",
            properties: {
                message_ids: {
                    type: "array",
                    items: { type: "string" },
                },
                account_email: { type: "string" },
            },
            required: ["message_ids"],
            additionalProperties: false,
        },
    },
    {
        name: "gmail_mark_read",
        description:
            "批量标记邮件为已读。可以用于将已处理或已查看的邮件标记为已读状态。",
        inputSchema: {
            type: "object",
            properties: {
                message_ids: {
                    type: "array",
                    items: { type: "string" },
                    description: "要标记为已读的邮件ID列表",
                },
                account_email: {
                    type: ["string", "null"],
                    description: "账户邮箱（可选，用于过滤）",
                },
            },
            required: ["message_ids"],
            additionalProperties: false,
        },
    },
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const toolName = request.params.name;
    void logInteraction(
        LOG_SOURCE,
        `tool call name=${toolName} args=${JSON.stringify(request.params.arguments ?? {})}`
    );
    try {
        switch (toolName) {
            case "gmail_query":
                return handleQueryGeneric(request.params.arguments ?? {});
            case "gmail_draft_create":
                return handleDraftCreate(request.params.arguments ?? {});
            case "gmail_draft_reply":
                return handleDraftReply(request.params.arguments ?? {});
            case "gmail_update_priority":
                return handleUpdatePriority(request.params.arguments ?? {});
            case "gmail_mark_analyzed":
                return handleMarkAnalyzed(request.params.arguments ?? {});
            case "gmail_mark_read":
                return handleMarkRead(request.params.arguments ?? {});
            default:
                return {
                    content: [{ type: "text", text: "Unknown tool." }],
                    isError: true,
                };
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        void logInteraction(LOG_SOURCE, `tool error name=${toolName} error=${message}`);
        return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
    }
});

function parseDateInput(value: string, endOfDay: boolean): number {
    const hasTime = value.includes("T");
    const normalized = hasTime
        ? value
        : `${value}T${endOfDay ? "23:59:59" : "00:00:00"}Z`;
    const ms = Date.parse(normalized);
    if (Number.isNaN(ms)) {
        throw new Error(`Invalid date: ${value}`);
    }
    return ms;
}

function normalizeLimit(value: unknown, defaultValue = 20) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return defaultValue;
    }
    return Math.max(1, Math.min(200, Math.trunc(value)));
}

function buildSummary(title: string, rows: MessageRow[], total: number) {
    if (total === 0) {
        return `${title}\nNo messages found.`;
    }
    const lines = rows.map((row, index) => formatMessage(row, index + 1));
    return `${title}\nTotal: ${total}. Showing ${rows.length}.\n${lines.join("\n")}`;
}

function formatMessage(row: MessageRow, index: number) {
    const dateValue =
        row.date ?? (row.internal_date ? new Date(row.internal_date).toISOString() : "unknown-date");
    const subject = row.subject ?? "";
    const snippet = truncate(row.snippet ?? "", 200);
    const from = row.from_email ?? "unknown-sender";
    const to = row.to_email ?? "unknown-recipient";
    return `${index}. [${dateValue}] from ${from} to ${to} | subject: ${subject} | snippet: ${snippet}`;
}

function truncate(text: string, maxLength: number) {
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength - 3)}...`;
}

type FilterResult = {
    whereSql: string;
    params: Array<string | number | null>;
    descriptionParts: string[];
};

function buildFilters(args: Record<string, unknown>): FilterResult {
    const clauses: string[] = [];
    const params: Array<string | number> = [];
    const descriptionParts: string[] = [];

    if (args.account_email) {
        clauses.push("account_email = ?");
        params.push(String(args.account_email));
        descriptionParts.push(`account=${args.account_email}`);
    }

    const startDate = args.start_date ? String(args.start_date) : null;
    const endDate = args.end_date ? String(args.end_date) : null;
    if (startDate && endDate) {
        const startMs = parseDateInput(startDate, false);
        const endMs = parseDateInput(endDate, true);
        clauses.push("internal_date BETWEEN ? AND ?");
        params.push(startMs, endMs);
        descriptionParts.push(`date=${startDate}..${endDate}`);
    } else if (startDate) {
        const startMs = parseDateInput(startDate, false);
        clauses.push("internal_date >= ?");
        params.push(startMs);
        descriptionParts.push(`date>=${startDate}`);
    } else if (endDate) {
        const endMs = parseDateInput(endDate, true);
        clauses.push("internal_date <= ?");
        params.push(endMs);
        descriptionParts.push(`date<=${endDate}`);
    }

    if (args.sender) {
        clauses.push("from_email LIKE ?");
        params.push(`%${args.sender}%`);
        descriptionParts.push(`from~${args.sender}`);
    }

    if (args.recipient) {
        clauses.push("to_email LIKE ?");
        params.push(`%${args.recipient}%`);
        descriptionParts.push(`to~${args.recipient}`);
    }

    if (args.subject) {
        clauses.push("subject LIKE ?");
        params.push(`%${args.subject}%`);
        descriptionParts.push(`subject~${args.subject}`);
    }

    if (args.keyword) {
        clauses.push("(subject LIKE ? OR snippet LIKE ? OR body_text LIKE ?)");
        const likeValue = `%${args.keyword}%`;
        params.push(likeValue, likeValue, likeValue);
        descriptionParts.push(`keyword~${args.keyword}`);
    }

    if (typeof args.unread === "boolean") {
        clauses.push("is_read = ?");
        params.push(args.unread ? 0 : 1);
        descriptionParts.push(args.unread ? "unread" : "read");
    }

    if (typeof args.priority === "number") {
        clauses.push("priority = ?");
        params.push(args.priority);
        const priorityLabels = { 0: "未分析", 1: "低优先级", 2: "高优先级" };
        descriptionParts.push(priorityLabels[args.priority] || `priority=${args.priority}`);
    }

    if (clauses.length === 0) {
        throw new Error("At least one query condition is required.");
    }

    return {
        whereSql: clauses.join(" AND "),
        params,
        descriptionParts,
    };
}

function handleQueryGeneric(args: Record<string, unknown>) {
    const limit = normalizeLimit(args.limit);
    const filters = buildFilters(args);

    const countStmt = db.prepare(
        `SELECT COUNT(*) as count FROM gmail_messages WHERE ${filters.whereSql}`
    );
    const rowsStmt = db.prepare(
        `SELECT account_email, message_id, thread_id, internal_date, date, from_email, to_email, subject, snippet, is_read, priority
     FROM gmail_messages
     WHERE ${filters.whereSql}
     ORDER BY internal_date DESC
     LIMIT ?`
    );

    const count = countStmt.get(...filters.params).count as number;
    void logInteraction(
        LOG_SOURCE,
        `gmail_query countSQL executed: SELECT COUNT(*) as count FROM gmail_messages WHERE ${filters.whereSql} | params=${JSON.stringify(filters.params)}`
    );
    const rows = rowsStmt.all(...filters.params, limit);
    void logInteraction(
        LOG_SOURCE,
        `gmail_query rowsSQL executed: SELECT ... FROM gmail_messages WHERE ${filters.whereSql} ORDER BY internal_date DESC LIMIT ${limit} | params=${JSON.stringify(filters.params)}`
    );
    const title = `Summary for filters: ${filters.descriptionParts.join(", ")}`;
    const summary = buildSummary(title, rows as MessageRow[], count);
    const structured = {
        total: count,
        returned: rows.length,
        items: rows as MessageRow[],
    };
    void logInteraction(
        LOG_SOURCE,
        `gmail_query total=${count} returned=${rows.length} filters=${filters.descriptionParts.join(", ")}`
    );
    return {
        content: [{ type: "text", text: summary }],
        structuredContent: structured,
    };
}

function handleDraftCreate(args: Record<string, unknown>) {
    const to = String(args.to ?? "").trim();
    const subject = String(args.subject ?? "").trim();
    if (!to || !subject) {
        throw new Error("Draft requires to and subject.");
    }
    const text = typeof args.text === "string" ? args.text : null;
    const html = typeof args.html === "string" ? args.html : null;
    const now = Date.now();
    const id = randomUUID();

    const stmt = db.prepare(
        `INSERT INTO mail_drafts (id, created_at, updated_at, to_email, subject, text, html)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    stmt.run(id, now, now, to, subject, text, html);
    void logInteraction(LOG_SOURCE, `gmail_draft_create id=${id} to=${to} subject=${subject}`);
    return { content: [{ type: "text", text: `Draft saved with id ${id}.` }] };
}

function handleDraftReply(args: Record<string, unknown>) {
    const messageId = String(args.message_id ?? "").trim();
    if (!messageId) {
        throw new Error("message_id is required.");
    }
    const replyBody = typeof args.body === "string" ? args.body.trim() : "";
    if (!replyBody) {
        throw new Error("body is required.");
    }
    const accountEmail = args.account_email ? String(args.account_email) : null;
    const row = accountEmail
        ? db
              .prepare(
                  `SELECT from_email, subject, body_text, snippet
                   FROM gmail_messages
                   WHERE account_email = ? AND message_id = ?
                   LIMIT 1`
              )
              .get(accountEmail, messageId)
        : db
              .prepare(
                  `SELECT from_email, subject, body_text, snippet
                   FROM gmail_messages
                   WHERE message_id = ?
                   LIMIT 1`
              )
              .get(messageId);
    if (!row) {
        throw new Error("Message not found.");
    }
    const to = row.from_email ?? "";
    const subject = row.subject ? (String(row.subject).toLowerCase().startsWith("re:") ? row.subject : `Re: ${row.subject}`) : "Re:";
    const originalBody = row.body_text ?? row.snippet ?? "";
    const replyText = `${replyBody}\n\n--- Original message ---\n${originalBody}`;

    const now = Date.now();
    const id = randomUUID();
    db.prepare(
        `INSERT INTO mail_drafts (id, created_at, updated_at, to_email, subject, text, html)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, now, now, to, subject, replyText, null);

    void logInteraction(
        LOG_SOURCE,
        `gmail_draft_reply id=${id} message_id=${messageId} to=${to} subject=${subject}`
    );
    return { content: [{ type: "text", text: `Reply draft saved with id ${id}.` }] };
}

function handleUpdatePriority(args: Record<string, unknown>) {
    const updates = args.updates as Array<{
        message_id: string;
        priority: number;
        reason?: string;
    }>;

    if (!Array.isArray(updates) || updates.length === 0) {
        throw new Error("updates array is required and must not be empty.");
    }

    const accountEmail = args.account_email ? String(args.account_email) : null;
    let updatedCount = 0;

    const stmt = db.prepare(
        accountEmail
            ? `UPDATE gmail_messages SET priority = ? WHERE account_email = ? AND message_id = ?`
            : `UPDATE gmail_messages SET priority = ? WHERE message_id = ?`
    );

    for (const update of updates) {
        if (!update.message_id || typeof update.priority !== "number") {
            continue;
        }
        if (![1, 2].includes(update.priority)) {
            continue;
        }

        const params = accountEmail
            ? [update.priority, accountEmail, update.message_id]
            : [update.priority, update.message_id];

        const result = stmt.run(...params);
        updatedCount += result.changes || 0;

        void logInteraction(
            LOG_SOURCE,
            `gmail_update_priority message_id=${update.message_id} priority=${update.priority} reason=${update.reason || "N/A"}`
        );
    }

    const summary = `已更新 ${updatedCount} 封邮件的优先级。`;
    return { content: [{ type: "text", text: summary }] };
}

function handleMarkAnalyzed(args: Record<string, unknown>) {
    const messageIds = args.message_ids as string[];

    if (!Array.isArray(messageIds) || messageIds.length === 0) {
        throw new Error("message_ids array is required and must not be empty.");
    }

    const accountEmail = args.account_email ? String(args.account_email) : null;
    const placeholders = messageIds.map(() => "?").join(", ");

    const sql = accountEmail
        ? `UPDATE gmail_messages SET priority = 1 WHERE account_email = ? AND priority = 0 AND message_id IN (${placeholders})`
        : `UPDATE gmail_messages SET priority = 1 WHERE priority = 0 AND message_id IN (${placeholders})`;

    const params = accountEmail ? [accountEmail, ...messageIds] : messageIds;
    const result = db.prepare(sql).run(...params);

    void logInteraction(
        LOG_SOURCE,
        `gmail_mark_analyzed count=${result.changes || 0} message_ids=${messageIds.join(",")}`
    );

    const summary = `已将 ${result.changes || 0} 封未分析邮件标记为已分析(低优先级)。`;
    return { content: [{ type: "text", text: summary }] };
}

function handleMarkRead(args: Record<string, unknown>) {
    const messageIds = args.message_ids as string[];

    if (!Array.isArray(messageIds) || messageIds.length === 0) {
        throw new Error("message_ids array is required and must not be empty.");
    }

    const accountEmail = args.account_email ? String(args.account_email) : null;
    const placeholders = messageIds.map(() => "?").join(", ");

    const sql = accountEmail
        ? `UPDATE gmail_messages SET is_read = 1 WHERE account_email = ? AND message_id IN (${placeholders})`
        : `UPDATE gmail_messages SET is_read = 1 WHERE message_id IN (${placeholders})`;

    const params = accountEmail ? [accountEmail, ...messageIds] : messageIds;
    const result = db.prepare(sql).run(...params);

    void logInteraction(
        LOG_SOURCE,
        `gmail_mark_read count=${result.changes || 0} message_ids=${messageIds.slice(0, 5).join(",")}${messageIds.length > 5 ? "..." : ""}`
    );

    const summary = `已标记 ${result.changes || 0} 封邮件为已读。`;
    return { content: [{ type: "text", text: summary }] };
}


async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
}

main().catch((error) => {
    console.error("Failed to start MCP server:", error);
    process.exit(1);
});
