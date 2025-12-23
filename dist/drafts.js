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
exports.saveDraft = saveDraft;
exports.listDrafts = listDrafts;
exports.getDraft = getDraft;
exports.deleteDraft = deleteDraft;
const node_crypto_1 = require("node:crypto");
function saveDraft(db, input, id) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const now = Date.now();
        const draftId = id !== null && id !== void 0 ? id : (0, node_crypto_1.randomUUID)();
        yield db.run(`
      INSERT INTO mail_drafts (id, created_at, updated_at, to_email, subject, text, html)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        updated_at = excluded.updated_at,
        to_email = excluded.to_email,
        subject = excluded.subject,
        text = excluded.text,
        html = excluded.html
    `, [
            draftId,
            now,
            now,
            input.to,
            input.subject,
            (_a = input.text) !== null && _a !== void 0 ? _a : null,
            (_b = input.html) !== null && _b !== void 0 ? _b : null,
        ]);
        return draftId;
    });
}
function listDrafts(db) {
    return __awaiter(this, void 0, void 0, function* () {
        const rows = yield db.all(`
      SELECT id, created_at, updated_at, to_email, subject, text, html
      FROM mail_drafts
      ORDER BY updated_at DESC
    `);
        return rows;
    });
}
function getDraft(db, id) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const row = yield db.get(`
      SELECT id, created_at, updated_at, to_email, subject, text, html
      FROM mail_drafts
      WHERE id = ?
      LIMIT 1
    `, [id]);
        return (_a = row) !== null && _a !== void 0 ? _a : null;
    });
}
function deleteDraft(db, id) {
    return __awaiter(this, void 0, void 0, function* () {
        yield db.run(`DELETE FROM mail_drafts WHERE id = ?`, [id]);
    });
}
