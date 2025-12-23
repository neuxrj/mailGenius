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
exports.analyzeEmailPriority = analyzeEmailPriority;
const node_child_process_1 = require("node:child_process");
const node_path_1 = __importDefault(require("node:path"));
const logger_1 = require("./logger");
const logDb_1 = require("./logDb");
const chatDb_1 = require("./chatDb");
const agentConfig_1 = require("./agentConfig");
const LOG_SOURCE = 'src/agent.ts';
/**
 * 分析新邮件的优先级
 * @param accountEmail 账户邮箱
 * @param messageIds 新邮件ID列表
 * @returns 分析结果
 */
function analyzeEmailPriority(accountEmail, messageIds) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const startTime = Date.now();
        (0, logger_1.log)('info', 'Starting email priority analysis', {
            accountEmail,
            messageCount: messageIds.length,
        });
        void (0, logDb_1.logInteraction)(LOG_SOURCE, `Starting priority analysis: account=${accountEmail}, count=${messageIds.length}, ids=${messageIds.slice(0, 3).join(',')}`);
        try {
            // 读取 Agent 配置
            const config = (0, agentConfig_1.readAgentConfig)();
            let analysisPrompt = config.priorityAnalysisPrompt || getDefaultAnalysisPrompt(accountEmail, messageIds.length);
            // 替换占位符
            analysisPrompt = analysisPrompt
                .replace(/{accountEmail}/g, accountEmail)
                .replace(/{count}/g, String(messageIds.length));
            // 创建分析会话
            const sessionId = yield (0, chatDb_1.createChatSession)(`Auto-analyze ${messageIds.length} emails`);
            void (0, logDb_1.logInteraction)(LOG_SOURCE, `Created analysis session: ${sessionId}`);
            // 启动 Agent 进程
            const runnerPath = node_path_1.default.join(process.cwd(), 'agent', 'zypher_runner.ts');
            const args = ['run', '-A', runnerPath, '--config', agentConfig_1.AGENT_CONFIG_PATH, '--session', sessionId];
            (0, logger_1.log)('info', 'Spawning Zypher agent for priority analysis', {
                sessionId,
                messageCount: messageIds.length,
                runnerPath,
            });
            const proc = (0, node_child_process_1.spawn)('deno', args, {
                stdio: ['pipe', 'pipe', 'pipe'],
                env: process.env,
            });
            // 发送分析提示词
            proc.stdin.write(analysisPrompt);
            proc.stdin.end();
            void (0, logDb_1.logInteraction)(LOG_SOURCE, `Sent analysis prompt to agent, session=${sessionId}`);
            // 收集输出和错误
            let stdout = '';
            let stderr = '';
            proc.stdout.on('data', (chunk) => {
                const text = chunk.toString();
                stdout += text;
                // 实时记录关键输出
                if (text.includes('gmail_update_priority') || text.includes('priority')) {
                    void (0, logDb_1.logInteraction)(LOG_SOURCE, `Agent output: ${text.trim().slice(0, 200)}`);
                }
            });
            proc.stderr.on('data', (chunk) => {
                const text = chunk.toString();
                stderr += text;
                (0, logger_1.log)('warn', 'Agent stderr', { message: text.trim() });
                void (0, logDb_1.logInteraction)(LOG_SOURCE, `Agent stderr: ${text.trim()}`);
            });
            // 等待进程完成
            const result = yield new Promise((resolve) => {
                proc.on('close', (code) => {
                    const duration = Date.now() - startTime;
                    if (code === 0) {
                        (0, logger_1.log)('info', 'Email priority analysis completed successfully', {
                            sessionId,
                            messageCount: messageIds.length,
                            duration,
                        });
                        void (0, logDb_1.logInteraction)(LOG_SOURCE, `Analysis completed: session=${sessionId}, count=${messageIds.length}, duration=${duration}ms, code=${code}`);
                        resolve({
                            sessionId,
                            success: true,
                            analyzedCount: messageIds.length,
                        });
                    }
                    else {
                        (0, logger_1.log)('warn', 'Email priority analysis exited with non-zero code', {
                            code,
                            sessionId,
                            stderr: stderr.slice(0, 500),
                        });
                        void (0, logDb_1.logInteraction)(LOG_SOURCE, `Analysis failed: session=${sessionId}, code=${code}, stderr=${stderr.slice(0, 200)}`);
                        resolve({
                            sessionId,
                            success: false,
                            error: `Agent exited with code ${code}`,
                            analyzedCount: 0,
                        });
                    }
                });
                proc.on('error', (err) => {
                    (0, logger_1.log)('error', 'Failed to spawn agent process', { error: err.message });
                    void (0, logDb_1.logInteraction)(LOG_SOURCE, `Agent spawn error: ${err.message}`);
                    resolve({
                        sessionId,
                        success: false,
                        error: err.message,
                        analyzedCount: 0,
                    });
                });
            });
            return result;
        }
        catch (err) {
            const errorMsg = (_a = err === null || err === void 0 ? void 0 : err.message) !== null && _a !== void 0 ? _a : String(err);
            (0, logger_1.log)('error', 'Email priority analysis failed', { error: errorMsg });
            void (0, logDb_1.logInteraction)(LOG_SOURCE, `Analysis task creation failed: ${errorMsg}`);
            return {
                sessionId: '',
                success: false,
                error: errorMsg,
                analyzedCount: 0,
            };
        }
    });
}
/**
 * 获取默认的分析提示词（如果配置中没有）
 */
function getDefaultAnalysisPrompt(accountEmail, count) {
    return `有 ${count} 封新邮件到达 (account: ${accountEmail})。请分析这些邮件的优先级：

请按以下步骤处理：
1. 使用 gmail_query 工具查询 account_email="${accountEmail}" 且 priority=1 的最新邮件（这些是刚拉取的新邮件）
2. 分析每封邮件的内容（发件人、主题、正文摘要）
3. 对于重要邮件，调用 gmail_update_priority 工具将其标记为高优先级(2)
4. 不重要的邮件保持低优先级(1)，无需调用工具

重要邮件判断标准：
- 来自重要联系人（老板、客户、合作伙伴）
- 包含紧急关键词（urgent、deadline、asap、重要、紧急）
- 需要用户操作（审批、确认、签署）
- 安全相关（密码重置、登录提醒）

请简洁报告分析结果。`;
}
