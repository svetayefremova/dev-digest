import { createHash } from 'node:crypto';
import type { PromptAssembledInfo } from '@devdigest/reviewer-core';
import type { Tokenizer } from '../adapters/tokenizer/index.js';
import type { PinoLike } from './run-logger.js';

/**
 * Safe structured logging of a review prompt's assembly — stdout (pino) only,
 * never the RunBus/SSE Live Log or the persisted trace.
 *
 * The log object is built from an explicit ALLOWLIST of fields (no spreading of
 * the input), so prompt content — the diff, PR body, spec chunks, skill bodies,
 * secrets that ended up in any of them — cannot reach the log by construction.
 *
 * Verbose mode (local only, see config.promptLogVerbose) adds per-section
 * sha256 prefixes and exact tiktoken counts. It reads `sectionTexts` to compute
 * those and drops the text immediately; it still logs no content.
 */

export interface PromptLogContext {
  correlationId?: string;
  runId: string;
  agent: string;
  provider: string;
}

export interface PromptLogOptions {
  verbose: boolean;
  tokenizer?: Tokenizer;
}

const shortHash = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 12);

export function logPromptAssembly(
  logger: PinoLike | undefined,
  info: PromptAssembledInfo,
  ctx: PromptLogContext,
  opts: PromptLogOptions,
): void {
  if (!logger) return;
  const texts = opts.verbose ? info.sectionTexts : undefined;

  const sections = info.sections.map((s, i) => {
    const base = {
      name: s.name,
      source: s.source,
      trusted: s.trusted,
      chars: s.chars,
      est_tokens: s.est_tokens,
      ...(s.items !== undefined ? { items: s.items } : {}),
    };
    if (!opts.verbose) return base;
    const text = texts?.[i];
    return {
      ...base,
      ...(s.items_chars ? { items_chars: s.items_chars } : {}),
      ...(text !== undefined ? { sha256: shortHash(text) } : {}),
      ...(text !== undefined && opts.tokenizer ? { tokens: opts.tokenizer.count(text) } : {}),
    };
  });

  const entry = {
    event: 'prompt.assembled',
    correlationId: ctx.correlationId ?? null,
    runId: ctx.runId,
    agent: ctx.agent,
    provider: ctx.provider,
    model: info.model,
    mode: info.mode,
    chunk: info.chunk,
    files: info.files,
    total_chars: info.total_chars,
    total_est_tokens: info.total_est_tokens,
    verbose: opts.verbose,
    sections,
  };
  logger.info(entry, `prompt: assembled ${sections.length} section(s) for ${info.model}`);
}
