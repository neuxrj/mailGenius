# Zypher Agent 开发文档（从 0 到可运行 Agent）

> 目标读者：后端工程师 / Agent 工程化落地  
> 本文基于 Zypher 官方文档整理（Quick Start / Core Concepts），并补全工程化落地中最容易踩坑的地方。

---

## 1. Zypher 的最小心智模型

Zypher Agent 的核心模式是：

1) **创建运行上下文**（workspace / 执行环境）  
2) **选择一个 LLM Provider**（Anthropic / OpenAI 等）  
3) （可选）**注册 MCP Server**，把外部能力以 Tools 的形式提供给 Agent  
4) **runTask() 启动任务**，并通过**事件流**拿到执行过程与结果

官方 Quick Start 例子就是这个模式的最小实现。  
参考：Quick Start（https://zypher.corespeed.io/docs/quick-start）

---

## 2. 环境准备

### 2.1 必要依赖

- **Deno 2.0+**（官方 Quick Start 要求）  
- 一个模型 API Key（例：Anthropic Claude；也支持 OpenAI Provider）  
- 如果要演示爬虫能力：Firecrawl API Key（只是示例 MCP Server，可替换或不使用）

参考：Quick Start -> Prerequisites（https://zypher.corespeed.io/docs/quick-start）

### 2.2 安装依赖

在项目目录执行：

```bash
deno add jsr:@zypher/agent
deno add npm:rxjs-for-await
```

参考：Quick Start Step 1（https://zypher.corespeed.io/docs/quick-start）

### 2.3 配置环境变量

创建 `.env`（示例）：

```bash
ANTHROPIC_API_KEY=xxx
FIRECRAWL_API_KEY=yyy
```

参考：Quick Start Step 2（https://zypher.corespeed.io/docs/quick-start）

---

## 3. 第一个可运行 Agent（main.ts）

下面代码对应官方 Quick Start，并可直接跑通：

```ts
import {
  AnthropicModelProvider,
  createZypherContext,
  ZypherAgent,
} from "@zypher/agent";
import { eachValueFrom } from "rxjs-for-await";

function getRequiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Environment variable ${name} is not set`);
  return value;
}

// 1) 初始化执行上下文（workspace）
const zypherContext = await createZypherContext(Deno.cwd());

// 2) 选择 LLM Provider（这里用 Anthropic）
const agent = new ZypherAgent(
  zypherContext,
  new AnthropicModelProvider({
    apiKey: getRequiredEnv("ANTHROPIC_API_KEY"),
  }),
);

// 3) 可选：注册 MCP Server（示例：firecrawl-mcp）
await agent.mcp.registerServer({
  id: "firecrawl",
  type: "command",
  command: {
    command: "npx",
    args: ["-y", "firecrawl-mcp"],
    env: {
      FIRECRAWL_API_KEY: getRequiredEnv("FIRECRAWL_API_KEY"),
    },
  },
});

// 4) runTask：启动一次“任务执行”
const event$ = agent.runTask(
  "Find latest AI news",
  "claude-sonnet-4-20250514",
);

// 5) 订阅事件流（streaming）
for await (const event of eachValueFrom(event$)) {
  console.log(event);
}
```

参考：Quick Start Step 3（https://zypher.corespeed.io/docs/quick-start）

### 3.1 运行

```bash
deno run -A main.ts
```

参考：Quick Start Step 4（https://zypher.corespeed.io/docs/quick-start）

---

## 4. LLM Providers（如何切换 Claude / OpenAI / 本地 OpenAI 兼容）

Zypher 用统一接口封装不同模型服务（Provider 负责鉴权、请求/响应适配、能力暴露等）。  
参考：LLM Providers（https://zypher.corespeed.io/docs/core-concepts/llm-providers）

### 4.1 Anthropic Provider（Claude）

典型配置（文档示例）：

- `enablePromptCaching`：提示缓存（性能/费用优化）
- `thinkingBudget`：思考预算（更强推理）

参考：LLM Providers -> Anthropic（https://zypher.corespeed.io/docs/core-concepts/llm-providers）

### 4.2 OpenAI Provider（GPT / reasoning）

OpenAI Provider 支持 `reasoningEffort`（low/medium/high）等参数；并兼容 OpenAI Chat Completions API 的第三方（例如本地 Ollama 的 OpenAI 兼容端点）。  
参考：LLM Providers -> OpenAI（https://zypher.corespeed.io/docs/core-concepts/llm-providers）

---

## 5. Tools & MCP：让 Agent “能做事”

Zypher 的工具体系由 `agent.mcp`（`McpServerManager`）统一管理：  
- **Built-in tools（内建工具）**  
- **External MCP servers（外部 MCP Server 提供的 tools）**

参考：Tools & MCP Integration（https://zypher.corespeed.io/docs/core-concepts/tools-and-mcp）

### 5.1 内建工具（Built-in Tools）

内建工具覆盖：
- File system：`read_file`, `edit_file`, `list_directory`, `file_search`, `copy_file`, `delete_file`…
- Terminal：`run_terminal_cmd`
- Search：`grep_search`
- Image tools（可选）

参考：Built-in Tools（https://zypher.corespeed.io/docs/core-concepts/tools-and-mcp/built-in-tools）

> 工程建议：MVP 先只开“只读工具”（read/list/search），把写入/删除/执行命令放到“需要人工批准”的路径里。

### 5.2 MCP 是什么？Zypher 在里面扮演什么角色？

- Zypher Agent 作为 **MCP Client**  
- 你注册的 MCP Server 作为 **插件/扩展能力**  
- MCP Server 再去调用外部系统（API/DB/邮箱/爬虫等）

参考：Tools & MCP Integration -> MCP（https://zypher.corespeed.io/docs/core-concepts/tools-and-mcp）

### 5.3 注册 MCP Server（命令启动 / 远程）

文档提供三类：
- `type: "command"`：本地进程（最常见）
- `type: "remote"`：远程 HTTP/SSE
- 本地脚本（Deno/Node）也可以作为 command server 启动

参考：Tools & MCP Integration -> Registering MCP Servers（https://zypher.corespeed.io/docs/core-concepts/tools-and-mcp）

---

## 6. Loop Interceptors：控制 Agent 执行（强烈建议了解）

Zypher 的 Agent Loop 是 “思考 →（可调用工具）→ 观察结果 → 继续/结束” 的循环。  
Interceptors 是“每轮循环后”的**控制闸门**：可检测问题、注入反馈、决定继续还是结束。  
参考：Loop Interceptors（https://zypher.corespeed.io/docs/core-concepts/loop-interceptors）

### 6.1 内置 Interceptors（常用）

- `MaxTokensInterceptor`：response 被 token 截断时自动继续  
- `ErrorDetectionInterceptor`：用 detector 检测 TypeScript / ESLint / 测试失败等  
- `ToolExecutionInterceptor`：执行 LLM 请求的 tool calls，并支持“审批回调”（human-in-the-loop）

参考：Built-in Interceptors（https://zypher.corespeed.io/docs/core-concepts/loop-interceptors/built-in-interceptors）

> 工程建议：你做邮件 Agent 时，**发邮件**一定要走审批；只读搜索可以自动批准。

---

## 7. Git-based Checkpoints：文件与会话回滚

Zypher 带有 Git checkpoint 系统，默认会在每次 task 前创建 checkpoint，用于回滚：
- 工作目录文件（`Deno.cwd()` 下）
- 会话历史

但 **不会**回滚外部系统（数据库、API、远程文件等）。  
参考：Git-based Checkpoints（https://zypher.corespeed.io/docs/core-concepts/checkpoints）

---

## 8. Programmatic Tool Calling（PTC）：降低 token/成本的大招

当任务需要大量工具调用 / 大量中间数据（比如遍历 5000 封邮件做过滤聚合），传统“每次 tool result 都塞回上下文”会炸 token。

PTC 让 LLM 生成 TypeScript，在**隔离的 Deno Worker**里跑循环与聚合，并只把最终摘要返回给 LLM。  
参考：Programmatic Tool Calling（https://zypher.corespeed.io/docs/core-concepts/tools-and-mcp/programmatic-tool-calling）

---

## 9. 快速落地 MVP：推荐架构（适配你的“本地邮件 Agent”）

你要做的是浏览器端 + 本地服务端 + Agent 内核：

```
Browser UI (React/Next/Vite)
   |
   |  HTTP/WebSocket/SSE
   v
Local Backend (Deno)
   |
   |  Zypher Agent (runTask / event stream)
   |
   |-- SQLite（邮件缓存/索引）
   |-- MCP server（可选：把“邮件查询/发送”等封装成工具）
```

### MVP 取舍建议

- **第一版别急着上 MCP**：直接在 Deno 后端里写 tool（或直接写 service），让 Agent 调用内建 tools + 你自定义 tools 即可  
- 第二版再拆分 MCP Server：当你需要“多 Agent 复用工具 / 安全隔离 / 插件化生态”时

（理由来自 Tools & MCP 的设计目标：统一管理 built-in 与 external tools。）

---

## 10. 下一步你应该做什么（按落地优先级）

1) 跑通 Quick Start（确认 Provider + runTask + streaming）  
2) 做一个“本地后端 API”：`POST /tasks`，返回 SSE event stream 给前端  
3) 加 SQLite：存邮件、线程、标签、向量/关键词索引（MVP 用关键词即可）  
4) 加 tool approval：发邮件/删除邮件必须二次确认  
5) 再考虑 MCP Server：把 Gmail/Outlook/QQ 的连接与操作标准化成 tools

---

## 11. 参考链接（官方）

- Quick Start：https://zypher.corespeed.io/docs/quick-start  
- Introduction：https://zypher.corespeed.io/docs  
- LLM Providers：https://zypher.corespeed.io/docs/core-concepts/llm-providers  
- Tools & MCP：https://zypher.corespeed.io/docs/core-concepts/tools-and-mcp  
- Built-in Tools：https://zypher.corespeed.io/docs/core-concepts/tools-and-mcp/built-in-tools  
- Programmatic Tool Calling：https://zypher.corespeed.io/docs/core-concepts/tools-and-mcp/programmatic-tool-calling  
- Loop Interceptors：https://zypher.corespeed.io/docs/core-concepts/loop-interceptors  
- Built-in Interceptors：https://zypher.corespeed.io/docs/core-concepts/loop-interceptors/built-in-interceptors  
- Checkpoints：https://zypher.corespeed.io/docs/core-concepts/checkpoints  
- Examples：https://zypher.corespeed.io/docs/examples  
- zypher-examples repo：https://github.com/corespeed-io/zypher-examples

