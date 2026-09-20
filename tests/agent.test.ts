import { describe, expect, it } from 'vitest';
import { normalizeAgentMessages } from '../src/agent.js';

describe('agent transcript adapter', () => {
  it('normalizes content and tool_calls aliases', () => {
    expect(normalizeAgentMessages([
      { role: 'user', content: 'keep this' },
      { role: 'assistant', content: '', tool_calls: [{ id: 'call-1', function: { name: 'Read', arguments: '{"path":"a"}' } }] },
      { role: 'tool', tool_call_id: 'call-1', content: 'result' },
    ])).toEqual([
      { role: 'user', text: 'keep this', toolUses: [] },
      { role: 'assistant', text: '', toolUses: [{ tool_use_id: 'call-1', tool: 'Read', input: { path: 'a' } }] },
      { role: 'user', text: 'result', toolUses: [], toolResults: [{ tool_use_id: 'call-1', text: 'result' }] },
    ]);
  });

  it('rejects malformed message lists', () => {
    expect(() => normalizeAgentMessages([{ content: 'missing role' }])).toThrow(/role/);
  });
});
