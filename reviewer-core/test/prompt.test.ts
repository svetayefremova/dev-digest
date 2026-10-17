/**
 * assemblePrompt — PR description slot (the fix that was missing: the PR body
 * never reached the prompt). Pins rendering, omit-when-empty, untrusted-wrap,
 * truncation, and ordering (before the diff).
 */
import { describe, it, expect } from 'vitest';
import { assemblePrompt } from '../src/prompt.js';

function userOf(parts: Parameters<typeof assemblePrompt>[0]): string {
  const { messages } = assemblePrompt(parts);
  return messages[1]!.content;
}

function systemOf(parts: Parameters<typeof assemblePrompt>[0]): string {
  return assemblePrompt(parts).messages[0]!.content;
}

describe('assemblePrompt — shared injection guard (server + CI)', () => {
  const sys = systemOf({ system: 'AGENT-SYS', diff: 'DIFF' });

  it('appends the guard to the agent system prompt', () => {
    expect(sys.startsWith('AGENT-SYS')).toBe(true);
    expect(sys).toMatch(/<untrusted>.*DATA to be analyzed/s);
  });

  it('forbids "intentional/test/demo" claims from descoping the review', () => {
    // The defense that replaced the keyword sanitizer: a general, trusted,
    // language-agnostic rule — not text parsing of untrusted input.
    expect(sys).toMatch(/test fixture|intentional|demo/i);
    expect(sys).toMatch(/never reduce|never .*descope|REPORT it/i);
    expect(sys).toMatch(/any language/i);
  });
});

describe('assemblePrompt — ## PR description', () => {
  it('renders the section (untrusted-wrapped) before the diff when present', () => {
    const { messages, assembly } = assemblePrompt({
      system: 'sys',
      diff: 'DIFF',
      prDescription: 'Adds rate limiting to the public /api endpoints.',
    });
    const user = messages[1]!.content;
    expect(user).toContain('## PR description');
    expect(user).toContain('<untrusted source="pr-description">');
    expect(user).toContain('Adds rate limiting to the public /api endpoints.');
    expect(user.indexOf('## PR description')).toBeLessThan(user.indexOf('## Diff to review'));
    expect(assembly.pr_description).toContain('Adds rate limiting');
  });

  it('omits the section when prDescription is undefined or blank (no behaviour change)', () => {
    expect(userOf({ system: 'sys', diff: 'DIFF' })).not.toContain('## PR description');
    expect(assemblePrompt({ system: 'sys', diff: 'DIFF' }).assembly.pr_description ?? null).toBeNull();
    expect(userOf({ system: 'sys', diff: 'DIFF', prDescription: '   ' })).not.toContain(
      '## PR description',
    );
  });

  it('truncates a huge body to the 4k cap', () => {
    const { assembly } = assemblePrompt({
      system: 'sys',
      diff: 'D',
      prDescription: 'x'.repeat(10_000),
    });
    expect((assembly.pr_description as string).length).toBe(4000);
  });
});

describe('assemblePrompt — section metadata (safe logging)', () => {
  const parts = {
    system: 'AGENT-SYS',
    task: 'Review PR #1',
    skills: ['skill-a body', 'skill-b'],
    specs: ['SPEC-PRIVATE-CONTENT'],
    prDescription: 'author body',
    diff: 'DIFF-CONTENT',
  };
  const a = assemblePrompt(parts);

  it('lists rendered sections in prompt order; absent ones are omitted', () => {
    expect(a.sections.map((s) => s.name)).toEqual([
      'system',
      'injection_guard',
      'task',
      'pr_description',
      'skills',
      'specs',
      'diff',
    ]);
    expect(a.sections.find((s) => s.name === 'memory')).toBeUndefined();
  });

  it('sizes match the actual user message and carry no content', () => {
    const userSections = a.sections.filter((s) => !['system', 'injection_guard'].includes(s.name));
    const joined = userSections.reduce((n, s) => n + s.chars, 0) + (userSections.length - 1) * 2;
    expect(joined).toBe(a.messages[1]!.content.length);
    for (const s of a.sections) expect(s.est_tokens).toBe(Math.ceil(s.chars / 4));
    expect(a.sections.find((s) => s.name === 'skills')).toMatchObject({ items: 2, items_chars: [12, 7], trusted: true });
    expect(a.sections.find((s) => s.name === 'diff')).toMatchObject({ source: 'diff', trusted: false });
    const json = JSON.stringify(a.sections);
    expect(json).not.toContain('SPEC-PRIVATE-CONTENT');
    expect(json).not.toContain('DIFF-CONTENT');
  });

  it('sectionTexts are index-aligned with sections', () => {
    expect(a.sectionTexts).toHaveLength(a.sections.length);
    a.sections.forEach((s, i) => expect(a.sectionTexts[i]!.length).toBe(s.chars));
  });
});
