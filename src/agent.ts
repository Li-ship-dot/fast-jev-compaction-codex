import type { Message, Role, ToolResult, ToolUse } from './types.js';

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an object');
  return value as Record<string, unknown>;
}
function keys(item: Record<string, unknown>, allowed: string[]): void {
  for (const key of Object.keys(item)) if (!allowed.includes(key)) throw new Error(`Unsupported field: ${key}`);
}
function string(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Expected a string');
  return value;
}
function flag(value: unknown): boolean | undefined {
  if (value !== undefined && typeof value !== 'boolean') throw new Error('isError must be boolean');
  return value;
}
function text(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) throw new Error('Expected text content');
  return value.map((part) => {
    const block = record(part);
    keys(block, ['type', 'text']);
    if (block.type !== 'text') throw new Error('Only text content blocks are supported');
    return string(block.text);
  }).join('');
}
function call(value: unknown): ToolUse {
  const item = record(value);
  keys(item, ['tool_use_id', 'id', 'tool', 'name', 'input', 'function', 'type', 'text', 'isError']);
  if (item.type !== undefined && item.type !== 'function') throw new Error('Only function tool calls are supported');
  const fn = item.function === undefined ? undefined : record(item.function);
  if (fn) keys(fn, ['name', 'arguments']);
  let args = item.input ?? fn?.arguments;
  if (typeof args === 'string') args = JSON.parse(args);
  const id = string(item.tool_use_id ?? item.id);
  const name = string(item.tool ?? item.name ?? fn?.name);
  if (!id || !name) throw new Error('Tool id and name must be nonempty');
  return { tool_use_id: id, tool: name, input: record(args),
    ...(item.text !== undefined ? { text: string(item.text) } : {}),
    ...(flag(item.isError) !== undefined ? { isError: flag(item.isError) } : {}) };
}
function result(value: unknown): ToolResult {
  const item = record(value);
  keys(item, ['tool_use_id', 'tool_call_id', 'text', 'content', 'isError']);
  return { tool_use_id: string(item.tool_use_id ?? item.tool_call_id), text: text(item.text ?? item.content),
    ...(flag(item.isError) !== undefined ? { isError: flag(item.isError) } : {}) };
}
function list<T>(value: unknown, convert: (item: unknown) => T): T[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error('Expected an array');
  return value.map(convert);
}
function alias(item: Record<string, unknown>, names: string[]): unknown {
  const present = names.filter((name) => item[name] !== undefined);
  if (present.length > 1) throw new Error(`Ambiguous fields: ${present.join(', ')}`);
  return item[present[0]];
}

/** Text-only canonical or Chat Completions messages. Unsupported fields fail closed.
 * Output uses the canonical shape, not a lossless native-host serialization.
 */
export function normalizeAgentMessages(input: unknown): Message[] {
  if (!Array.isArray(input)) throw new Error('messages must be an array');
  const messages = input.map((value): Message => {
    const item = record(value);
    keys(item, ['role', 'text', 'content', 'toolUses', 'toolCalls', 'tool_calls', 'toolResults', 'tool_results', 'tool_call_id', 'isError']);
    if (!['user', 'assistant', 'system', 'developer', 'tool'].includes(String(item.role))) throw new Error('Unsupported role');
    const role = item.role as Role;
    const body = alias(item, ['text', 'content']);
    const toolUses = list(alias(item, ['toolUses', 'toolCalls', 'tool_calls']), call);
    const toolResults = list(alias(item, ['toolResults', 'tool_results']), result);
    if (item.tool_call_id !== undefined) {
      if (role !== 'tool' || toolResults.length) throw new Error('Ambiguous tool result');
      toolResults.push(result({ tool_call_id: item.tool_call_id, content: body, isError: item.isError }));
    }
    if (toolUses.length && role !== 'assistant') throw new Error('Tool calls require assistant role');
    if (toolResults.length && !['user', 'tool'].includes(role)) throw new Error('Invalid tool-result role');
    if (role === 'tool' && toolResults.length !== 1) throw new Error('Tool message requires one result');
    return { role, text: item.tool_call_id === undefined ? text(body) : '', toolUses,
      ...(toolResults.length ? { toolResults } : {}) };
  });
  const calls = new Set<string>(), results = new Set<string>();
  for (const message of messages) {
    for (const tool of message.toolUses) {
      if (calls.has(tool.tool_use_id)) throw new Error('Duplicate tool call id');
      calls.add(tool.tool_use_id);
    }
    for (const output of message.toolResults ?? []) {
      if (!calls.has(output.tool_use_id) || results.has(output.tool_use_id)) throw new Error('Unpaired or duplicate tool result');
      results.add(output.tool_use_id);
    }
  }
  return messages;
}
