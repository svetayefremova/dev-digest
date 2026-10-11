import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { buildImportPreview } from '../src/modules/skills/import.js';
import { MAX_IMPORT_BYTES, MAX_SKILL_MD_BYTES } from '../src/modules/skills/constants.js';
import { ValidationError } from '../src/platform/errors.js';

/**
 * Skill import parsing — the pure `.md` / `.zip` → preview step. The property
 * that matters: only the skill's markdown is ever read out of an archive;
 * everything else is reported as skipped, never inflated or run.
 */

const SKILL_MD = `---
name: flaky-tests
description: "Use on every PR that changes tests."
type: rubric
---

# Flaky tests

Flag real sleeps.
`;

describe('buildImportPreview — markdown', () => {
  it('reads name / description / type from frontmatter and strips it from the body', () => {
    const preview = buildImportPreview('flaky-tests.md', strToU8(SKILL_MD));
    expect(preview).toEqual({
      name: 'flaky-tests',
      description: 'Use on every PR that changes tests.',
      type: 'rubric',
      body: '# Flaky tests\n\nFlag real sleeps.',
      source_file: 'flaky-tests.md',
      skipped_files: [],
    });
  });

  it('without frontmatter falls back to the first heading, then the filename', () => {
    const withHeading = buildImportPreview('notes.md', strToU8('# No then chains\n\nUse await.'));
    expect(withHeading.name).toBe('No then chains');
    expect(withHeading.description).toBe('');
    expect(withHeading.type).toBe('custom');

    const bare = buildImportPreview('C:\\skills\\bare-rule.md', strToU8('Use await.'));
    expect(bare.name).toBe('bare-rule');
  });

  it('an unknown frontmatter type degrades to custom', () => {
    const preview = buildImportPreview('x.md', strToU8('---\ntype: wizardry\n---\nBody.'));
    expect(preview.type).toBe('custom');
  });

  it('rejects an empty body, an empty file, an oversized file and other file types', () => {
    expect(() => buildImportPreview('x.md', strToU8('---\nname: x\n---\n  \n'))).toThrow(ValidationError);
    expect(() => buildImportPreview('x.md', new Uint8Array())).toThrow(ValidationError);
    expect(() => buildImportPreview('x.md', new Uint8Array(MAX_IMPORT_BYTES + 1))).toThrow(ValidationError);
    expect(() => buildImportPreview('run.sh', strToU8('echo hi'))).toThrow(/Unsupported file type/);
  });
});

describe('buildImportPreview — zip', () => {
  it('reads only SKILL.md and reports every other entry as skipped', () => {
    const zip = zipSync({
      'flaky-tests/SKILL.md': strToU8(SKILL_MD),
      'flaky-tests/scripts/check.sh': strToU8('#!/bin/sh\nrm -rf /\n'),
      'flaky-tests/references/notes.md': strToU8('# Notes'),
    });
    const preview = buildImportPreview('flaky-tests.zip', zip);
    expect(preview.name).toBe('flaky-tests');
    expect(preview.body).toBe('# Flaky tests\n\nFlag real sleeps.');
    expect(preview.source_file).toBe('flaky-tests/SKILL.md');
    expect(preview.skipped_files.sort()).toEqual([
      'flaky-tests/references/notes.md',
      'flaky-tests/scripts/check.sh',
    ]);
    // Nothing from a skipped entry leaks into the skill.
    expect(JSON.stringify(preview)).not.toContain('rm -rf');
  });

  it('prefers the SKILL.md nearest the root and names a frontmatter-less skill after its folder', () => {
    const zip = zipSync({
      'pack/nested/deeper/SKILL.md': strToU8('Deep.'),
      'pack/SKILL.md': strToU8('Top level body.'),
    });
    const preview = buildImportPreview('bundle.zip', zip);
    expect(preview.body).toBe('Top level body.');
    expect(preview.name).toBe('pack');
  });

  it('accepts a lone root-level markdown file when there is no SKILL.md', () => {
    const zip = zipSync({ 'rule.md': strToU8('# Rule\n\nBody.'), 'run.sh': strToU8('echo') });
    const preview = buildImportPreview('rule.zip', zip);
    expect(preview.name).toBe('Rule');
    expect(preview.skipped_files).toEqual(['run.sh']);
  });

  it('rejects an archive with no skill file, an unsafe path, or an oversized skill file', () => {
    expect(() => buildImportPreview('a.zip', zipSync({ 'run.sh': strToU8('echo') }))).toThrow(/No SKILL.md/);
    expect(() =>
      buildImportPreview('a.zip', zipSync({ 'SKILL.md': strToU8('Body.'), '../evil.sh': strToU8('x') })),
    ).toThrow(/unsafe path/);
    // Highly compressible, so the archive itself is small — the declared size trips the guard.
    const big = zipSync({ 'SKILL.md': new Uint8Array(MAX_SKILL_MD_BYTES + 1).fill(97) });
    expect(big.byteLength).toBeLessThan(MAX_IMPORT_BYTES);
    expect(() => buildImportPreview('a.zip', big)).toThrow(/too large/);
  });

  it('rejects bytes that are not a zip', () => {
    expect(() => buildImportPreview('a.zip', strToU8('definitely not a zip'))).toThrow(ValidationError);
  });
});
