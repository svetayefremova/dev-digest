import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ApiError, ApiUnreachableError } from '../api/errors.js';
import type { Output } from '../application/types.js';
import type { Result, ToolFailure } from '../domain/errors.js';

const CHECK_LOGS =
  'Check the DevDigest API logs (server terminal) and retry; if it persists, verify the repo/PR/agent in the DevDigest UI.';

export function toolError(text: string): CallToolResult {
  return { isError: true, content: [{ type: 'text', text }] };
}

/** The one place a plain ToolFailure becomes an MCP result. */
export function failureResult(f: ToolFailure): CallToolResult {
  return toolError(f.next ? `${f.message}. ${f.next}` : f.message);
}

export function fromApiError(err: unknown, apiUrl: string): CallToolResult {
  if (err instanceof ApiUnreachableError) {
    return toolError(
      `DevDigest API is not reachable at ${apiUrl}. Start it: ./scripts/dev.sh (or cd server && npm run dev), then retry.`,
    );
  }
  if (err instanceof ApiError) {
    if (err.status === 429) {
      return toolError('DevDigest rate limit hit (reviews: 10/min). Wait ~1 minute and retry.');
    }
    return toolError(`${err.code}: ${err.message}. ${CHECK_LOGS}`);
  }
  return toolError(`Unexpected error: ${err instanceof Error ? err.message : String(err)}. ${CHECK_LOGS}`);
}

/** Runs a handler body, mapping API errors to onward-leading tool errors. */
export async function guard(apiUrl: string, fn: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await fn();
  } catch (err) {
    return fromApiError(err, apiUrl);
  }
}

/** Maps a use-case Result into an MCP tool result (structured + compact text). */
export function toResult<T extends object>(
  result: Result<Output<T>>,
): CallToolResult {
  if (!result.ok) return failureResult(result.failure);
  return {
    content: [{ type: 'text', text: result.value.text }],
    structuredContent: result.value.structured as Record<string, unknown>,
  };
}
