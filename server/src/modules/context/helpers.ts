import type { DocCategory } from '@devdigest/shared';
import { CATEGORY_DIRS, EXCLUDED_DIRS } from './constants.js';

/** Category = the nearest folder (deepest first) named specs/docs/insights; else `other`. */
export function categoryOf(path: string): DocCategory {
  const dirs = path.split('/').slice(0, -1);
  for (let i = dirs.length - 1; i >= 0; i--) {
    const dir = dirs[i]!;
    if ((CATEGORY_DIRS as readonly string[]).includes(dir)) return dir as DocCategory;
  }
  return 'other';
}

/** Glob → RegExp over posix paths: `**` (any depth), `*`, `?`, `{a,b}`. */
export function globToRegExp(glob: string): RegExp {
  let re = '';
  let braces = 0;
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i]!;
    if (ch === '*') {
      if (glob[i + 1] === '*') {
        i++;
        if (glob[i + 1] === '/') {
          i++;
          re += '(?:.*/)?';
        } else re += '.*';
      } else re += '[^/]*';
    } else if (ch === '?') re += '[^/]';
    else if (ch === '{') {
      braces++;
      re += '(?:';
    } else if (ch === '}' && braces > 0) {
      braces--;
      re += ')';
    } else if (ch === ',' && braces > 0) re += '|';
    else re += ch.replace(/[.+^$()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

/** Matcher for any of the globs (case-sensitive). */
export function compileGlobs(globs: readonly string[]): (path: string) => boolean {
  const res = globs.map(globToRegExp);
  return (path) => res.some((r) => r.test(path));
}

/** Folder names a glob set searches, for the empty-state hint (e.g. specs, docs, insights). */
export function searchedFolders(globs: readonly string[]): string[] {
  const names = new Set<string>();
  for (const g of globs) {
    const brace = /\{([^}]*)\}/.exec(g);
    if (brace) for (const n of brace[1]!.split(',')) if (/^[\w.-]+$/.test(n.trim())) names.add(n.trim());
    for (const seg of g.split('/').slice(0, -1)) if (/^[\w.-]+$/.test(seg)) names.add(seg);
  }
  return [...names];
}

export function isMarkdown(path: string): boolean {
  return path.toLowerCase().endsWith('.md');
}

/** Drop repeated paths; the first occurrence keeps its position. */
export function dedupePaths(paths: string[]): string[] {
  return [...new Set(paths)];
}

/**
 * A path the context API may read or store: relative, posix, no traversal, `.md`,
 * and not under a directory the scan skips (`.git`, `node_modules`, `vendor`).
 */
export function isValidAttachmentPath(path: string): boolean {
  if (!isMarkdown(path)) return false;
  if (path.includes('\0') || path.includes('\\')) return false;
  if (path.startsWith('/') || /^[A-Za-z]:/.test(path)) return false;
  return !path
    .split('/')
    .some((seg) => seg === '..' || seg === '' || seg === '.' || EXCLUDED_DIRS.includes(seg));
}
