#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compact } from './compact.js';
import { JevClient } from './client.js';
import { normalizeAgentMessages } from './agent.js';
import type { CompactOptions } from './types.js';

const TOOL_NAME = 'compact_transcript';
const PROTOCOL_VERSION = '2024-11-05';
const DEFAULT_TIMEOUT_MS = 60_000;
type JsonRpcRequest = { jsonrpc?: string; id?: string | number; method?: string; params?: Record<string, unknown> };
type ToolArguments = { messages?: unknown; options?: CompactOptions; model?: string };

function serverVersion(): string {
  try {
    const path = fileURLToPath(new URL('../package.json', import.meta.url));
    return (JSON.parse(readFileSync(path, 'utf8')) as { version: string }).version;
  } catch { return 'unknown'; }
}

function timeoutMs(): number {
  const value = Number(process.env.TYPESAFE_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_TIMEOUT_MS;
}


function send(message: unknown): void { process.stdout.write(`${JSON.stringify(message)}\n`); }
function result(id: string | number | undefined, value: unknown): void { send({ jsonrpc: '2.0', id, result: value }); }
function error(id: string | number | null | undefined, code: number, message: string): void { send({ jsonrpc: '2.0', id, error: { code, message } }); }

function validateOptions(options: unknown): void {
  if (options === undefined) return;
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new Error('Invalid options');
  for (const [key, value] of Object.entries(options)) {
    if (key === 'goal') { if (typeof value !== 'string') throw new Error('Invalid goal'); continue; }
    if (!['keepThreshold', 'preserveRecentMessages', 'maxStateTokens', 'maxRequestTokens', 'truncateHeadChars'].includes(key)) throw new Error('Unknown option: ' + key);
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error('Invalid ' + key);
    if (key === 'keepThreshold') { if (value > 1) throw new Error('Invalid keepThreshold'); }
    else if (!Number.isInteger(value) || (key.startsWith('max') && value === 0)) throw new Error('Invalid ' + key);
  }
}

function schema(): Record<string, unknown> {
  return {
    type: 'object', additionalProperties: false, required: ['messages'],
    properties: {
      messages: { type: 'array', description: 'Agent messages. Canonical fields are role/text/toolUses/toolResults; common content/tool_calls aliases are accepted.', items: { type: 'object' } },
      options: { type: 'object', description: 'Optional compaction thresholds and token budgets.', additionalProperties: true },
      model: { type: 'string', description: 'Optional Jev model name.' },
    },
  };
}

async function callTool(args: ToolArguments): Promise<Record<string, unknown>> {
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Invalid arguments');
  for (const key of Object.keys(args)) if (!['messages', 'options', 'model'].includes(key)) throw new Error('Unsupported argument: ' + key);
  if (args.model !== undefined && typeof args.model !== 'string') throw new Error('model must be a string');
  validateOptions(args.options);
  const messages = normalizeAgentMessages(args.messages);
  const apiKey = process.env.TYPESAFE_API_KEY;
  if (!apiKey) throw new Error('TYPESAFE_API_KEY is not configured');
  const client = new JevClient({ apiKey, model: args.model, baseUrl: process.env.TYPESAFE_BASE_URL, timeoutMs: timeoutMs() });
  return { ...(await compact(messages, client, args.options)) };
}

async function handle(request: JsonRpcRequest): Promise<void> {
  if (!request || typeof request !== 'object' || Array.isArray(request) || request.jsonrpc !== '2.0' || typeof request.method !== 'string' || (request.id !== undefined && typeof request.id !== 'string' && typeof request.id !== 'number')) {
    error(null, -32600, 'Invalid JSON-RPC request'); return;
  }
  const id = request.id;
  if (id === undefined) return;
  if (request.params !== undefined && (!request.params || typeof request.params !== 'object' || Array.isArray(request.params))) { error(id, -32602, 'Invalid params'); return; }
  switch (request.method) {
    case 'initialize':
      result(id, { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: { name: 'fast-jev-compaction', version: serverVersion() } });
      return;
    case 'notifications/initialized': return;
    case 'tools/list':
      result(id, { tools: [{ name: TOOL_NAME, description: 'Compact an agent transcript with Jev while preserving kept content verbatim.', inputSchema: schema() }] });
      return;
    case 'tools/call': {
      const params = request.params ?? {};
      if (params.name !== TOOL_NAME) return error(id, -32602, `Unknown tool: ${String(params.name)}`);
      try {
        const value = await callTool((params.arguments ?? {}) as ToolArguments);
        result(id, { content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value });
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        result(id, { isError: true, content: [{ type: 'text', text: message }] });
      }
      return;
    }
    case 'ping': result(id, {}); return;
    default: if (id !== undefined) error(id, -32601, `Method not found: ${String(request.method)}`);
  }
}

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  input += chunk;
  if (Buffer.byteLength(input) > 8 * 1024 * 1024) { error(null, -32600, 'Input exceeds 8 MiB'); process.exit(1); }
  const lines = input.split('\n');
  input = lines.pop() ?? '';
  for (const line of lines) {
    if (!line.trim()) continue;
    try { const request = JSON.parse(line) as JsonRpcRequest; void handle(request).catch(() => error(request?.id ?? null, -32000, 'Internal error')); }
    catch (cause) { error(null, -32700, 'Invalid JSON'); }
  }
});
