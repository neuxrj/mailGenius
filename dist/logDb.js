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
exports.logInteraction = logInteraction;
const sqlite_1 = require("sqlite");
const sqlite3_1 = __importDefault(require("sqlite3"));
const config_1 = require("./config");
let dbPromise = null;
function getLogDb() {
    return __awaiter(this, void 0, void 0, function* () {
        if (!dbPromise) {
            dbPromise = (() => __awaiter(this, void 0, void 0, function* () {
                const db = yield (0, sqlite_1.open)({
                    filename: config_1.LOG_DB_PATH,
                    driver: sqlite3_1.default.Database,
                });
                yield db.exec(`
        CREATE TABLE IF NOT EXISTS logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ts TEXT NOT NULL,
          source TEXT NOT NULL,
          content TEXT NOT NULL
        );
      `);
                return db;
            }))();
        }
        return dbPromise;
    });
}
function logInteraction(source, content) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const db = yield getLogDb();
            yield db.run(`INSERT INTO logs (ts, source, content) VALUES (?, ?, ?)`, [
                new Date().toISOString(),
                source,
                content,
            ]);
        }
        catch (_a) {
            // Logging should never break normal flow.
        }
    });
}
