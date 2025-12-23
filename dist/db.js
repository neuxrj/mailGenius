"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureDatabase = ensureDatabase;
exports.migrateUnknownAccountEmail = migrateUnknownAccountEmail;
const sqlite_1 = require("sqlite");
const sqlite3_1 = __importDefault(require("sqlite3"));
const config_1 = require("./config");
function ensureDatabase() {
    return __awaiter(this, void 0, void 0, function* () {
        const db = yield (0, sqlite_1.open)({
            filename: config_1.SQLITE_PATH,
            driver: sqlite3_1.default.Database,
        });
        yield db.exec(`
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
  `);
        const columns = yield db.all(`PRAGMA table_info(gmail_messages);`);
        const hasAccountEmail = columns.some((col) => col.name === 'account_email');
        const hasMessageId = columns.some((col) => col.name === 'message_id');
        const hasPriority = columns.some((col) => col.name === 'priority');
        // 添加 priority 字段迁移（如果表已存在但缺少该字段）
        if (hasAccountEmail && hasMessageId && !hasPriority) {
            yield db.exec(`ALTER TABLE gmail_messages ADD COLUMN priority INTEGER DEFAULT 0;`);
        }
        if (!hasAccountEmail || !hasMessageId) {
            const legacyHasIsRead = columns.some((col) => col.name === 'is_read');
            yield db.exec(`
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
    `);
            const isReadExpr = legacyHasIsRead ? 'is_read' : 'NULL as is_read';
            yield db.exec(`
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
    `);
            yield db.exec(`DROP TABLE gmail_messages;`);
            yield db.exec(`ALTER TABLE gmail_messages_migrated RENAME TO gmail_messages;`);
        }
        yield db.exec(`
    CREATE TABLE IF NOT EXISTS gmail_import_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_email TEXT NOT NULL,
      from_date TEXT NOT NULL,
      to_date TEXT NOT NULL,
      finished_at INTEGER NOT NULL,
      processed_count INTEGER NOT NULL
    );
  `);
        yield db.exec(`
    CREATE TABLE IF NOT EXISTS mail_drafts (
      id TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      to_email TEXT NOT NULL,
      subject TEXT NOT NULL,
      text TEXT,
      html TEXT
    );
  `);
        return db;
    });
}
function migrateUnknownAccountEmail(db, accountEmail) {
    return __awaiter(this, void 0, void 0, function* () {
        yield db.run(`UPDATE gmail_messages SET account_email = ? WHERE account_email = ''`, [accountEmail]);
    });
}
