"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AGENT_CONFIG_PATH = void 0;
exports.readAgentConfig = readAgentConfig;
exports.saveAgentConfig = saveAgentConfig;
exports.maskApiKey = maskApiKey;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const DEFAULT_CONFIG = {
    provider: 'openai',
    model: 'gemini-3',
    baseUrl: '',
    apiKey: '',
    systemPrompt: '',
    primaryEmail: '',
    priorityAnalysisPrompt: '',
    mcpServers: [],
};
exports.AGENT_CONFIG_PATH = node_path_1.default.join(process.cwd(), 'agent-config.json');
function readAgentConfig() {
    if (!node_fs_1.default.existsSync(exports.AGENT_CONFIG_PATH)) {
        return Object.assign({}, DEFAULT_CONFIG);
    }
    try {
        const raw = node_fs_1.default.readFileSync(exports.AGENT_CONFIG_PATH, 'utf8');
        const parsed = JSON.parse(raw);
        return Object.assign(Object.assign(Object.assign({}, DEFAULT_CONFIG), parsed), { mcpServers: Array.isArray(parsed.mcpServers) ? parsed.mcpServers : DEFAULT_CONFIG.mcpServers });
    }
    catch (_a) {
        return Object.assign({}, DEFAULT_CONFIG);
    }
}
function saveAgentConfig(next) {
    const payload = Object.assign(Object.assign(Object.assign({}, DEFAULT_CONFIG), next), { mcpServers: Array.isArray(next.mcpServers) ? next.mcpServers : DEFAULT_CONFIG.mcpServers });
    node_fs_1.default.writeFileSync(exports.AGENT_CONFIG_PATH, JSON.stringify(payload, null, 2));
    return payload;
}
function maskApiKey(apiKey) {
    if (!apiKey)
        return null;
    if (apiKey.length <= 6)
        return '******';
    return `${apiKey.slice(0, 3)}***${apiKey.slice(-3)}`;
}
