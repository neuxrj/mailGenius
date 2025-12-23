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
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultRange = defaultRange;
exports.defaultSentRange = defaultSentRange;
exports.syncMessages = syncMessages;
exports.syncMessagesByTimestamp = syncMessagesByTimestamp;
exports.saveMessage = saveMessage;
const googleapis_1 = require("googleapis");
const db_1 = require("./db");
const logDb_1 = require("./logDb");
const LOG_SOURCE = 'src/sync.ts';
function parseDateOnly(dateStr) {
    const match = /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
    if (!match) {
        throw new Error(`Invalid date format: ${dateStr}. Use YYYY-MM-DD.`);
    }
    const d = new Date(`${dateStr}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) {
        throw new Error(`Invalid date value: ${dateStr}.`);
    }
    return d;
}
function formatDateUTC(d) {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
function addDaysUTC(date, days) {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + days);
    return next;
}
function toGmailQueryRange(from, to) {
    const fromDate = parseDateOnly(from);
    const toDate = parseDateOnly(to);
    if (fromDate > toDate) {
        throw new Error('from must be <= to');
    }
    const after = fromDate;
    const before = addDaysUTC(toDate, 1);
    const toQueryDate = (d) => `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}`;
    return { after: toQueryDate(after), before: toQueryDate(before) };
}
function toGmailQueryRangeMs(fromMs, toMs) {
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) {
        throw new Error('Invalid timestamp range.');
    }
    if (fromMs >= toMs) {
        throw new Error('from must be < to');
    }
    const after = Math.floor(fromMs / 1000);
    const before = Math.floor(toMs / 1000);
    return { after, before };
}
function defaultRange() {
    const today = new Date();
    const utcToday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    const from = formatDateUTC(addDaysUTC(utcToday, -6));
    const to = formatDateUTC(utcToday);
    return { from, to };
}
function defaultSentRange() {
    const today = new Date();
    const utcToday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    const from = formatDateUTC(addDaysUTC(utcToday, -29));
    const to = formatDateUTC(utcToday);
    return { from, to };
}
function getHeader(headers, name) {
    var _a;
    if (!headers)
        return null;
    const found = headers.find((h) => { var _a; return ((_a = h.name) === null || _a === void 0 ? void 0 : _a.toLowerCase()) === name.toLowerCase(); });
    return (_a = found === null || found === void 0 ? void 0 : found.value) !== null && _a !== void 0 ? _a : null;
}
function decodeBase64(data) {
    const normalized = data.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(normalized, 'base64').toString('utf8');
}
function extractBody(payload) {
    const bodies = { text: null, html: null };
    const walk = (part) => {
        var _a, _b;
        if (!part)
            return;
        if (part.mimeType === 'text/plain' && ((_a = part.body) === null || _a === void 0 ? void 0 : _a.data) && !bodies.text) {
            bodies.text = decodeBase64(part.body.data);
        }
        if (part.mimeType === 'text/html' && ((_b = part.body) === null || _b === void 0 ? void 0 : _b.data) && !bodies.html) {
            bodies.html = decodeBase64(part.body.data);
        }
        if (Array.isArray(part.parts)) {
            part.parts.forEach(walk);
        }
    };
    walk(payload);
    return bodies;
}
function syncMessages(auth, accountEmail, from, to) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e;
        const gmail = googleapis_1.google.gmail({ version: 'v1', auth });
        const { after, before } = toGmailQueryRange(from, to);
        const q = `after:${after} before:${before}`;
        const db = yield (0, db_1.ensureDatabase)();
        yield (0, db_1.migrateUnknownAccountEmail)(db, accountEmail);
        let pageToken;
        let processedCount = 0;
        void (0, logDb_1.logInteraction)(LOG_SOURCE, `syncMessages start account=${accountEmail} from=${from} to=${to}`);
        do {
            const listResponse = yield gmail.users.messages.list({
                userId: 'me',
                q,
                pageToken,
                maxResults: 100,
            });
            const messages = (_a = listResponse.data.messages) !== null && _a !== void 0 ? _a : [];
            const hasNext = Boolean(listResponse.data.nextPageToken);
            void (0, logDb_1.logInteraction)(LOG_SOURCE, `syncMessages list count=${messages.length} page=${pageToken !== null && pageToken !== void 0 ? pageToken : 'first'} next=${hasNext}`);
            for (const msg of messages) {
                if (!msg.id)
                    continue;
                const messageResponse = yield gmail.users.messages.get({
                    userId: 'me',
                    id: msg.id,
                    format: 'full',
                });
                const message = messageResponse.data;
                const payload = message.payload;
                const headers = payload === null || payload === void 0 ? void 0 : payload.headers;
                const { text, html } = extractBody(payload);
                yield saveMessage(db, accountEmail, {
                    id: message.id,
                    threadId: (_b = message.threadId) !== null && _b !== void 0 ? _b : null,
                    internalDate: message.internalDate ? Number(message.internalDate) : null,
                    date: getHeader(headers, 'Date'),
                    from: getHeader(headers, 'From'),
                    to: getHeader(headers, 'To'),
                    subject: getHeader(headers, 'Subject'),
                    snippet: (_c = message.snippet) !== null && _c !== void 0 ? _c : null,
                    isRead: ((_d = message.labelIds) === null || _d === void 0 ? void 0 : _d.includes('UNREAD')) ? 0 : 1,
                    bodyText: text,
                    bodyHtml: html,
                    raw: JSON.stringify(message),
                    priority: 0, // 批量导入设为未分析
                });
                processedCount += 1;
            }
            pageToken = (_e = listResponse.data.nextPageToken) !== null && _e !== void 0 ? _e : undefined;
        } while (pageToken);
        yield db.close();
        void (0, logDb_1.logInteraction)(LOG_SOURCE, `syncMessages done processed=${processedCount} account=${accountEmail} from=${from} to=${to}`);
        return { processedCount, from, to };
    });
}
function syncMessagesByTimestamp(auth, accountEmail, fromMs, toMs) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e;
        const gmail = googleapis_1.google.gmail({ version: 'v1', auth });
        const { after, before } = toGmailQueryRangeMs(fromMs, toMs);
        const q = `after:${after} before:${before}`;
        const db = yield (0, db_1.ensureDatabase)();
        yield (0, db_1.migrateUnknownAccountEmail)(db, accountEmail);
        let pageToken;
        let processedCount = 0;
        const newMessageIds = [];
        do {
            const listResponse = yield gmail.users.messages.list({
                userId: 'me',
                q,
                pageToken,
                maxResults: 100,
            });
            const messages = (_a = listResponse.data.messages) !== null && _a !== void 0 ? _a : [];
            for (const msg of messages) {
                if (!msg.id)
                    continue;
                const messageResponse = yield gmail.users.messages.get({
                    userId: 'me',
                    id: msg.id,
                    format: 'full',
                });
                const message = messageResponse.data;
                const payload = message.payload;
                const headers = payload === null || payload === void 0 ? void 0 : payload.headers;
                const { text, html } = extractBody(payload);
                yield saveMessage(db, accountEmail, {
                    id: message.id,
                    threadId: (_b = message.threadId) !== null && _b !== void 0 ? _b : null,
                    internalDate: message.internalDate ? Number(message.internalDate) : null,
                    date: getHeader(headers, 'Date'),
                    from: getHeader(headers, 'From'),
                    to: getHeader(headers, 'To'),
                    subject: getHeader(headers, 'Subject'),
                    snippet: (_c = message.snippet) !== null && _c !== void 0 ? _c : null,
                    isRead: ((_d = message.labelIds) === null || _d === void 0 ? void 0 : _d.includes('UNREAD')) ? 0 : 1,
                    bodyText: text,
                    bodyHtml: html,
                    raw: JSON.stringify(message),
                    priority: 1, // 自动同步新邮件默认为低优先级
                });
                newMessageIds.push(message.id);
                processedCount += 1;
            }
            pageToken = (_e = listResponse.data.nextPageToken) !== null && _e !== void 0 ? _e : undefined;
        } while (pageToken);
        yield db.close();
        return { processedCount, fromMs, toMs, newMessageIds };
    });
}
function saveMessage(db, accountEmail, msg) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
        yield db.run(`
      INSERT OR REPLACE INTO gmail_messages (
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
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
            accountEmail,
            msg.id,
            (_a = msg.threadId) !== null && _a !== void 0 ? _a : null,
            (_b = msg.internalDate) !== null && _b !== void 0 ? _b : null,
            (_c = msg.date) !== null && _c !== void 0 ? _c : null,
            (_d = msg.from) !== null && _d !== void 0 ? _d : null,
            (_e = msg.to) !== null && _e !== void 0 ? _e : null,
            (_f = msg.subject) !== null && _f !== void 0 ? _f : null,
            (_g = msg.snippet) !== null && _g !== void 0 ? _g : null,
            (_h = msg.isRead) !== null && _h !== void 0 ? _h : 1,
            (_j = msg.bodyText) !== null && _j !== void 0 ? _j : null,
            (_k = msg.bodyHtml) !== null && _k !== void 0 ? _k : null,
            (_l = msg.raw) !== null && _l !== void 0 ? _l : null,
            (_m = msg.priority) !== null && _m !== void 0 ? _m : 0,
        ]);
    });
}
