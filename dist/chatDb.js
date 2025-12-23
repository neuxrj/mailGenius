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
exports.createChatSession = createChatSession;
exports.ensureChatSession = ensureChatSession;
exports.listChatSessions = listChatSessions;
exports.getChatMessages = getChatMessages;
exports.appendChatMessage = appendChatMessage;
exports.updateChatSessionTitleIfEmpty = updateChatSessionTitleIfEmpty;
const node_crypto_1 = require("node:crypto");
const sqlite_1 = require("sqlite");
const sqlite3_1 = __importDefault(require("sqlite3"));
const config_1 = require("./config");
let dbPromise = null;
function getDb() {
    return __awaiter(this, void 0, void 0, function* () {
        if (!dbPromise) {
            dbPromise = (() => __awaiter(this, void 0, void 0, function* () {
                const db = yield (0, sqlite_1.open)({
                    filename: config_1.AGENT_DB_PATH,
                    driver: sqlite3_1.default.Database,
                });
                yield db.exec(`
        CREATE TABLE IF NOT EXISTS chat_sessions (
          id TEXT PRIMARY KEY,
          title TEXT,
          created_at TEXT NOT NULL
        );
      `);
                yield db.exec(`
        CREATE TABLE IF NOT EXISTS chat_messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id TEXT NOT NULL,
          role TEXT NOT NULL,
          content TEXT NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY (session_id) REFERENCES chat_sessions(id)
        );
      `);
                yield db.exec(`CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id_created ON chat_messages (session_id, created_at);`);
                return db;
            }))();
        }
        return dbPromise;
    });
}
function createChatSession(title) {
    return __awaiter(this, void 0, void 0, function* () {
        const db = yield getDb();
        const id = (0, node_crypto_1.randomUUID)();
        const createdAt = new Date().toISOString();
        yield db.run(`INSERT INTO chat_sessions (id, title, created_at) VALUES (?, ?, ?)`, [
            id,
            title !== null && title !== void 0 ? title : null,
            createdAt,
        ]);
        return id;
    });
}
function ensureChatSession(id) {
    return __awaiter(this, void 0, void 0, function* () {
        const db = yield getDb();
        const row = yield db.get(`SELECT id FROM chat_sessions WHERE id = ?`, [id]);
        if (row)
            return;
        yield db.run(`INSERT INTO chat_sessions (id, title, created_at) VALUES (?, ?, ?)`, [
            id,
            null,
            new Date().toISOString(),
        ]);
    });
}
function listChatSessions() {
    return __awaiter(this, arguments, void 0, function* (limit = 20) {
        const db = yield getDb();
        const rows = yield db.all(`
      SELECT s.id, s.title, s.created_at, MAX(m.created_at) as last_message_at
      FROM chat_sessions s
      LEFT JOIN chat_messages m ON m.session_id = s.id
      GROUP BY s.id
      ORDER BY COALESCE(last_message_at, s.created_at) DESC
      LIMIT ?
    `, [limit]);
        return rows;
    });
}
function getChatMessages(sessionId_1) {
    return __awaiter(this, arguments, void 0, function* (sessionId, limit = 200) {
        const db = yield getDb();
        const rows = yield db.all(`
      SELECT role, content, created_at
      FROM chat_messages
      WHERE session_id = ?
      ORDER BY created_at ASC
      LIMIT ?
    `, [sessionId, limit]);
        return rows;
    });
}
function appendChatMessage(sessionId, role, content) {
    return __awaiter(this, void 0, void 0, function* () {
        const db = yield getDb();
        yield db.run(`INSERT INTO chat_messages (session_id, role, content, created_at) VALUES (?, ?, ?, ?)`, [sessionId, role, content, new Date().toISOString()]);
    });
}
function updateChatSessionTitleIfEmpty(sessionId, title) {
    return __awaiter(this, void 0, void 0, function* () {
        const db = yield getDb();
        yield db.run(`
      UPDATE chat_sessions
      SET title = ?
      WHERE id = ? AND (title IS NULL OR title = '')
    `, [title, sessionId]);
    });
}
