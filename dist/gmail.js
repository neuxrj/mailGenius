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
exports.getCachedAccountEmail = getCachedAccountEmail;
exports.getLastAuthError = getLastAuthError;
exports.hasAnyCredential = hasAnyCredential;
exports.ensureAccessToken = ensureAccessToken;
exports.createOAuthClient = createOAuthClient;
exports.getAccountEmail = getAccountEmail;
exports.clearCachedAccount = clearCachedAccount;
exports.handleOauthCallback = handleOauthCallback;
exports.autoSyncEnabled = autoSyncEnabled;
const node_fs_1 = __importDefault(require("node:fs"));
const googleapis_1 = require("googleapis");
const config_1 = require("./config");
const logger_1 = require("./logger");
let cachedAccountEmail = null;
let lastAuthError = null;
function getCachedAccountEmail() {
    return cachedAccountEmail;
}
function getLastAuthError() {
    return lastAuthError;
}
function hasAnyCredential(authClient) {
    var _a;
    const creds = (_a = authClient === null || authClient === void 0 ? void 0 : authClient.credentials) !== null && _a !== void 0 ? _a : {};
    return Boolean(creds.access_token || creds.refresh_token);
}
function ensureAccessToken(authClient) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        if (!hasAnyCredential(authClient))
            return false;
        try {
            const token = yield authClient.getAccessToken();
            lastAuthError = null;
            return Boolean(token === null || token === void 0 ? void 0 : token.token);
        }
        catch (err) {
            lastAuthError = (_a = err === null || err === void 0 ? void 0 : err.message) !== null && _a !== void 0 ? _a : String(err);
            (0, logger_1.log)('warn', 'ensureAccessToken failed', { error: lastAuthError });
            return false;
        }
    });
}
function loadCredentials() {
    return __awaiter(this, void 0, void 0, function* () {
        if (!node_fs_1.default.existsSync(config_1.CREDENTIALS_PATH)) {
            throw new Error(`Missing ${config_1.CREDENTIALS_PATH}. Download OAuth client credentials.`);
        }
        const content = yield node_fs_1.default.promises.readFile(config_1.CREDENTIALS_PATH, 'utf8');
        return JSON.parse(content);
    });
}
function createOAuthClient() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        const credentials = yield loadCredentials();
        const config = (_b = (_a = credentials.installed) !== null && _a !== void 0 ? _a : credentials.web) !== null && _b !== void 0 ? _b : {};
        const { client_secret, client_id, redirect_uris } = config;
        if (!client_id || !client_secret || !(redirect_uris === null || redirect_uris === void 0 ? void 0 : redirect_uris.length)) {
            throw new Error('Invalid credentials.json. Expect installed/web client info.');
        }
        const fallback = `http://localhost:${config_1.PORT.toString()}/auth/callback`;
        const first = redirect_uris[0];
        const preferLoopback = first === 'http://localhost' || first === 'http://127.0.0.1'
            ? fallback
            : first !== null && first !== void 0 ? first : fallback;
        const chosenRedirect = (_c = process.env.REDIRECT_URI) !== null && _c !== void 0 ? _c : preferLoopback;
        (0, config_1.setRedirectUri)(chosenRedirect);
        if (!redirect_uris.includes(chosenRedirect)) {
            (0, logger_1.log)('warn', 'Redirect URI not in credentials.json; using it anyway', { chosenRedirect });
        }
        const client = new googleapis_1.google.auth.OAuth2(client_id, client_secret, chosenRedirect);
        if (node_fs_1.default.existsSync(config_1.TOKEN_PATH)) {
            const token = yield node_fs_1.default.promises.readFile(config_1.TOKEN_PATH, 'utf8');
            client.setCredentials(JSON.parse(token));
        }
        return client;
    });
}
function getAccountEmail(auth) {
    return __awaiter(this, void 0, void 0, function* () {
        if (cachedAccountEmail)
            return cachedAccountEmail;
        const gmail = googleapis_1.google.gmail({ version: 'v1', auth });
        const profile = yield gmail.users.getProfile({ userId: 'me' });
        const email = profile.data.emailAddress;
        if (!email)
            throw new Error('Unable to determine account email');
        cachedAccountEmail = email;
        return email;
    });
}
function clearCachedAccount() {
    cachedAccountEmail = null;
}
function handleOauthCallback(oauthClient, code) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        const tokenResponse = yield oauthClient.getToken(code);
        let existingRefreshToken = typeof ((_a = oauthClient.credentials) === null || _a === void 0 ? void 0 : _a.refresh_token) === 'string'
            ? oauthClient.credentials.refresh_token
            : undefined;
        if (!existingRefreshToken && node_fs_1.default.existsSync(config_1.TOKEN_PATH)) {
            try {
                const prior = JSON.parse(yield node_fs_1.default.promises.readFile(config_1.TOKEN_PATH, 'utf8'));
                existingRefreshToken =
                    typeof (prior === null || prior === void 0 ? void 0 : prior.refresh_token) === 'string' ? prior.refresh_token : undefined;
            }
            catch (_d) {
                existingRefreshToken = undefined;
            }
        }
        const mergedTokens = Object.assign(Object.assign({}, tokenResponse.tokens), { refresh_token: (_b = tokenResponse.tokens.refresh_token) !== null && _b !== void 0 ? _b : existingRefreshToken });
        oauthClient.setCredentials(mergedTokens);
        clearCachedAccount();
        try {
            yield getAccountEmail(oauthClient);
        }
        catch (err) {
            (0, logger_1.log)('warn', 'oauth callback: failed to read profile', { error: (_c = err === null || err === void 0 ? void 0 : err.message) !== null && _c !== void 0 ? _c : String(err) });
        }
        yield node_fs_1.default.promises.writeFile(config_1.TOKEN_PATH, JSON.stringify(mergedTokens, null, 2));
        if (!mergedTokens.refresh_token) {
            (0, logger_1.log)('warn', 'oauth callback: refresh_token missing; may break after access token expires', {
                hint: 'Revoke app access in Google Account and re-authorize',
            });
        }
    });
}
function autoSyncEnabled() {
    return config_1.AUTO_SYNC_MINUTES > 0;
}
