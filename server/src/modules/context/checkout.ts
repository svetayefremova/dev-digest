import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { join, resolve, sep, isAbsolute } from 'node:path';
import { EXCLUDED_DIRS, MAX_DOCS, MAX_DOC_BYTES } from './constants.js';
import { compileGlobs, isMarkdown } from './helpers.js';

export interface ScannedFile {
  path: string;
  size: number;
  mtimeMs: number;
}

export type ReadDocResult =
  | { ok: true; text: string; size: number; mtimeMs: number; abs: string }
  | { ok: false; reason: 'missing' | 'too_large' | 'unreadable' | 'outside' };

const EXCLUDED = new Set(EXCLUDED_DIRS);

export async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

/** Every `.md` under the checkout matching the search globs (symlinks never followed), sorted, capped at MAX_DOCS. */
export async function scanMarkdown(
  clonePath: string,
  globs: readonly string[],
): Promise<{ files: ScannedFile[]; truncated: boolean }> {
  const out: ScannedFile[] = [];
  await walk(clonePath, '', out, compileGlobs(globs));
  out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const truncated = out.length > MAX_DOCS;
  return { files: truncated ? out.slice(0, MAX_DOCS) : out, truncated };
}

async function walk(
  root: string,
  rel: string,
  out: ScannedFile[],
  matches: (path: string) => boolean,
): Promise<void> {
  let entries: Dirent[];
  try {
    entries = (await readdir(join(root, rel), { withFileTypes: true })) as Dirent[];
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const childRel = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (EXCLUDED.has(entry.name)) continue;
      await walk(root, childRel, out, matches);
      continue;
    }
    if (!entry.isFile() || !isMarkdown(entry.name) || !matches(childRel)) continue;
    try {
      const s = await stat(join(root, childRel));
      out.push({ path: childRel, size: s.size, mtimeMs: s.mtimeMs });
    } catch {
      // vanished between readdir and stat
    }
  }
}

/**
 * Absolute path of `rel` inside the checkout, or null when it escapes it
 * (absolute, `..`, NUL, or any symlink on the path). A missing file passes
 * the lexical check and resolves to its lexical path so callers report "missing".
 */
export async function resolveInside(clonePath: string, rel: string): Promise<string | null> {
  if (!rel || rel.includes('\0') || isAbsolute(rel)) return null;
  if (rel.split(/[\\/]/).some((seg) => seg === '..')) return null;
  const root = resolve(clonePath);
  const file = resolve(root, rel);
  if (!file.startsWith(root + sep)) return null;
  let realRoot: string;
  let realFile: string;
  try {
    realRoot = await realpath(root);
    realFile = await realpath(file);
  } catch {
    return file;
  }
  // Refuse symlinks anywhere on the path (even ones staying inside the checkout,
  // e.g. `docs/guide.md` -> `../.git/config`): the real path must equal the lexical one.
  const expected = join(realRoot, file.slice(root.length + 1));
  return realFile === expected ? realFile : null;
}

const decoder = new TextDecoder('utf-8', { fatal: true });

export async function readDoc(clonePath: string, rel: string): Promise<ReadDocResult> {
  const abs = await resolveInside(clonePath, rel);
  if (!abs) return { ok: false, reason: 'outside' };
  let s;
  try {
    s = await stat(abs);
  } catch {
    return { ok: false, reason: 'missing' };
  }
  if (!s.isFile()) return { ok: false, reason: 'missing' };
  if (s.size > MAX_DOC_BYTES) return { ok: false, reason: 'too_large' };
  try {
    const text = decoder.decode(await readFile(abs));
    if (text.includes('\u0000')) return { ok: false, reason: 'unreadable' };
    return { ok: true, text, size: s.size, mtimeMs: s.mtimeMs, abs };
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
}
