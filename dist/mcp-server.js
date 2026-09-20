import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compact } from './compact.js';
import { JevClient } from './client.js';
import { normalizeAgentMessages } from './agent.js';
const TOOL_NAME = 'compact_transcript';
const PROTOCOL_VERSION = '2024-11-05';
const DEFAULT_TIMEOUT_MS = 60_000;
function serverVersion() {
    try {
        const path = fileURLToPath(new URL('../package.json', import.meta.url));
        return JSON.parse(readFileSync(path, 'utf8')).version;
    }
    catch {
        return 'unknown';
    }
}
function timeoutMs() {
    const value = Number(process.env.TYPESAFE_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
    return Number.isFinite(value) && value > 0 ? value : DEFAULT_TIMEOUT_MS;
}
function timedFetch(input, init) {
    return fetch(input, { ...init, signal: AbortSignal.timeout(timeoutMs()) });
}
function send(message) { process.stdout.write(`${JSON.stringify(message)}\n`); }
function result(id, value) { send({ jsonrpc: '2.0', id, result: value }); }
function error(id, code, message) { send({ jsonrpc: '2.0', id, error: { code, message } }); }
function schema() {
    return {
        type: 'object', additionalProperties: false, required: ['messages'],
        properties: {
            messages: { type: 'array', description: 'Agent messages. Canonical fields are role/text/toolUses/toolResults; common content/tool_calls aliases are accepted.', items: { type: 'object' } },
            options: { type: 'object', description: 'Optional compaction thresholds and token budgets.', additionalProperties: true },
            apiKey: { type: 'string', description: 'Optional TypeSafe API key. Prefer TYPESAFE_API_KEY in the environment.' },
            model: { type: 'string', description: 'Optional Jev model name.' },
        },
    };
}
async function callTool(args) {
    const messages = normalizeAgentMessages(args.messages);
    const apiKey = args.apiKey ?? process.env.TYPESAFE_API_KEY;
    if (!apiKey)
        throw new Error('TYPESAFE_API_KEY is not configured');
    const client = new JevClient({ apiKey, model: args.model, baseUrl: process.env.TYPESAFE_BASE_URL, fetch: timedFetch });
    return { ...(await compact(messages, client, args.options)) };
}
async function handle(request) {
    const id = request.id;
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
            if (params.name !== TOOL_NAME)
                return error(id, -32602, `Unknown tool: ${String(params.name)}`);
            try {
                const value = await callTool((params.arguments ?? {}));
                result(id, { content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value });
            }
            catch (cause) {
                const message = cause instanceof Error ? cause.message : String(cause);
                result(id, { isError: true, content: [{ type: 'text', text: message }] });
            }
            return;
        }
        case 'ping':
            result(id, {});
            return;
        default: if (id !== undefined)
            error(id, -32601, `Method not found: ${String(request.method)}`);
    }
}
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
    input += chunk;
    const lines = input.split('\n');
    input = lines.pop() ?? '';
    for (const line of lines) {
        if (!line.trim())
            continue;
        try {
            const request = JSON.parse(line);
            void handle(request).catch((cause) => error(request.id, -32000, String(cause)));
        }
        catch (cause) {
            error(undefined, -32700, `Invalid JSON: ${String(cause)}`);
        }
    }
});
//# sourceMappingURL=mcp-server.js.map