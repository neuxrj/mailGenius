"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.log = log;
const node_fs_1 = __importDefault(require("node:fs"));
const config_1 = require("./config");
function log(level, message, meta) {
    if (level === 'debug' && !config_1.DEBUG)
        return;
    const line = JSON.stringify(Object.assign({ ts: new Date().toISOString(), level,
        message }, (meta ? { meta } : {})));
    // eslint-disable-next-line no-console
    console.log(line);
    if (config_1.LOG_PATH) {
        node_fs_1.default.promises.appendFile(config_1.LOG_PATH, line + '\n').catch(() => undefined);
    }
}
