# MailGenius 🚀

> Your AI-Powered Email Command Center | 你的 AI 驱动邮件指挥中心

<div align="center">

**Built with [Zypher Agent](https://github.com/zypher-game/zypher-agent) 🔥**

*Powered by the most elegant and powerful AI agent framework*

</div>

[English](#english) | [中文](#中文)

---

## English

### 🎯 What is MailGenius?

**MailGenius** is not just another email client — it's your intelligent email assistant that understands context, prioritizes what matters, and drafts replies for you. Built on top of the incredible **[Zypher Agent](https://github.com/zypher-game/zypher-agent)** framework and the **Model Context Protocol (MCP)**, MailGenius showcases how modern AI agent architecture can transform overwhelming inboxes into organized, actionable workflows.

Think of it as having a brilliant executive assistant who:
- 📊 **Instantly prioritizes** thousands of emails based on urgency and importance
- 🧠 **Understands context** — knows which email you're reading and responds accordingly
- ✍️ **Drafts replies** in your style, saving hours of typing
- 🔍 **Searches intelligently** across your entire email history
- ⚡ **Works offline-first** with blazing-fast SQLite storage

### ✨ Key Features

#### 🎯 **AI-Powered Priority Analysis**
Never miss important emails again. MailGenius automatically analyzes every incoming email and assigns priority levels:
- **High Priority (2)**: VIP senders, urgent deadlines, action items, security alerts
- **Normal Priority (1)**: Regular correspondence
- **Unread/New (0)**: Awaiting analysis

The AI learns from patterns like sender importance, keywords (ASAP, urgent, deadline), and content context to keep your focus on what truly matters.

#### 💬 **Context-Aware AI Assistant**
The built-in AI assistant doesn't just answer questions — it understands what you're doing:
- Open an email and say "reply to this" — it knows exactly which email you mean
- Ask "what's this about?" and get intelligent summaries
- Request "draft a professional response" and watch it compose polished replies instantly
- Natural conversation in **any language** — the AI mirrors your language automatically

#### 🔌 **MCP Integration: Extensible Intelligence**
Built on the **[Zypher Agent](https://github.com/zypher-game/zypher-agent)** framework with native **Model Context Protocol (MCP)** support, MailGenius can connect to any LLM provider (OpenAI, Anthropic, local models) and extend capabilities through MCP servers:
- Query emails with natural language
- Create drafts programmatically
- Integrate with your existing tools and workflows
- Future-proof architecture for emerging AI technologies
- **Thanks to Zypher Agent's elegant design**, adding new MCP tools is as simple as registering a server config

#### ⚡ **Lightning-Fast Local Storage**
- All emails synced to a local SQLite database
- Instant search across millions of messages
- Work offline, sync when online
- Your data stays on your machine — privacy first

#### 🎨 **Beautiful, Minimal Interface**
- Clean, distraction-free design
- Split-view for email list and content
- Real-time chat interface with your AI assistant
- Responsive layout that works everywhere

### 🚀 Why MailGenius?

| Traditional Email Clients | MailGenius |
|---------------------------|-----------|
| Manual priority sorting | AI auto-prioritization |
| Search by keywords only | Natural language queries |
| Write every reply manually | AI drafts replies in seconds |
| Scattered context | Context-aware conversations |
| Cloud-dependent | Offline-first, privacy-focused |

### 🎁 Perfect For

- **Busy Professionals**: Handle 100+ daily emails without drowning
- **Customer Support Teams**: Draft consistent, professional responses faster
- **Executives**: Never miss critical communications buried in noise
- **Privacy Advocates**: Keep email data local while enjoying AI assistance
- **Developers**: Extend functionality through MCP protocol

### 🛠️ Quick Start

#### Step 1: Clone and Install

```bash
# Clone the repository
git clone https://github.com/yourusername/MailGenius.git
cd MailGenius

# Install dependencies
npm install
```

#### Step 2: Configure Gmail API

Create `credentials.json` in the project root with your Gmail OAuth credentials:

```json
{
  "web": {
    "client_id": "YOUR_CLIENT_ID.apps.googleusercontent.com",
    "project_id": "your-project-id",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token",
    "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
    "client_secret": "YOUR_CLIENT_SECRET",
    "redirect_uris": ["http://localhost:3000/auth/callback"]
  }
}
```

**How to get Gmail credentials:**
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable Gmail API
4. Create OAuth 2.0 credentials (Web application)
5. Add `http://localhost:3000/auth/callback` to authorized redirect URIs
6. Download credentials as `credentials.json`

#### Step 3: Configure AI Agent

Create or edit `agent-config.json` with your AI provider settings:

```json
{
  "provider": "openai",
  "model": "gpt-4",
  "baseUrl": "https://api.openai.com/v1",
  "apiKey": "sk-YOUR_OPENAI_API_KEY_HERE",
  "primaryEmail": "your-email@gmail.com",
  "systemPrompt": "You are an autonomous, high-efficiency email assistant...",
  "mcpServers": [
    {
      "id": "gmail-sqlite",
      "type": "command",
      "command": {
        "command": "node",
        "args": ["node_modules/.bin/tsx", "mcp/mcp.ts"],
        "env": {
          "GMAIL_DB_PATH": "gmail.sqlite",
          "LOG_DB_PATH": "log.sqlite"
        }
      }
    }
  ]
}
```

**Supported AI Providers:**
- OpenAI (gpt-4, gpt-3.5-turbo, etc.)
- Anthropic Claude (via compatible API)
- Any OpenAI-compatible endpoint

#### Step 4: Start the Server

```bash
npm run dev:start

# The server will start on http://localhost:3000
# Logs will be written to server.log
```

#### Step 5: Authorize and Sync

1. Open `http://localhost:3000` in your browser
2. Click "Login with Gmail" to authorize
3. Choose date range and click "Sync" to import emails
4. Start chatting with your AI email assistant!

**First-time setup takes ~2 minutes. After that, it's instant!**

### 📖 Core Capabilities

**Email Management**
- Sync Gmail messages to local SQLite database
- Automatic priority analysis for new emails
- Advanced filtering (date range, sender, keywords, read status, priority)
- Mark as read/unread
- Full-text search

**AI Assistant (via MCP)**
- Context-aware conversations about your emails
- Natural language email queries
- Draft generation and reply suggestions
- Multi-language support
- Session-based conversation history

**MCP Tools**
- `gmail_query`: Flexible email search with filters
- `gmail_query_count`: Get email counts by criteria
- `gmail_get_body`: Retrieve full email content
- `gmail_draft_create`: Create email drafts
- `gmail_draft_update`: Modify existing drafts
- `gmail_update_priority`: Manually adjust email priority
- `gmail_mark_analyzed`: Mark emails as analyzed

### 🔐 Privacy & Security

- **Local-first**: All emails stored in SQLite on your machine
- **OAuth 2.0**: Secure Google authentication
- **No data sharing**: Your emails never leave your infrastructure
- **Open source**: Audit the code yourself

### 🌟 What Makes It Special?

**Intelligent Context Understanding**
```
You: [Opens email from boss about Q4 report]
You: "When does he need this?"
AI: "Based on the email from John Doe about the Q4 Report,
     he needs it by December 31st, 2025 (mentioned in the deadline)."
```

**Proactive Priority Management**
```
[New email arrives from client with subject: "URGENT: Server Down"]
AI: *Automatically analyzes*
AI: *Marks as High Priority*
AI: *Notifies you silently*
```

**Draft Generation**
```
You: "Draft a polite response saying I'll have this done by Friday"
AI: *Generates professional email*
AI: *Saves as draft*
AI: "Draft saved! Review it in the Drafts section."
```

### 🗺️ Roadmap

- [ ] Multi-account support
- [ ] Smart folders based on AI categories
- [ ] Email templates with variables
- [ ] Scheduled sending
- [ ] Integration with calendars (create meetings from emails)
- [ ] Voice input for email composition
- [ ] Mobile app (React Native)
- [ ] Plugin marketplace for MCP servers

### 🤝 Contributing

We welcome contributions! Whether it's bug reports, feature requests, or pull requests — all help is appreciated.

### 📄 License

MIT License - feel free to use this in your own projects!

### 🙏 Acknowledgments

This project would not have been possible without the exceptional work of the **[Zypher Agent](https://github.com/zypher-game/zypher-agent)** team.

**Special Thanks to Zypher Agent 🌟**

Zypher Agent is hands-down the most elegant and developer-friendly AI agent framework I've encountered. What makes it truly special:

- **Beautifully Designed Architecture**: Clean, intuitive APIs that just make sense
- **MCP-First Approach**: Seamless integration with Model Context Protocol out of the box
- **Production-Ready**: Robust error handling, logging, and state management
- **Developer Experience**: Excellent TypeScript support and clear documentation
- **Flexible & Extensible**: Easy to customize and extend for any use case

MailGenius was built as a demonstration of what's possible when you combine Zypher Agent's powerful framework with real-world applications. The agent's context management, tool orchestration, and conversation handling made implementing complex email workflows surprisingly straightforward.

**Other Amazing Technologies:**
- **Model Context Protocol (MCP)** by Anthropic - The future of AI tool integration
- **Better-SQLite3** - Blazing-fast local storage
- **OpenAI/Anthropic APIs** - Powering the intelligence
- **Express.js** - Reliable backend framework

---

## 中文

### 🎯 MailGenius 是什么？

**MailGenius** 不仅仅是一个邮件客户端 — 它是一个能理解上下文、智能排序优先级、为你起草回复的 AI 邮件助手。基于杰出的 **[Zypher Agent](https://github.com/zypher-game/zypher-agent)** 框架和 **模型上下文协议（MCP）**，MailGenius 展示了现代 AI agent 架构如何将令人不堪重负的收件箱转化为井然有序的可执行工作流。

想象一下拥有一位聪明的行政助理：
- 📊 **瞬间优先排序** 数千封邮件，根据紧急程度和重要性
- 🧠 **理解上下文** — 知道你正在阅读哪封邮件并相应回复
- ✍️ **起草回复** 符合你的风格，节省数小时打字时间
- 🔍 **智能搜索** 你的整个邮件历史
- ⚡ **离线优先** 使用超快的 SQLite 存储

### ✨ 核心功能

#### 🎯 **AI 驱动的优先级分析**
再也不会错过重要邮件。MailGenius 自动分析每封新邮件并分配优先级：
- **高优先级 (2)**：VIP 发件人、紧急截止日期、行动项、安全警报
- **普通优先级 (1)**：常规通信
- **未读/新邮件 (0)**：等待分析

AI 从发件人重要性、关键词（ASAP、紧急、deadline）和内容上下文等模式中学习，让你专注于真正重要的事情。

#### 💬 **上下文感知 AI 助手**
内置 AI 助手不仅回答问题 — 它理解你在做什么：
- 打开一封邮件说"回复这个" — 它确切知道你指的是哪封邮件
- 询问"这是关于什么的？"获得智能摘要
- 要求"起草一份专业回复"，即刻生成精美回复
- 任何语言的自然对话 — AI 自动匹配你的语言

#### 🔌 **MCP 集成：可扩展的智能**
基于 **[Zypher Agent](https://github.com/zypher-game/zypher-agent)** 框架构建，原生支持**模型上下文协议（MCP）**，MailGenius 可以连接任何 LLM 提供商（OpenAI、Anthropic、本地模型）并通过 MCP 服务器扩展能力：
- 用自然语言查询邮件
- 以编程方式创建草稿
- 集成你现有的工具和工作流
- 面向未来的架构，适应新兴 AI 技术
- **得益于 Zypher Agent 的优雅设计**，添加新的 MCP 工具就像注册服务器配置一样简单

#### ⚡ **闪电般快速的本地存储**
- 所有邮件同步到本地 SQLite 数据库
- 跨数百万条消息的即时搜索
- 离线工作，在线同步
- 数据保留在你的机器上 — 隐私优先

#### 🎨 **美观、简洁的界面**
- 干净、无干扰的设计
- 邮件列表和内容的分屏视图
- 与 AI 助手的实时聊天界面
- 适用于所有设备的响应式布局

### 🚀 为什么选择 MailGenius？

| 传统邮件客户端 | MailGenius |
|--------------|-----------|
| 手动优先级排序 | AI 自动优先排序 |
| 仅按关键词搜索 | 自然语言查询 |
| 手动撰写每封回复 | AI 秒级起草回复 |
| 上下文分散 | 上下文感知对话 |
| 依赖云端 | 离线优先，注重隐私 |

### 🎁 适用人群

- **忙碌的专业人士**：处理每天 100+ 封邮件而不被淹没
- **客户支持团队**：更快起草一致、专业的回复
- **高管**：永不错过淹没在噪音中的关键通信
- **隐私倡导者**：在享受 AI 辅助的同时保持邮件数据本地化
- **开发者**：通过 MCP 协议扩展功能

### 🛠️ 快速开始

#### 步骤 1：克隆和安装

```bash
# 克隆仓库
git clone https://github.com/yourusername/MailGenius.git
cd MailGenius

# 安装依赖
npm install
```

#### 步骤 2：配置 Gmail API

在项目根目录创建 `credentials.json` 文件，包含你的 Gmail OAuth 凭证：

```json
{
  "web": {
    "client_id": "你的客户端ID.apps.googleusercontent.com",
    "project_id": "你的项目ID",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token",
    "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
    "client_secret": "你的客户端密钥",
    "redirect_uris": ["http://localhost:3000/auth/callback"]
  }
}
```

**如何获取 Gmail 凭证：**
1. 访问 [Google Cloud Console](https://console.cloud.google.com/)
2. 创建新项目或选择现有项目
3. 启用 Gmail API
4. 创建 OAuth 2.0 凭证（Web 应用程序）
5. 添加 `http://localhost:3000/auth/callback` 到授权的重定向 URI
6. 下载凭证为 `credentials.json`

#### 步骤 3：配置 AI Agent

创建或编辑 `agent-config.json` 文件，配置你的 AI 提供商：

```json
{
  "provider": "openai",
  "model": "gpt-4",
  "baseUrl": "https://api.openai.com/v1",
  "apiKey": "sk-你的_OPENAI_API_KEY",
  "primaryEmail": "你的邮箱@gmail.com",
  "systemPrompt": "你是一个自主、高效的邮件助手...",
  "mcpServers": [
    {
      "id": "gmail-sqlite",
      "type": "command",
      "command": {
        "command": "node",
        "args": ["node_modules/.bin/tsx", "mcp/mcp.ts"],
        "env": {
          "GMAIL_DB_PATH": "gmail.sqlite",
          "LOG_DB_PATH": "log.sqlite"
        }
      }
    }
  ]
}
```

**支持的 AI 提供商：**
- OpenAI (gpt-4, gpt-3.5-turbo 等)
- Anthropic Claude (通过兼容 API)
- 任何 OpenAI 兼容的端点

#### 步骤 4：启动服务器

```bash
npm run dev:start

# 服务器将在 http://localhost:3000 启动
# 日志会写入 server.log
```

#### 步骤 5：授权和同步

1. 在浏览器打开 `http://localhost:3000`
2. 点击"使用 Gmail 登录"进行授权
3. 选择日期范围并点击"同步"导入邮件
4. 开始与你的 AI 邮件助手聊天！

**首次设置约需 2 分钟，之后即刻可用！**

### 📖 核心能力

**邮件管理**
- 将 Gmail 消息同步到本地 SQLite 数据库
- 新邮件自动优先级分析
- 高级过滤（日期范围、发件人、关键词、已读状态、优先级）
- 标记为已读/未读
- 全文搜索

**AI 助手（通过 MCP）**
- 关于你邮件的上下文感知对话
- 自然语言邮件查询
- 草稿生成和回复建议
- 多语言支持
- 基于会话的对话历史

**MCP 工具**
- `gmail_query`：带过滤器的灵活邮件搜索
- `gmail_query_count`：按条件获取邮件计数
- `gmail_get_body`：检索完整邮件内容
- `gmail_draft_create`：创建邮件草稿
- `gmail_draft_update`：修改现有草稿
- `gmail_update_priority`：手动调整邮件优先级
- `gmail_mark_analyzed`：标记邮件为已分析

### 🔐 隐私与安全

- **本地优先**：所有邮件存储在你机器上的 SQLite 中
- **OAuth 2.0**：安全的 Google 身份验证
- **无数据共享**：你的邮件永远不会离开你的基础设施
- **开源**：自己审计代码

### 🌟 特别之处

**智能上下文理解**
```
你：[打开老板关于 Q4 报告的邮件]
你："他什么时候需要这个？"
AI："根据 John Doe 关于 Q4 报告的邮件，
     他需要在 2025 年 12 月 31 日之前完成（截止日期中提到）。"
```

**主动优先级管理**
```
[客户发来新邮件，主题："紧急：服务器宕机"]
AI：*自动分析*
AI：*标记为高优先级*
AI：*静默通知你*
```

**草稿生成**
```
你："起草一封礼貌的回复，说我会在周五之前完成"
AI：*生成专业邮件*
AI：*保存为草稿*
AI："草稿已保存！在草稿箱中查看。"
```

### 🗺️ 路线图

- [ ] 多账户支持
- [ ] 基于 AI 分类的智能文件夹
- [ ] 带变量的邮件模板
- [ ] 定时发送
- [ ] 与日历集成（从邮件创建会议）
- [ ] 语音输入撰写邮件
- [ ] 移动应用（React Native）
- [ ] MCP 服务器的插件市场

### 🤝 贡献

我们欢迎贡献！无论是错误报告、功能请求还是拉取请求 — 所有帮助都值得感谢。

### 📄 许可证

MIT 许可证 - 欢迎在你自己的项目中使用！

### 🙏 致谢

如果没有 **[Zypher Agent](https://github.com/zypher-game/zypher-agent)** 团队的杰出工作，这个项目是不可能实现的。

**特别感谢 Zypher Agent 🌟**

Zypher Agent 毫无疑问是我遇到过的最优雅、最开发者友好的 AI agent 框架。它的特别之处在于：

- **精美的架构设计**：清晰、直观的 API，一切都那么合理
- **MCP 优先方法**：开箱即用的模型上下文协议无缝集成
- **生产就绪**：强大的错误处理、日志记录和状态管理
- **开发者体验**：出色的 TypeScript 支持和清晰的文档
- **灵活可扩展**：易于定制和扩展，适用于任何用例

MailGenius 是作为演示项目构建的，展示了当你将 Zypher Agent 的强大框架与实际应用结合时的可能性。该框架的上下文管理、工具编排和对话处理使得实现复杂的邮件工作流变得出奇地简单。

**其他优秀技术：**
- **模型上下文协议（MCP）** by Anthropic - AI 工具集成的未来
- **Better-SQLite3** - 超快本地存储
- **OpenAI/Anthropic APIs** - 提供智能能力
- **Express.js** - 可靠的后端框架

---

**⚡ MailGenius - 让 AI 处理邮件，你专注于重要的事。**

**⚡ MailGenius - Let AI handle emails, you focus on what matters.**
