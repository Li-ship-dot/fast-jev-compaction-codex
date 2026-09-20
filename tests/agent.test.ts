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
      { role: 'tool', text: '', toolUses: [], toolResults: [{ tool_use_id: 'call-1', text: 'result' }] },
    ]);
  });

  it('rejects malformed message lists', () => {
    expect(() => normalizeAgentMessages([{ content: 'missing role' }])).toThrow(/role/);
  });

  it('preserves system and developer roles and fails closed on unknown fields', () => {
    expect(normalizeAgentMessages([
      { role: 'system', content: 'policy' },
      { role: 'developer', content: 'context' },
    ])).toEqual([
      { role: 'system', text: 'policy', toolUses: [] },
      { role: 'developer', text: 'context', toolUses: [] },
    ]);
    expect(() => normalizeAgentMessages([{ role: 'user', content: 'x', extra: true }])).toThrow(/Unsupported field/);
  });
});
