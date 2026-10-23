import { describe, it, expect } from 'vitest';
import {
  categoryOf,
  compileGlobs,
  dedupePaths,
  isValidAttachmentPath,
  searchedFolders,
} from '../src/modules/context/helpers.js';
import { loadConfig, parseSearchGlobs } from '../src/platform/config.js';

const DEFAULT = '**/{specs,docs,insights}/**/*.md';

describe('SPEC-01 project context helpers', () => {
  it('SPEC-01 AC-2: category is the nearest folder named specs|docs|insights; other only outside them', () => {
    expect(categoryOf('insights/perf.md')).toBe('insights');
    expect(categoryOf('server/docs/x.md')).toBe('docs');
    expect(categoryOf('docs/specs/a.md')).toBe('specs');
    expect(categoryOf('specs/docs/a.md')).toBe('docs');
    expect(categoryOf('notes/n.md')).toBe('other');
    expect(categoryOf('README.md')).toBe('other');
  });

  it('SPEC-01 AC-34: dedupePaths keeps the first occurrence of a repeated path in place', () => {
    expect(dedupePaths(['a', 'b', 'b', 'c', 'a'])).toEqual(['a', 'b', 'c']);
    expect(dedupePaths([])).toEqual([]);
  });

  it('SPEC-01 AC-1: the default glob matches specs/docs/insights at any depth but not a root README', () => {
    const matches = compileGlobs([DEFAULT]);
    expect(matches('specs/a.md')).toBe(true);
    expect(matches('docs/b.md')).toBe(true);
    expect(matches('server/docs/x.md')).toBe(true);
    expect(matches('a/b/insights/deep/er/c.md')).toBe(true);
    expect(matches('README.md')).toBe(false);
    expect(matches('notes/n.md')).toBe(false);
    expect(matches('docs/c.txt')).toBe(false);
  });

  it('SPEC-01 AC-8: the searched folders named for the empty-state hint are specs, docs and insights by default', () => {
    expect([...searchedFolders([DEFAULT])].sort()).toEqual(['docs', 'insights', 'specs']);
  });

  it('SPEC-01 AC-18: attachment paths must be relative, traversal-free, .md files outside excluded folders', () => {
    expect(isValidAttachmentPath('docs/a.md')).toBe(true);
    expect(isValidAttachmentPath('../x.md')).toBe(false);
    expect(isValidAttachmentPath('docs/../../x.md')).toBe(false);
    expect(isValidAttachmentPath('/etc/x.md')).toBe(false);
    expect(isValidAttachmentPath('docs/a.txt')).toBe(false);
    expect(isValidAttachmentPath('.git/config.md')).toBe(false);
    expect(isValidAttachmentPath('node_modules/docs/y.md')).toBe(false);
  });

  it('SPEC-01 AC-47: CONTEXT_SEARCH_GLOBS overrides the default; empty or invalid falls back to it', () => {
    expect(parseSearchGlobs('**/notes/**/*.md')).toEqual(['**/notes/**/*.md']);
    expect(parseSearchGlobs('**/notes/**/*.md, **/{a,b}/**/*.md')).toEqual([
      '**/notes/**/*.md',
      '**/{a,b}/**/*.md',
    ]);
    expect(parseSearchGlobs(undefined)).toEqual([DEFAULT]);
    expect(parseSearchGlobs('  ')).toEqual([DEFAULT]);
    expect(parseSearchGlobs('../etc/*.md')).toEqual([DEFAULT]);
    expect(parseSearchGlobs('/abs/*.md')).toEqual([DEFAULT]);
    expect(
      loadConfig({ NODE_ENV: 'test', CONTEXT_SEARCH_GLOBS: '**/notes/**/*.md' } as NodeJS.ProcessEnv)
        .contextSearchGlobs,
    ).toEqual(['**/notes/**/*.md']);
    expect(loadConfig({ NODE_ENV: 'test' } as NodeJS.ProcessEnv).contextSearchGlobs).toEqual([DEFAULT]);
  });
});
