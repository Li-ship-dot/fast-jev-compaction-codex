import type { Message, ToolResult, ToolUse } from './types.js';

type RecordValue = Record<string, unknown>;

function record(value: unknown): RecordValue | undefined {
  return value && typeof value === 'object' ? (value as RecordValue) : undefined;
}

function textFromContent(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return '';
  return value.map((part) => {
    const item = record(part);
    return typeof item?.text === 'string' ? item.text : '';
  }).filter(Boolean).join('\n');
}

function parseInput(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object') return value as Record<string, unknown>;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
    } catch {
      // Keep malformed host arguments visible without executing them.
    }
  }
  return {};
}

function normalizeToolUse(value: unknown): ToolUse | undefined {
  const item = record(value);
  if (!item) return undefined;
  const fn = record(item.function);
  const id = item.tool_use_id ?? item.tool_call_id ?? item.id;
  const name = item.tool ?? item.name ?? fn?.name;
  if (typeof id !== 'string' || typeof name !== 'string') return undefined;
  return {
    tool_use_id: id,
    tool: name,
    input: parseInput(item.input ?? item.arguments ?? fn?.arguments),
    ...(typeof item.text === 'string' ? { text: item.text } : {}),
    ...(typeof item.isError === 'boolean' ? { isError: item.isError } : {}),
  };
}

function normalizeToolResult(value: unknown): ToolResult | undefined {
  const item = record(value);
  if (!item) return undefined;
  const id = item.tool_use_id ?? item.tool_call_id ?? item.id;
  if (typeof id !== 'string') return undefined;
  return {
    tool_use_id: id,
    text: textFromContent(item.text ?? item.content ?? ''),
    ...(typeof item.isError === 'boolean' ? { isError: item.isError } : {}),
  };
}

/** Normalize common OpenAI/Anthropic-style agent messages into the core shape. */
export function normalizeAgentMessages(input: unknown): Message[] {
  if (!Array.isArray(input)) throw new Error('messages must be an array');
  return input.map((value, index) => {
    const item = record(value);
    if (!item || typeof item.role !== 'string') throw new Error(`messages[${index}] must contain a role`);
    const role = item.role === 'assistant' ? 'assistant' : 'user';
    const calls = item.toolUses ?? item.toolCalls ?? item.tool_calls;
    const results = item.toolResults ?? item.tool_results;
    const toolUses = Array.isArray(calls) ? calls.map(normalizeToolUse).filter((call): call is ToolUse => Boolean(call)) : [];
    const toolResults = Array.isArray(results) ? results.map(normalizeToolResult).filter((result): result is ToolResult => Boolean(result)) : [];
    const singleResult = item.tool_call_id
      ? normalizeToolResult({ tool_call_id: item.tool_call_id, content: item.content, isError: item.isError })
      : undefined;
    if (singleResult) toolResults.push(singleResult);
    return {
      role,
      text: textFromContent(item.text ?? item.content ?? ''),
      toolUses,
      ...(toolResults.length > 0 ? { toolResults } : {}),
    };
  });
}
