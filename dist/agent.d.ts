import type { Message } from './types.js';
/** Text-only canonical or Chat Completions messages. Unsupported fields fail closed.
 * Output uses the canonical shape, not a lossless native-host serialization.
 */
export declare function normalizeAgentMessages(input: unknown): Message[];
//# sourceMappingURL=agent.d.ts.map