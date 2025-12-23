"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a, _b, _c, _d;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEBUG = exports.LOG_PATH = exports.AUTO_SYNC_MINUTES = exports.REDIRECT_URI = exports.PORT = exports.SQLITE_PATH = exports.CREDENTIALS_PATH = exports.TOKEN_PATH = exports.SCOPES = void 0;
exports.setRedirectUri = setRedirectUri;
const node_path_1 = __importDefault(require("node:path"));
exports.SCOPES = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/gmail.send',
];
exports.TOKEN_PATH = node_path_1.default.join(process.cwd(), 'token.json');
exports.CREDENTIALS_PATH = node_path_1.default.join(process.cwd(), 'credentials.json');
exports.SQLITE_PATH = (_a = process.env.SQLITE_PATH) !== null && _a !== void 0 ? _a : node_path_1.default.join(process.cwd(), 'gmail.sqlite');
exports.PORT = Number((_b = process.env.PORT) !== null && _b !== void 0 ? _b : 3000);
exports.REDIRECT_URI = (_c = process.env.REDIRECT_URI) !== null && _c !== void 0 ? _c : '';
exports.AUTO_SYNC_MINUTES = Number((_d = process.env.AUTO_SYNC_MINUTES) !== null && _d !== void 0 ? _d : 0);
exports.LOG_PATH = process.env.LOG_PATH;
exports.DEBUG = process.env.DEBUG === '1' || process.env.DEBUG === 'true';
function setRedirectUri(uri) {
    exports.REDIRECT_URI = uri;
}
