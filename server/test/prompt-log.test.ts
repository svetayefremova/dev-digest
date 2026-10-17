/**
 * Prompt-assembly logging must be content-free: no diff, spec, PR body or
 * secret ever reaches the log object — in normal OR local verbose mode — and
 * verbose is honored only in development.
 */
import { describe, it, expect } from 'vitest';
import { assemblePrompt, type PromptAssembledInfo } from '@devdigest/reviewer-core';
import { logPromptAssembly } from '../src/platform/prompt-log.js';
import { loadConfig } from '../src/platform/config.js';

const SENTINELS = ['SECRET_DIFF_MARKER', 'sk-test-abc123', 'PRIVATE_SPEC_BODY', 'AUTHOR_BODY_MARKER', 'SKILL_BODY_MARKER'];

function infoFor(): PromptAssembledInfo {
  const a = assemblePrompt({
    system: 'agent system',
    task: 'Review PR #7',
    skills: ['SKILL_BODY_MARKER rules'],
    specs: ['PRIVATE_SPEC_BODY details'],
    prDescription: 'AUTHOR_BODY_MARKER with key sk-test-abc123',
    diff: '+const k = "sk-test-abc123"; // SECRET_DIFF_MARKER',
  });
  return {
    chunk: 'all files',
    mode: 'single-pass',
    model: 'gpt-4.1',
    files: 1,
    sections: a.sections,
    total_chars: a.sections.reduce((n, s) => n + s.chars, 0),
    total_est_tokens: a.sections.reduce((n, s) => n + s.est_tokens, 0),
    sectionTexts: a.sectionTexts,
  };
}

function capture() {
  const calls: { obj: unknown; msg?: string }[] = [];
  const rec = (obj: unknown, msg?: string) => calls.push({ obj, msg });
  return { calls, logger: { info: rec, warn: rec, error: rec, debug: rec } };
}

const ctx = { correlationId: 'req-42', runId: 'run-1', agent: 'sec', provider: 'openai' };

describe('logPromptAssembly', () => {
  it.each([false, true])('never logs prompt content (verbose=%s)', (verbose) => {
    const { calls, logger } = capture();
    logPromptAssembly(logger, infoFor(), ctx, { verbose, tokenizer: { count: (t) => t.length } });
    expect(calls).toHaveLength(1);
    const json = JSON.stringify(calls[0]);
    for (const s of SENTINELS) expect(json).not.toContain(s);
    expect(json).not.toContain('sectionTexts');
  });

  it('carries correlation id, model and per-section name/source/size', () => {
    const { calls, logger } = capture();
    logPromptAssembly(logger, infoFor(), ctx, { verbose: false });
    const obj = calls[0]!.obj as Record<string, any>;
    expect(obj).toMatchObject({ event: 'prompt.assembled', correlationId: 'req-42', runId: 'run-1', model: 'gpt-4.1' });
    expect(obj.sections.map((s: any) => s.name)).toContain('diff');
    for (const s of obj.sections) {
      expect(typeof s.chars).toBe('number');
      expect(s.sha256).toBeUndefined();
      expect(s.tokens).toBeUndefined();
    }
  });

  it('verbose adds hashes and exact token counts', () => {
    const { calls, logger } = capture();
    logPromptAssembly(logger, infoFor(), ctx, { verbose: true, tokenizer: { count: () => 5 } });
    const sec = (calls[0]!.obj as any).sections[0];
    expect(sec.sha256).toMatch(/^[0-9a-f]{12}$/);
    expect(sec.tokens).toBe(5);
  });
});

describe('config.promptLogVerbose', () => {
  const env = (e: Record<string, string>) => loadConfig({ ...e } as NodeJS.ProcessEnv);
  it('is on only for PROMPT_LOG_VERBOSE=true in development', () => {
    expect(env({ NODE_ENV: 'development', PROMPT_LOG_VERBOSE: 'true' }).promptLogVerbose).toBe(true);
    expect(env({ NODE_ENV: 'development' }).promptLogVerbose).toBe(false);
    const prod = env({ NODE_ENV: 'production', PROMPT_LOG_VERBOSE: 'true' });
    expect(prod.promptLogVerbose).toBe(false);
    expect(prod.promptLogVerboseIgnored).toBe(true);
  });
});
