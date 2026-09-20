import { compact } from './compact.js';
const TOOL_NAME = 'compact_transcript';
const PROTOCOL_VERSION = '2024-11-05';
function send(message) {
    process.stdout.write(`${JSON.stringify(message)}\n`);
}
function result(id, value) {
    send({ jsonrpc: '2.0', id, result: value });
}
function error(id, code, message) {
    send({ jsonrpc: '2.0', id, error: { code, message } });
}
function isMessage(value) {
    if (!value || typeof value !== 'object')
        return false;
    const message = value;
    return ((message.role === 'user' || message.role === 'assistant') &&
        typeof message.text === 'string' &&
        Array.isArray(message.toolUses) &&
        message.toolUses.every((tool) => tool && typeof tool === 'object') &&
        (message.toolResults === undefined || Array.isArray(message.toolResults)));
}
function schema() {
    return {
        type: 'object',
        additionalProperties: false,
        required: ['messages'],
        properties: {
            messages: {
                type: 'array',
                description: 'Transcript messages with role, text, toolUses, and optional toolResults.',
                items: { type: 'object' },
            },
            options: {
                type: 'object',
                description: 'Optional compaction thresholds and token budgets.',
                additionalProperties: true,
            },
            apiKey: {
                type: 'string',
                description: 'Optional TypeSafe API key. Prefer TYPESAFE_API_KEY in the environment.',
            },
            model: { type: 'string', description: 'Optional Jev model name.' },
        },
    };
}
async function callTool(args) {
    if (!Array.isArray(args.messages) || !args.messages.every(isMessage)) {
        throw new Error('messages must be an array of valid transcript messages');
    }
    const apiKey = args.apiKey ?? process.env.TYPESAFE_API_KEY;
    if (!apiKey)
        throw new Error('TYPESAFE_API_KEY is not configured');
    const baseUrl = process.env.TYPESAFE_BASE_URL;
    const resultValue = await compact(args.messages, {
        async ask(state, questions) {
            const response = await fetch(baseUrl ?? 'https://api.typesafe.ai/v1/systemone', {
                method: 'POST',
                headers: {
                    authorization: `Bearer ${apiKey}`,
                    'content-type': 'application/json',
                },
                body: JSON.stringify({ model: args.model ?? 'jev-latest', state, questions }),
            });
            const body = await response.text();
            if (!response.ok)
                throw new Error(`TypeSafe Jev request failed (${response.status}): ${body.slice(0, 500)}`);
            const parsed = JSON.parse(body);
            if (!parsed || typeof parsed !== 'object' || !('answers' in parsed)) {
                throw new Error('TypeSafe Jev response did not contain answers');
            }
            return parsed;
        },
    }, args.options);
    return { ...resultValue };
}
async function handle(request) {
    const id = request.id;
    switch (request.method) {
        case 'initialize':
            result(id, {
                protocolVersion: PROTOCOL_VERSION,
                capabilities: { tools: {} },
                serverInfo: { name: 'fast-jev-compaction', version: '0.3.0' },
            });
            return;
        case 'tools/list':
            result(id, {
                tools: [{ name: TOOL_NAME, description: 'Compact a supplied transcript with Jev while preserving kept content verbatim.', inputSchema: schema() }],
            });
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
        default:
            if (id !== undefined)
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