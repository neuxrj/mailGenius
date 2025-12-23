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
exports.sendEmail = sendEmail;
const googleapis_1 = require("googleapis");
const sync_1 = require("./sync");
const db_1 = require("./db");
const logDb_1 = require("./logDb");
const logger_1 = require("./logger");
const LOG_SOURCE = 'src/mailer.ts';
function encodeBase64Url(str) {
    return Buffer.from(str, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
}
function buildMime(from, input) {
    var _a, _b;
    const boundary = 'mailagent_boundary';
    const headers = [
        `From: ${from}`,
        `To: ${input.to}`,
        `Subject: ${input.subject}`,
        input.html ? 'MIME-Version: 1.0' : undefined,
    ].filter(Boolean);
    if (!input.html) {
        return `${headers.join('\r\n')}\r\n\r\n${(_a = input.text) !== null && _a !== void 0 ? _a : ''}`;
    }
    const parts = [
        `--${boundary}`,
        'Content-Type: text/plain; charset="UTF-8"',
        '',
        (_b = input.text) !== null && _b !== void 0 ? _b : '',
        `--${boundary}`,
        'Content-Type: text/html; charset="UTF-8"',
        '',
        input.html,
        `--${boundary}--`,
    ].join('\r\n');
    return `${headers.join('\r\n')}\r\nContent-Type: multipart/alternative; boundary="${boundary}"\r\n\r\n${parts}`;
}
function sendEmail(auth, accountEmail, input) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o;
        const gmail = googleapis_1.google.gmail({ version: 'v1', auth });
        const raw = buildMime(accountEmail, input);
        const encoded = encodeBase64Url(raw);
        const sendResult = yield gmail.users.messages.send({
            userId: 'me',
            requestBody: { raw: encoded },
        });
        const messageId = sendResult.data.id;
        if (!messageId) {
            (0, logger_1.log)('warn', 'sendEmail: missing message id in send response');
            void (0, logDb_1.logInteraction)(LOG_SOURCE, `sendEmail missing message id to=${input.to} subject=${input.subject}`);
            return { id: null };
        }
        void (0, logDb_1.logInteraction)(LOG_SOURCE, `sendEmail ok id=${messageId} to=${input.to} subject=${input.subject}`);
        // Fetch full message to store locally
        try {
            const fetched = yield gmail.users.messages.get({
                userId: 'me',
                id: messageId,
                format: 'full',
            });
            const msg = fetched.data;
            const payload = msg.payload;
            const headers = payload === null || payload === void 0 ? void 0 : payload.headers;
            const getHeader = (name) => { var _a, _b; return (_b = (_a = headers === null || headers === void 0 ? void 0 : headers.find((h) => { var _a; return ((_a = h.name) === null || _a === void 0 ? void 0 : _a.toLowerCase()) === name.toLowerCase(); })) === null || _a === void 0 ? void 0 : _a.value) !== null && _b !== void 0 ? _b : null; };
            const decodeBody = (data) => data ? Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8') : null;
            const text = (_f = (_d = (_c = (_b = (_a = payload === null || payload === void 0 ? void 0 : payload.parts) === null || _a === void 0 ? void 0 : _a.find((p) => p.mimeType === 'text/plain')) === null || _b === void 0 ? void 0 : _b.body) === null || _c === void 0 ? void 0 : _c.data) !== null && _d !== void 0 ? _d : (_e = payload === null || payload === void 0 ? void 0 : payload.body) === null || _e === void 0 ? void 0 : _e.data) !== null && _f !== void 0 ? _f : undefined;
            const html = (_k = (_j = (_h = (_g = payload === null || payload === void 0 ? void 0 : payload.parts) === null || _g === void 0 ? void 0 : _g.find((p) => p.mimeType === 'text/html')) === null || _h === void 0 ? void 0 : _h.body) === null || _j === void 0 ? void 0 : _j.data) !== null && _k !== void 0 ? _k : undefined;
            const db = yield (0, db_1.ensureDatabase)();
            yield (0, db_1.migrateUnknownAccountEmail)(db, accountEmail);
            yield (0, sync_1.saveMessage)(db, accountEmail, {
                id: msg.id,
                threadId: (_l = msg.threadId) !== null && _l !== void 0 ? _l : null,
                internalDate: msg.internalDate ? Number(msg.internalDate) : null,
                date: getHeader('Date'),
                from: getHeader('From'),
                to: getHeader('To'),
                subject: getHeader('Subject'),
                snippet: (_m = msg.snippet) !== null && _m !== void 0 ? _m : null,
                isRead: 1,
                bodyText: decodeBody(text !== null && text !== void 0 ? text : undefined),
                bodyHtml: decodeBody(html !== null && html !== void 0 ? html : undefined),
                raw: JSON.stringify(msg),
            });
            yield db.close();
        }
        catch (err) {
            (0, logger_1.log)('warn', 'sendEmail: storing sent message failed', { error: (_o = err === null || err === void 0 ? void 0 : err.message) !== null && _o !== void 0 ? _o : String(err) });
        }
        return { id: messageId };
    });
}
