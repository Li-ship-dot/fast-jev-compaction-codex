import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const readJson = (name) => JSON.parse(readFileSync(resolve(root, name), 'utf8'));
const rootManifest = readJson('plugin.json');
const codexManifest = readJson('.codex-plugin/plugin.json');
const mcp = readJson('mcp.json');
const codexMcp = readJson('.mcp.json');

const failures = [];
const requireFile = (path) => { if (!existsSync(resolve(root, path))) failures.push(`missing ${path}`); };
const requireEqual = (left, right, label) => { if (JSON.stringify(left) !== JSON.stringify(right)) failures.push(`${label} differs`); };

for (const [label, manifest] of [['plugin.json', rootManifest], ['.codex-plugin/plugin.json', codexManifest]]) {
  if (manifest.name !== 'fast-jev-compaction') failures.push(`${label}: wrong name`);
  if (!manifest.version) failures.push(`${label}: missing version`);
  if (!manifest.description) failures.push(`${label}: missing description`);
}
if (rootManifest.skills !== './skills/' || codexManifest.skills !== './skills/') failures.push('skill path is not portable');
if (rootManifest.mcpServers !== './mcp.json') failures.push('portable manifest must point to ./mcp.json');
if (codexManifest.mcpServers !== './.mcp.json') failures.push('Codex compatibility manifest must point to ./.mcp.json');
requireEqual(mcp, codexMcp, 'MCP configs');
requireFile('dist/mcp-server.js');
requireFile('skills/fast-jev-compaction/SKILL.md');
requireFile('LICENSE');

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exit(1);
}
console.log('Portable Agent plugin validation passed');
