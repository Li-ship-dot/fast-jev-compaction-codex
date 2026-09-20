# Fast Jev Compaction for Codex

This repository adapts [fast-jev-compaction](https://github.com/tamaratran/fast-jev-compaction) for Codex.

It exposes an on-demand MCP tool, `compact_transcript`, that uses TypeSafe Jev to decide which tool calls and tool results can be removed or truncated while keeping retained transcript content verbatim. It does not replace Codex's internal automatic compaction; Codex does not expose a public plugin hook for that behavior.

## Install as a Codex plugin

```sh
npm install
npm run typecheck
npm test
npm run build
```

Install the local plugin through the personal marketplace after copying this repository to `~/plugins/fast-jev-compaction` and adding it to `~/.agents/plugins/marketplace.json`, or use the GitHub repository once published.

Set `TYPESAFE_API_KEY` before using the MCP tool. The supplied transcript's compaction state is sent to `https://api.typesafe.ai/v1/systemone` by default. Set `TYPESAFE_BASE_URL` to use a compatible endpoint. Do not send secrets or private transcripts without checking the data boundary.

## Tool contract

`compact_transcript` accepts:

- `messages`: transcript messages with `role`, `text`, `toolUses`, and optional `toolResults`;
- `options`: optional thresholds and token budgets from the original library;
- `apiKey` and `model`: optional per-call overrides.

The result contains the compacted `messages`, per-call `decisions`, and `stats`. It never executes tools from the supplied transcript.

## Development

```sh
npm run typecheck
npm test
npm run build
npm run validate:plugin
```

The original MIT license and core compaction implementation are retained. Claude Code-specific hooks are intentionally not part of the Codex plugin.
