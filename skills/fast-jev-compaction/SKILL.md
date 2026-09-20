---
name: fast-jev-compaction
description: Compact a supplied transcript with the Fast Jev Compaction MCP tool when the user explicitly asks to remove stale tool history or inspect compaction decisions.
---

# Fast Jev Compaction

Use the `fast_jev_compaction` MCP server's `compact_transcript` tool only when the user explicitly asks for transcript compaction or a compaction audit.

The tool sends the supplied transcript's compaction state to TypeSafe Jev. It needs `TYPESAFE_API_KEY`, either in the plugin environment or as the tool argument. Do not pass secrets or unrelated private transcripts without the user's direction.

This plugin is on-demand. It does not replace Codex's built-in automatic context compaction and it never executes tools from the transcript.

Input `messages` must be an array of objects with `role`, `text`, `toolUses`, and optional `toolResults`. The result contains the compacted messages, per-call decisions, and statistics.
