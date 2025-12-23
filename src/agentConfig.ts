import fs from 'node:fs'
import path from 'node:path'

export type McpCommandConfig = {
  command: string
  args?: string[]
  env?: Record<string, string>
}

export type McpServerConfig = {
  id: string
  type: 'command' | 'remote'
  command?: McpCommandConfig
  url?: string
}

export type AgentConfig = {
  provider: 'openai'
  apiKey?: string
  baseUrl?: string
  model?: string
  systemPrompt?: string
  primaryEmail?: string
  priorityAnalysisPrompt?: string
  mcpServers?: McpServerConfig[]
}

const DEFAULT_CONFIG: AgentConfig = {
  provider: 'openai',
  model: 'gemini-3',
  baseUrl: '',
  apiKey: '',
  systemPrompt: '',
  primaryEmail: '',
  priorityAnalysisPrompt: '',
  mcpServers: [],
}

export const AGENT_CONFIG_PATH = path.join(process.cwd(), 'agent-config.json')

export function readAgentConfig(): AgentConfig {
  if (!fs.existsSync(AGENT_CONFIG_PATH)) {
    return { ...DEFAULT_CONFIG }
  }
  try {
    const raw = fs.readFileSync(AGENT_CONFIG_PATH, 'utf8')
    const parsed = JSON.parse(raw) as Partial<AgentConfig>
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      mcpServers: Array.isArray(parsed.mcpServers) ? parsed.mcpServers : DEFAULT_CONFIG.mcpServers,
    }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

export function saveAgentConfig(next: AgentConfig) {
  const payload: AgentConfig = {
    ...DEFAULT_CONFIG,
    ...next,
    mcpServers: Array.isArray(next.mcpServers) ? next.mcpServers : DEFAULT_CONFIG.mcpServers,
  }
  fs.writeFileSync(AGENT_CONFIG_PATH, JSON.stringify(payload, null, 2))
  return payload
}

export function maskApiKey(apiKey?: string): string | null {
  if (!apiKey) return null
  if (apiKey.length <= 6) return '******'
  return `${apiKey.slice(0, 3)}***${apiKey.slice(-3)}`
}
