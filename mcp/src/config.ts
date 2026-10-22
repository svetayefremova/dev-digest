import { z } from 'zod';
import type { Config } from './domain/constants.js';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

const EnvSchema = z.object({
  DEVDIGEST_API_URL: z
    .string()
    .url()
    .default('http://localhost:3001')
    .refine((v) => LOOPBACK_HOSTS.has(new URL(v).hostname), {
      message: 'DEVDIGEST_API_URL must point to a loopback host (localhost, 127.0.0.1 or ::1)',
    }),
  DEVDIGEST_MCP_WAIT_MS: z.coerce.number().int().min(0).max(600_000).default(240_000),
  DEVDIGEST_MCP_POLL_MS: z.coerce.number().int().min(1000).default(3000),
});

export type { Config };

/** Parses env into Config; throws on invalid values (callers decide how to exit). */
export function parseConfig(env: Record<string, string | undefined>): Config {
  const parsed = EnvSchema.parse({
    DEVDIGEST_API_URL: env.DEVDIGEST_API_URL || undefined,
    DEVDIGEST_MCP_WAIT_MS: env.DEVDIGEST_MCP_WAIT_MS || undefined,
    DEVDIGEST_MCP_POLL_MS: env.DEVDIGEST_MCP_POLL_MS || undefined,
  });
  return {
    apiUrl: parsed.DEVDIGEST_API_URL.replace(/\/+$/, ''),
    waitMs: parsed.DEVDIGEST_MCP_WAIT_MS,
    pollMs: parsed.DEVDIGEST_MCP_POLL_MS,
  };
}

/** Invalid env → clear error on stderr + exit(1). */
export function loadConfig(env: Record<string, string | undefined>): Config {
  try {
    return parseConfig(env);
  } catch (err) {
    const detail =
      err instanceof z.ZodError
        ? err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
        : String(err);
    process.stderr.write(`devdigest-mcp: invalid configuration — ${detail}\n`);
    process.exit(1);
  }
}
