import { OpenAIModelProvider, ZypherAgent, createZypherContext } from 'jsr:@zypher/agent'
import {
  appendChatMessage,
  createChatSession,
  ensureChatSession,
  getChatMessages,
  listChatSessions,
  updateChatSessionTitleIfEmpty,
} from './chatDb.ts'
import { logInteraction } from './logDb.ts'

type McpCommandConfig = {
  command: string
  args?: string[]
  env?: Record<string, string>
}

type McpServerConfig = {
  id: string
  type: 'command' | 'remote'
  command?: McpCommandConfig
  url?: string
}

type AgentConfig = {
  provider: 'openai'
  apiKey?: string
  baseUrl?: string
  model?: string
  mcpServers?: McpServerConfig[]
}

function getArg(name: string) {
  const idx = Deno.args.indexOf(name)
  if (idx === -1) return undefined
  return Deno.args[idx + 1]
}

async function readStdin(): Promise<string> {
  const res = new Response(Deno.stdin.readable)
  const text = await res.text()
  return text.trim()
}

async function* readLines() {
  const reader = Deno.stdin.readable.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += value
    let index = buffer.indexOf('\n')
    while (index !== -1) {
      let line = buffer.slice(0, index)
      if (line.endsWith('\r')) {
        line = line.slice(0, -1)
      }
      yield line
      buffer = buffer.slice(index + 1)
      index = buffer.indexOf('\n')
    }
  }

  if (buffer.length > 0) {
    yield buffer
  }
}

const MAX_HISTORY_MESSAGES = 20
const MAX_HISTORY_CHARS = 6000

function buildHistoryText(messages: Array<{ role: string; content: string }>) {
  const parts: string[] = []
  let total = 0
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i]
    const label = msg.role === 'assistant' ? 'Assistant' : 'User'
    const line = `${label}: ${msg.content}`
    total += line.length
    parts.push(line)
    if (parts.length >= MAX_HISTORY_MESSAGES || total >= MAX_HISTORY_CHARS) {
      break
    }
  }
  return parts.reverse().join('\n')
}

function resolveSessionId(sessionArg: string | undefined, forceNew: boolean) {
  if (sessionArg) {
    ensureChatSession(sessionArg)
    return sessionArg
  }
  if (forceNew) {
    return createChatSession()
  }
  const latest = listChatSessions(1)
  if (latest.length > 0) {
    return latest[0].id
  }
  return createChatSession()
}

function requireValue(value: string | undefined, label: string): string {
  if (!value) {
    throw new Error(`${label} is required`)
  }
  return value
}

function normalizeEnv(env?: Record<string, string>) {
  if (!env) return undefined
  const entries = Object.entries(env).filter(([, value]) => value !== '')
  if (entries.length === 0) return undefined
  return Object.fromEntries(entries)
}

async function loadConfig(path: string): Promise<AgentConfig> {
  const raw = await Deno.readTextFile(path)
  return JSON.parse(raw) as AgentConfig
}

function normalizeSystemPrompt(value: string | undefined) {
  if (!value) return ''
  const trimmed = value.trim()
  return trimmed ? trimmed : ''
}

async function main() {
  const configPath = getArg('--config') ?? Deno.env.get('ZYPHER_CONFIG_PATH')
  const config = await loadConfig(requireValue(configPath, 'config path'))

  const model = getArg('--model') ?? config.model
  const systemPrompt = normalizeSystemPrompt(config.systemPrompt)
  const primaryEmail = typeof config.primaryEmail === 'string' ? config.primaryEmail.trim() : ''
  const apiKey = requireValue(config.apiKey, 'apiKey')

  const zypherContext = await createZypherContext(Deno.cwd())

  const provider = new OpenAIModelProvider({
    apiKey,
    baseUrl: config.baseUrl || undefined,
  })

  const isRepl = Deno.args.includes('--repl')
  const sessionArg = getArg('--session')
  const forceNewSession = Deno.args.includes('--new-session')
  const sessionId = resolveSessionId(sessionArg, forceNewSession)

  console.log(
    JSON.stringify({
      type: 'ready',
      model: requireValue(model, 'model'),
      baseUrl: config.baseUrl ?? null,
      mcpServers: Array.isArray(config.mcpServers) ? config.mcpServers.length : 0,
      mode: isRepl ? 'repl' : 'single',
      sessionId,
    }),
  )

  const agent = new ZypherAgent(zypherContext, provider)

  if (Array.isArray(config.mcpServers)) {
    for (const server of config.mcpServers) {
      if (server.type === 'command' && server.command) {
        const env = normalizeEnv(server.command.env)
        await agent.mcp.registerServer({
          id: server.id,
          type: 'command',
          command: {
            command: server.command.command,
            args: server.command.args ?? [],
            env: env ?? {},
          },
        })
      } else if (server.type === 'remote' && server.url) {
        await agent.mcp.registerServer({
          id: server.id,
          type: 'remote',
          url: server.url,
        })
      }
    }
  }

  const runPrompt = async (prompt: string) => {
    const history = getChatMessages(sessionId, 200)
    const historyText = buildHistoryText(history)
    const withHistory = historyText
      ? `Conversation so far:\n${historyText}\n\nUser: ${prompt}\nAssistant:`
      : prompt
    const systemWithEmail = primaryEmail
      ? systemPrompt.includes('{{primary_email}}')
        ? systemPrompt.replace(/{{primary_email}}/g, primaryEmail)
        : `${systemPrompt}\n\nPrimary account email: ${primaryEmail}`
      : systemPrompt
    const fullPrompt = systemWithEmail ? `${systemWithEmail}\n\n${withHistory}` : withHistory

    appendChatMessage(sessionId, 'user', prompt)
    updateChatSessionTitleIfEmpty(sessionId, prompt.slice(0, 80))

    logInteraction(
      'agent/zypher_runner.ts',
      `agent run start model=${model} session=${sessionId} promptLength=${prompt.length} systemPrompt=${Boolean(systemPrompt)}`,
    )
    const event$ = agent.runTask(fullPrompt, requireValue(model, 'model'))
    const iterable = isAsyncIterable(event$) ? event$ : toAsyncIterable(event$)
    let assistantText = ''
    for await (const event of iterable) {
      if (event?.type === 'tool_use') {
        if (!event?.toolUseId || event.toolUseId === 'fallback_undefined') {
          logInteraction(
            'agent/zypher_runner.ts',
            `agent tool_use missing id name=${event.toolName ?? 'unknown'}`,
          )
        }
        logInteraction(
          'agent/zypher_runner.ts',
          `agent tool_use name=${event.toolName ?? 'unknown'}`,
        )
      } else if (event?.type === 'tool_use_input') {
        if (!event?.toolUseId || event.toolUseId === 'fallback_undefined') {
          logInteraction(
            'agent/zypher_runner.ts',
            `agent tool_use_input missing id name=${event.toolName ?? 'unknown'}`,
          )
        }
        logInteraction(
          'agent/zypher_runner.ts',
          `agent tool_use_input name=${event.toolName ?? 'unknown'} input=${event.partialInput ?? ''}`,
        )
      } else if (event?.type === 'tool_result') {
        const content = Array.isArray(event.content) ? JSON.stringify(event.content) : ''
        const trimmed = content.length > 2000 ? `${content.slice(0, 2000)}...` : content
        logInteraction(
          'agent/zypher_runner.ts',
          `agent tool_result name=${event.toolName ?? 'unknown'} ${trimmed}`,
        )
      } else if (event?.type === 'text' && typeof event.content === 'string') {
        assistantText += event.content
      } else if (event?.type === 'message' && event.message?.role === 'assistant') {
        const text = Array.isArray(event.message.content)
          ? event.message.content.map((part: any) => part?.text ?? '').join(' ')
          : ''
        if (text) {
          const trimmed = text.length > 2000 ? `${text.slice(0, 2000)}...` : text
          logInteraction('agent/zypher_runner.ts', `agent message ${trimmed}`)
          assistantText = text
        }
      } else if (event?.type === 'completed') {
        logInteraction('agent/zypher_runner.ts', 'agent run completed')
      }
      console.log(JSON.stringify({ type: 'event', event }))
    }
    if (assistantText.trim()) {
      appendChatMessage(sessionId, 'assistant', assistantText.trim())
    }
  }

  if (isRepl) {
    for await (const line of readLines()) {
      const prompt = line.trim()
      if (!prompt) continue
      if (prompt === 'exit' || prompt === 'quit') break
      await runPrompt(prompt)
    }
    return
  }

  const prompt = await readStdin()
  requireValue(prompt, 'prompt')
  await runPrompt(prompt)
}

main().catch((err) => {
  console.log(JSON.stringify({ type: 'error', error: err?.message ?? String(err) }))
  Deno.exit(1)
})

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return Boolean(value && typeof (value as AsyncIterable<unknown>)[Symbol.asyncIterator] === 'function')
}

function toAsyncIterable(observable: { subscribe: (arg: unknown) => { unsubscribe: () => void } }) {
  const queue: Array<unknown> = []
  let resolve: ((value: IteratorResult<unknown>) => void) | null = null
  let finished = false
  let error: Error | null = null

  const subscription = observable.subscribe({
    next: (value: unknown) => {
      if (resolve) {
        resolve({ value, done: false })
        resolve = null
      } else {
        queue.push(value)
      }
    },
    error: (err: Error) => {
      error = err
      finished = true
      if (resolve) {
        resolve(Promise.reject(err) as unknown as IteratorResult<unknown>)
      }
    },
    complete: () => {
      finished = true
      if (resolve) {
        resolve({ value: undefined, done: true })
      }
    },
  })

  return {
    [Symbol.asyncIterator]() {
      return {
        next() {
          if (error) {
            return Promise.reject(error)
          }
          if (queue.length > 0) {
            return Promise.resolve({ value: queue.shift(), done: false })
          }
          if (finished) {
            subscription.unsubscribe()
            return Promise.resolve({ value: undefined, done: true })
          }
          return new Promise((res) => {
            resolve = res
          })
        },
        return() {
          subscription.unsubscribe()
          return Promise.resolve({ value: undefined, done: true })
        },
      }
    },
  }
}
