# Fast Jev Compaction for Agent Hosts

This repository adapts [fast-jev-compaction](https://github.com/tamaratran/fast-jev-compaction) as a portable Agent plugin. It exposes the same MCP server to Agent hosts and keeps a `.codex-plugin/` compatibility manifest for Codex.

It exposes an on-demand MCP tool, `compact_transcript`, that uses TypeSafe Jev to decide which tool calls and tool results can be removed or truncated while keeping retained transcript content verbatim. It does not replace a host's internal automatic compaction.

## Install as an Agent plugin

```sh
npm install
npm run typecheck
npm test
npm run build
```

The portable entrypoint is `plugin.json` with `mcp.json` and `skills/`. Codex can also load `.codex-plugin/plugin.json` with `.mcp.json`. The two MCP files are intentionally identical so either loader gets the same server configuration.

Set `TYPESAFE_API_KEY` before using the MCP tool. The supplied transcript's compaction state is sent to `https://api.typesafe.ai/v1/systemone` by default. Set `TYPESAFE_BASE_URL` to use a compatible endpoint. Do not send secrets or private transcripts without checking the data boundary.

## Agent-neutral transcript contract

`compact_transcript` accepts a `messages` array. The canonical shape is:

```json
{
  "role": "assistant",
  "text": "",
  "toolUses": [{"tool_use_id": "call-1", "tool": "Read", "input": {"path": "README.md"}}],
  "toolResults": []
}
```

The MCP adapter also accepts common `content`, `tool_calls`, `toolCalls`, `tool_results`, and `tool_call_id` aliases from Agent hosts. Tool-role messages are normalized to the internal result representation; no tool from the supplied transcript is executed.

Options accepted by `compact_transcript` include:

- `messages`: transcript messages with `role`, `text`, `toolUses`, and optional `toolResults`;
- `options`: optional thresholds and token budgets from the original library;
- `model`: optional per-call model override; the MCP server reads `TYPESAFE_API_KEY` from its environment.

The result contains the compacted `messages`, per-call `decisions`, and `stats`.

## Development

```sh
npm run typecheck
npm test
npm run build
npm run validate:plugin
```

The original MIT license and core compaction implementation are retained. Claude Code-specific hooks are intentionally not part of this portable Agent plugin.
