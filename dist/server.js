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
exports.startServer = startServer;
const express_1 = __importDefault(require("express"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const node_child_process_1 = require("node:child_process");
const googleapis_1 = require("googleapis");
const db_1 = require("./db");
const gmail_1 = require("./gmail");
const logger_1 = require("./logger");
const sync_1 = require("./sync");
const mailer_1 = require("./mailer");
const config_1 = require("./config");
const agentConfig_1 = require("./agentConfig");
let autoSyncTimer = null;
let autoSyncRunning = false;
function runAutoSync(oauthClient) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        if (autoSyncRunning)
            return;
        autoSyncRunning = true;
        try {
            const ok = yield (0, gmail_1.ensureAccessToken)(oauthClient);
            if (!ok) {
                (0, logger_1.log)('warn', 'auto-sync skipped: not authorized');
                autoSyncRunning = false;
                return;
            }
            const accountEmail = yield (0, gmail_1.getAccountEmail)(oauthClient);
            const range = (0, sync_1.defaultRange)();
            (0, logger_1.log)('info', 'auto-sync start', { accountEmail, from: range.from, to: range.to });
            const result = yield (0, sync_1.syncMessages)(oauthClient, accountEmail, range.from, range.to);
            const db = yield (0, db_1.ensureDatabase)();
            yield (0, db_1.migrateUnknownAccountEmail)(db, accountEmail);
            const countRow = yield db.get(`SELECT COUNT(*) as count FROM gmail_messages WHERE account_email = ?`, [accountEmail]);
            if (result.processedCount > 0) {
                yield db.run(`
          INSERT INTO gmail_import_runs (account_email, from_date, to_date, finished_at, processed_count)
          VALUES (?, ?, ?, ?, ?)
        `, [accountEmail, result.from, result.to, Date.now(), result.processedCount]);
            }
            yield db.close();
            (0, logger_1.log)('info', 'auto-sync finished', {
                accountEmail,
                from: result.from,
                to: result.to,
                processed: result.processedCount,
                importedCount: Number((_a = countRow === null || countRow === void 0 ? void 0 : countRow.count) !== null && _a !== void 0 ? _a : 0),
            });
        }
        catch (err) {
            (0, logger_1.log)('warn', 'auto-sync failed', { error: (_b = err === null || err === void 0 ? void 0 : err.message) !== null && _b !== void 0 ? _b : String(err) });
        }
        autoSyncRunning = false;
    });
}
function startServer() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const app = (0, express_1.default)();
        app.set('etag', false);
        app.use(express_1.default.json());
        app.use((req, res, next) => {
            if (req.path.startsWith('/api')) {
                res.set('Cache-Control', 'no-store');
            }
            const start = Date.now();
            res.on('finish', () => {
                (0, logger_1.log)('info', 'http', {
                    method: req.method,
                    path: req.path,
                    status: res.statusCode,
                    ms: Date.now() - start,
                });
            });
            next();
        });
        // Handle desktop-app redirect to root with ?code=...
        app.use((req, res, next) => {
            if (req.path === '/' && typeof req.query.code === 'string') {
                res.redirect(`/auth/callback?code=${encodeURIComponent(String(req.query.code))}`);
                return;
            }
            next();
        });
        app.use(express_1.default.static(process.cwd() + '/public'));
        const oauthClient = yield (0, gmail_1.createOAuthClient)();
        if ((_a = oauthClient.credentials) === null || _a === void 0 ? void 0 : _a.access_token) {
            (0, gmail_1.getAccountEmail)(oauthClient).catch(() => undefined);
        }
        if ((0, gmail_1.autoSyncEnabled)()) {
            (0, logger_1.log)('info', 'auto-sync enabled', { minutes: config_1.AUTO_SYNC_MINUTES });
            autoSyncTimer = setInterval(() => runAutoSync(oauthClient), config_1.AUTO_SYNC_MINUTES * 60 * 1000);
            setTimeout(() => runAutoSync(oauthClient), 5000);
        }
        app.get('/api/status', (req, res) => __awaiter(this, void 0, void 0, function* () {
            var _a;
            const authorized = yield (0, gmail_1.ensureAccessToken)(oauthClient);
            let email = null;
            if (authorized) {
                try {
                    email = yield (0, gmail_1.getAccountEmail)(oauthClient);
                }
                catch (_b) {
                    email = null;
                }
            }
            res.json({
                authorized,
                email,
                hasRefreshToken: Boolean((_a = oauthClient.credentials) === null || _a === void 0 ? void 0 : _a.refresh_token),
                lastAuthError: (0, gmail_1.getLastAuthError)(),
            });
        }));
        app.get('/api/profile', (req, res) => __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            const ok = yield (0, gmail_1.ensureAccessToken)(oauthClient);
            if (!ok) {
                res.json({ authorized: false });
                return;
            }
            try {
                const email = yield (0, gmail_1.getAccountEmail)(oauthClient);
                const db = yield (0, db_1.ensureDatabase)();
                yield (0, db_1.migrateUnknownAccountEmail)(db, email);
                const row = yield db.get(`SELECT COUNT(*) as count FROM gmail_messages WHERE account_email = ?`, [email]);
                yield db.close();
                res.json({ authorized: true, email, importedCount: Number((_a = row === null || row === void 0 ? void 0 : row.count) !== null && _a !== void 0 ? _a : 0), sqlitePath: config_1.SQLITE_PATH });
            }
            catch (err) {
                (0, logger_1.log)('error', 'api/profile failed', { error: (_b = err === null || err === void 0 ? void 0 : err.message) !== null && _b !== void 0 ? _b : String(err) });
                res.status(500).json({ error: (_c = err === null || err === void 0 ? void 0 : err.message) !== null && _c !== void 0 ? _c : 'Failed to load profile' });
            }
        }));
        app.get('/api/debug', (req, res) => __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e, _f;
            const db = yield (0, db_1.ensureDatabase)();
            const totalRow = yield db.get(`SELECT COUNT(*) as count FROM gmail_messages`);
            const runsRow = yield db.get(`SELECT COUNT(*) as count FROM gmail_import_runs`);
            yield db.close();
            res.json({
                port: config_1.PORT,
                redirectUri: config_1.REDIRECT_URI,
                sqlitePath: config_1.SQLITE_PATH,
                tokenPathExists: node_fs_1.default.existsSync(config_1.TOKEN_PATH),
                hasAccessToken: Boolean((_a = oauthClient.credentials) === null || _a === void 0 ? void 0 : _a.access_token),
                hasRefreshToken: Boolean((_b = oauthClient.credentials) === null || _b === void 0 ? void 0 : _b.refresh_token),
                expiryDate: (_d = (_c = oauthClient.credentials) === null || _c === void 0 ? void 0 : _c.expiry_date) !== null && _d !== void 0 ? _d : null,
                cachedAccountEmail: (0, gmail_1.getCachedAccountEmail)(),
                lastAuthError: (0, gmail_1.getLastAuthError)(),
                totalMessages: Number((_e = totalRow === null || totalRow === void 0 ? void 0 : totalRow.count) !== null && _e !== void 0 ? _e : 0),
                importRuns: Number((_f = runsRow === null || runsRow === void 0 ? void 0 : runsRow.count) !== null && _f !== void 0 ? _f : 0),
            });
        }));
        app.get('/api/messages', (req, res) => __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d;
            const ok = yield (0, gmail_1.ensureAccessToken)(oauthClient);
            if (!ok) {
                res.status(401).json({ error: 'Not authorized. Login first.' });
                return;
            }
            try {
                const accountEmail = yield (0, gmail_1.getAccountEmail)(oauthClient);
                const order = req.query.order === 'asc' ? 'ASC' : 'DESC';
                const limit = Math.min(Number((_a = req.query.limit) !== null && _a !== void 0 ? _a : 50), 200);
                const offset = Math.max(Number((_b = req.query.offset) !== null && _b !== void 0 ? _b : 0), 0);
                const readFilter = typeof req.query.read === 'string' ? req.query.read : 'all';
                const whereClauses = [];
                const params = [];
                whereClauses.push('account_email = ?');
                params.push(accountEmail);
                if (readFilter === 'read') {
                    whereClauses.push('is_read = 1');
                }
                else if (readFilter === 'unread') {
                    whereClauses.push('is_read = 0');
                }
                const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';
                const db = yield (0, db_1.ensureDatabase)();
                yield (0, db_1.migrateUnknownAccountEmail)(db, accountEmail);
                const rows = yield db.all(`
        SELECT message_id as id, subject, from_email, date, snippet, internal_date, is_read
        FROM gmail_messages
        ${whereSql}
        ORDER BY internal_date ${order}
        LIMIT ? OFFSET ?
      `, [...params, limit, offset]);
                yield db.close();
                (0, logger_1.log)('debug', 'api/messages ok', { accountEmail, rows: rows.length, order, limit, offset, readFilter });
                res.json({ messages: rows });
            }
            catch (err) {
                (0, logger_1.log)('error', 'api/messages failed', { error: (_c = err === null || err === void 0 ? void 0 : err.message) !== null && _c !== void 0 ? _c : String(err) });
                res.status(500).json({ error: (_d = err === null || err === void 0 ? void 0 : err.message) !== null && _d !== void 0 ? _d : 'Failed to load messages' });
            }
        }));
        app.get('/api/sent', (req, res) => __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e, _f;
            const ok = yield (0, gmail_1.ensureAccessToken)(oauthClient);
            if (!ok) {
                res.status(401).json({ error: 'Not authorized. Login first.' });
                return;
            }
            const def = (0, sync_1.defaultSentRange)();
            const from = typeof req.query.from === 'string' ? req.query.from : def.from;
            const to = typeof req.query.to === 'string' ? req.query.to : def.to;
            try {
                const accountEmail = yield (0, gmail_1.getAccountEmail)(oauthClient);
                const gmail = googleapis_1.google.gmail({ version: 'v1', auth: oauthClient });
                const { after, before } = (() => {
                    const fromDate = new Date(`${from}T00:00:00Z`);
                    const toDate = new Date(`${to}T00:00:00Z`);
                    const toQuery = (d) => `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}`;
                    const beforeDate = new Date(toDate);
                    beforeDate.setUTCDate(beforeDate.getUTCDate() + 1);
                    return { after: toQuery(fromDate), before: toQuery(beforeDate) };
                })();
                const q = `in:sent after:${after} before:${before}`;
                const listResponse = yield gmail.users.messages.list({
                    userId: 'me',
                    q,
                    maxResults: 100,
                });
                const messages = (_a = listResponse.data.messages) !== null && _a !== void 0 ? _a : [];
                const results = [];
                for (const msg of messages) {
                    if (!msg.id)
                        continue;
                    const messageResponse = yield gmail.users.messages.get({
                        userId: 'me',
                        id: msg.id,
                        format: 'metadata',
                        metadataHeaders: ['To', 'Subject', 'Date'],
                    });
                    const headers = (_c = (_b = messageResponse.data.payload) === null || _b === void 0 ? void 0 : _b.headers) !== null && _c !== void 0 ? _c : [];
                    const getHeader = (name) => { var _a, _b; return (_b = (_a = headers.find((h) => { var _a; return ((_a = h.name) === null || _a === void 0 ? void 0 : _a.toLowerCase()) === name.toLowerCase(); })) === null || _a === void 0 ? void 0 : _a.value) !== null && _b !== void 0 ? _b : null; };
                    results.push({
                        id: msg.id,
                        subject: getHeader('Subject'),
                        to_email: getHeader('To'),
                        date: getHeader('Date'),
                        snippet: (_d = messageResponse.data.snippet) !== null && _d !== void 0 ? _d : null,
                        internal_date: messageResponse.data.internalDate
                            ? Number(messageResponse.data.internalDate)
                            : null,
                    });
                }
                res.json({ messages: results, from, to });
            }
            catch (err) {
                (0, logger_1.log)('error', 'api/sent failed', { error: (_e = err === null || err === void 0 ? void 0 : err.message) !== null && _e !== void 0 ? _e : String(err) });
                res.status(500).json({ error: (_f = err === null || err === void 0 ? void 0 : err.message) !== null && _f !== void 0 ? _f : 'Failed to load sent messages' });
            }
        }));
        app.post('/api/send', (req, res) => __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            const ok = yield (0, gmail_1.ensureAccessToken)(oauthClient);
            if (!ok) {
                res.status(401).json({ error: 'Not authorized. Login first.' });
                return;
            }
            const { to, subject, text, html } = (_a = req.body) !== null && _a !== void 0 ? _a : {};
            if (!to || !subject) {
                res.status(400).json({ error: 'Missing "to" or "subject"' });
                return;
            }
            try {
                const accountEmail = yield (0, gmail_1.getAccountEmail)(oauthClient);
                const result = yield (0, mailer_1.sendEmail)(oauthClient, accountEmail, {
                    to,
                    subject,
                    text: typeof text === 'string' ? text : '',
                    html: typeof html === 'string' ? html : undefined,
                });
                res.json({ id: result.id, to, subject });
            }
            catch (err) {
                (0, logger_1.log)('error', 'api/send failed', { error: (_b = err === null || err === void 0 ? void 0 : err.message) !== null && _b !== void 0 ? _b : String(err) });
                res.status(500).json({ error: (_c = err === null || err === void 0 ? void 0 : err.message) !== null && _c !== void 0 ? _c : 'Failed to send email' });
            }
        }));
        app.get('/api/agent/config', (req, res) => {
            var _a, _b;
            const config = (0, agentConfig_1.readAgentConfig)();
            res.json({
                provider: config.provider,
                model: (_a = config.model) !== null && _a !== void 0 ? _a : null,
                baseUrl: (_b = config.baseUrl) !== null && _b !== void 0 ? _b : null,
                hasApiKey: Boolean(config.apiKey),
                apiKeyMasked: (0, agentConfig_1.maskApiKey)(config.apiKey),
            });
        });
        app.post('/api/agent/config', (req, res) => {
            var _a, _b, _c;
            const current = (0, agentConfig_1.readAgentConfig)();
            const { provider, apiKey, baseUrl, model } = (_a = req.body) !== null && _a !== void 0 ? _a : {};
            const next = (0, agentConfig_1.saveAgentConfig)(Object.assign(Object.assign({}, current), { provider: provider === 'openai' ? provider : current.provider, baseUrl: typeof baseUrl === 'string' ? baseUrl : current.baseUrl, model: typeof model === 'string' ? model : current.model, apiKey: typeof apiKey === 'string' && apiKey.trim() ? apiKey.trim() : current.apiKey }));
            res.json({
                provider: next.provider,
                model: (_b = next.model) !== null && _b !== void 0 ? _b : null,
                baseUrl: (_c = next.baseUrl) !== null && _c !== void 0 ? _c : null,
                hasApiKey: Boolean(next.apiKey),
                apiKeyMasked: (0, agentConfig_1.maskApiKey)(next.apiKey),
            });
        });
        app.post('/api/agent/chat', (req, res) => __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            const { message, model } = (_a = req.body) !== null && _a !== void 0 ? _a : {};
            if (!message || typeof message !== 'string') {
                res.status(400).json({ error: 'Missing message' });
                return;
            }
            const config = (0, agentConfig_1.readAgentConfig)();
            if (!config.apiKey) {
                res.status(400).json({ error: 'Missing agent API key. Configure it first.' });
                return;
            }
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            (_b = res.flushHeaders) === null || _b === void 0 ? void 0 : _b.call(res);
            const runnerPath = node_path_1.default.join(process.cwd(), 'agent', 'zypher_runner.ts');
            const args = ['run', '-A', runnerPath, '--config', agentConfig_1.AGENT_CONFIG_PATH];
            if (typeof model === 'string' && model.trim()) {
                args.push('--model', model.trim());
            }
            (0, logger_1.log)('info', 'agent chat spawn', { runnerPath, model: (_c = model !== null && model !== void 0 ? model : config.model) !== null && _c !== void 0 ? _c : null });
            res.write(`event: start\ndata: ${JSON.stringify({ type: 'start' })}\n\n`);
            const proc = (0, node_child_process_1.spawn)('deno', args, {
                stdio: ['pipe', 'pipe', 'pipe'],
                env: process.env,
            });
            proc.stdin.write(message);
            proc.stdin.end();
            let buffer = '';
            proc.stdout.on('data', (chunk) => {
                var _a;
                buffer += chunk.toString();
                const lines = buffer.split(/\r?\n/);
                buffer = (_a = lines.pop()) !== null && _a !== void 0 ? _a : '';
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed)
                        continue;
                    res.write(`data: ${trimmed}\n\n`);
                }
            });
            proc.stderr.on('data', (chunk) => {
                const msg = chunk.toString();
                (0, logger_1.log)('warn', 'agent chat stderr', { message: msg });
                const payload = JSON.stringify({ type: 'stderr', message: msg });
                res.write(`event: stderr\ndata: ${payload}\n\n`);
            });
            proc.on('error', (err) => {
                (0, logger_1.log)('error', 'agent chat spawn failed', { error: err.message });
                const payload = JSON.stringify({ type: 'error', message: err.message });
                res.write(`event: error\ndata: ${payload}\n\n`);
                res.end();
            });
            proc.on('close', (code, signal) => {
                const leftover = buffer.trim();
                if (leftover) {
                    res.write(`data: ${leftover}\n\n`);
                }
                (0, logger_1.log)('info', 'agent chat closed', { code, signal });
                const payload = JSON.stringify({ type: 'done', code, signal });
                res.write(`event: done\ndata: ${payload}\n\n`);
                res.end();
            });
            req.on('aborted', () => {
                (0, logger_1.log)('warn', 'agent chat aborted by client');
                proc.kill('SIGTERM');
            });
            res.on('close', () => {
                if (!res.writableEnded) {
                    (0, logger_1.log)('warn', 'agent chat response closed early');
                    proc.kill('SIGTERM');
                }
            });
        }));
        app.get('/api/messages/:id', (req, res) => __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y;
            const ok = yield (0, gmail_1.ensureAccessToken)(oauthClient);
            if (!ok) {
                res.status(401).json({ error: 'Not authorized. Login first.' });
                return;
            }
            const id = req.params.id;
            try {
                const accountEmail = yield (0, gmail_1.getAccountEmail)(oauthClient);
                const db = yield (0, db_1.ensureDatabase)();
                yield (0, db_1.migrateUnknownAccountEmail)(db, accountEmail);
                const row = yield db.get(`
        SELECT message_id as id, subject, from_email, to_email, date, snippet, is_read, body_text, body_html
        FROM gmail_messages
        WHERE account_email = ? AND message_id = ?
      `, [accountEmail, id]);
                if (row) {
                    if (row.is_read === 0) {
                        try {
                            const gmail = googleapis_1.google.gmail({ version: 'v1', auth: oauthClient });
                            yield gmail.users.messages.modify({
                                userId: 'me',
                                id,
                                requestBody: { removeLabelIds: ['UNREAD'] },
                            });
                            yield db.run(`UPDATE gmail_messages SET is_read = 1 WHERE account_email = ? AND message_id = ?`, [accountEmail, id]);
                            row.is_read = 1;
                        }
                        catch (err) {
                            (0, logger_1.log)('warn', 'mark read failed', { error: (_a = err === null || err === void 0 ? void 0 : err.message) !== null && _a !== void 0 ? _a : String(err), id });
                        }
                    }
                    yield db.close();
                    res.json(row);
                    return;
                }
                // Fallback: fetch from Gmail live
                const gmail = googleapis_1.google.gmail({ version: 'v1', auth: oauthClient });
                const live = yield gmail.users.messages.get({
                    userId: 'me',
                    id,
                    format: 'full',
                });
                const message = live.data;
                const headers = (_c = (_b = message.payload) === null || _b === void 0 ? void 0 : _b.headers) !== null && _c !== void 0 ? _c : [];
                const getHeader = (name) => { var _a, _b; return (_b = (_a = headers.find((h) => { var _a; return ((_a = h.name) === null || _a === void 0 ? void 0 : _a.toLowerCase()) === name.toLowerCase(); })) === null || _a === void 0 ? void 0 : _a.value) !== null && _b !== void 0 ? _b : null; };
                const decode = (data) => data ? Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8') : null;
                const textPart = (_l = (_h = (_g = (_f = (_e = (_d = message.payload) === null || _d === void 0 ? void 0 : _d.parts) === null || _e === void 0 ? void 0 : _e.find((p) => p.mimeType === 'text/plain')) === null || _f === void 0 ? void 0 : _f.body) === null || _g === void 0 ? void 0 : _g.data) !== null && _h !== void 0 ? _h : (_k = (_j = message.payload) === null || _j === void 0 ? void 0 : _j.body) === null || _k === void 0 ? void 0 : _k.data) !== null && _l !== void 0 ? _l : null;
                const htmlPart = (_r = (_q = (_p = (_o = (_m = message.payload) === null || _m === void 0 ? void 0 : _m.parts) === null || _o === void 0 ? void 0 : _o.find((p) => p.mimeType === 'text/html')) === null || _p === void 0 ? void 0 : _p.body) === null || _q === void 0 ? void 0 : _q.data) !== null && _r !== void 0 ? _r : null;
                if ((_s = message.labelIds) === null || _s === void 0 ? void 0 : _s.includes('UNREAD')) {
                    try {
                        yield gmail.users.messages.modify({
                            userId: 'me',
                            id,
                            requestBody: { removeLabelIds: ['UNREAD'] },
                        });
                    }
                    catch (err) {
                        (0, logger_1.log)('warn', 'mark read failed (live fetch)', { error: (_t = err === null || err === void 0 ? void 0 : err.message) !== null && _t !== void 0 ? _t : String(err), id });
                    }
                }
                yield (0, sync_1.saveMessage)(db, accountEmail, {
                    id: message.id,
                    threadId: (_u = message.threadId) !== null && _u !== void 0 ? _u : null,
                    internalDate: message.internalDate ? Number(message.internalDate) : null,
                    date: getHeader('Date'),
                    from: getHeader('From'),
                    to: getHeader('To'),
                    subject: getHeader('Subject'),
                    snippet: (_v = message.snippet) !== null && _v !== void 0 ? _v : null,
                    isRead: 1,
                    bodyText: decode(textPart),
                    bodyHtml: decode(htmlPart),
                    raw: JSON.stringify(message),
                });
                yield db.close();
                res.json({
                    id: message.id,
                    subject: getHeader('Subject'),
                    from_email: getHeader('From'),
                    to_email: getHeader('To'),
                    date: getHeader('Date'),
                    snippet: (_w = message.snippet) !== null && _w !== void 0 ? _w : null,
                    is_read: 1,
                    body_text: decode(textPart),
                    body_html: decode(htmlPart),
                });
            }
            catch (err) {
                (0, logger_1.log)('error', 'api/messages/:id failed', { error: (_x = err === null || err === void 0 ? void 0 : err.message) !== null && _x !== void 0 ? _x : String(err), id });
                res.status(500).json({ error: (_y = err === null || err === void 0 ? void 0 : err.message) !== null && _y !== void 0 ? _y : 'Failed to load message' });
            }
        }));
        app.get('/auth/start', (req, res) => {
            const authUrl = oauthClient.generateAuthUrl({
                access_type: 'offline',
                scope: config_1.SCOPES,
                prompt: 'consent',
            });
            (0, logger_1.log)('info', 'oauth start', { redirectUri: config_1.REDIRECT_URI });
            res.redirect(authUrl);
        });
        app.get('/auth/callback', (req, res) => __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            const code = String((_a = req.query.code) !== null && _a !== void 0 ? _a : '');
            if (!code) {
                res.status(400).send('Missing code in callback.');
                return;
            }
            try {
                yield (0, gmail_1.handleOauthCallback)(oauthClient, code);
                res.redirect('/?authed=1');
            }
            catch (err) {
                (0, logger_1.log)('error', 'oauth callback failed', { error: (_b = err === null || err === void 0 ? void 0 : err.message) !== null && _b !== void 0 ? _b : String(err) });
                res.status(500).send(`Failed to exchange code: ${(_c = err === null || err === void 0 ? void 0 : err.message) !== null && _c !== void 0 ? _c : 'Unknown error'}`);
            }
        }));
        app.get('/api/sync', (req, res) => __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e;
            const ok = yield (0, gmail_1.ensureAccessToken)(oauthClient);
            if (!ok) {
                res.status(401).json({ error: 'Not authorized. Login first.' });
                return;
            }
            const from = typeof req.query.from === 'string' ? req.query.from : undefined;
            const to = typeof req.query.to === 'string' ? req.query.to : undefined;
            const range = from && to ? { from, to } : (0, sync_1.defaultRange)();
            const force = req.query.force === '1';
            try {
                const accountEmail = yield (0, gmail_1.getAccountEmail)(oauthClient);
                (0, logger_1.log)('info', 'sync start', { accountEmail, from: range.from, to: range.to, force });
                const db = yield (0, db_1.ensureDatabase)();
                yield (0, db_1.migrateUnknownAccountEmail)(db, accountEmail);
                const existing = yield db.get(`
        SELECT id FROM gmail_import_runs
        WHERE account_email = ? AND from_date = ? AND to_date = ?
        LIMIT 1
      `, [accountEmail, range.from, range.to]);
                if (existing && !force) {
                    const row = yield db.get(`SELECT COUNT(*) as count FROM gmail_messages WHERE account_email = ?`, [accountEmail]);
                    yield db.close();
                    (0, logger_1.log)('info', 'sync skipped (already imported range)', {
                        accountEmail,
                        from: range.from,
                        to: range.to,
                        importedCount: Number((_a = row === null || row === void 0 ? void 0 : row.count) !== null && _a !== void 0 ? _a : 0),
                    });
                    res.json({
                        skipped: true,
                        processed: 0,
                        from: range.from,
                        to: range.to,
                        email: accountEmail,
                        importedCount: Number((_b = row === null || row === void 0 ? void 0 : row.count) !== null && _b !== void 0 ? _b : 0),
                        sqlitePath: config_1.SQLITE_PATH,
                    });
                    return;
                }
                yield db.close();
                const result = yield (0, sync_1.syncMessages)(oauthClient, accountEmail, range.from, range.to);
                const db2 = yield (0, db_1.ensureDatabase)();
                yield (0, db_1.migrateUnknownAccountEmail)(db2, accountEmail);
                yield db2.run(`
        INSERT INTO gmail_import_runs (account_email, from_date, to_date, finished_at, processed_count)
        VALUES (?, ?, ?, ?, ?)
      `, [accountEmail, result.from, result.to, Date.now(), result.processedCount]);
                const countRow = yield db2.get(`SELECT COUNT(*) as count FROM gmail_messages WHERE account_email = ?`, [accountEmail]);
                yield db2.close();
                (0, logger_1.log)('info', 'sync finished', {
                    accountEmail,
                    from: result.from,
                    to: result.to,
                    processed: result.processedCount,
                    importedCount: Number((_c = countRow === null || countRow === void 0 ? void 0 : countRow.count) !== null && _c !== void 0 ? _c : 0),
                });
                res.json({
                    processed: result.processedCount,
                    from: result.from,
                    to: result.to,
                    email: accountEmail,
                    importedCount: Number((_d = countRow === null || countRow === void 0 ? void 0 : countRow.count) !== null && _d !== void 0 ? _d : 0),
                    sqlitePath: config_1.SQLITE_PATH,
                });
            }
            catch (err) {
                res.status(400).json({ error: (_e = err === null || err === void 0 ? void 0 : err.message) !== null && _e !== void 0 ? _e : 'Failed to sync' });
            }
        }));
        const server = app.listen(config_1.PORT, () => {
            (0, logger_1.log)('info', 'server started', { port: config_1.PORT, redirectUri: config_1.REDIRECT_URI, autoSync: config_1.AUTO_SYNC_MINUTES });
        });
        server.on('error', (err) => {
            if ((err === null || err === void 0 ? void 0 : err.code) === 'EADDRINUSE') {
                console.error(`Port ${config_1.PORT} is already in use. Stop the other process or run with PORT=3001 (and update your OAuth redirect URI).`);
                process.exit(1);
            }
            console.error(err);
            process.exit(1);
        });
        const shutdown = () => {
            if (autoSyncTimer)
                clearInterval(autoSyncTimer);
            (0, gmail_1.clearCachedAccount)();
        };
        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);
    });
}
