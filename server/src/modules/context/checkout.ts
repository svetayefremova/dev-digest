import { readdir, readFile, stat } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { join } from 'node:path';
import { isDirectory, resolveInside } from '../_shared/checkout-fs.js';
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

export { isDirectory, resolveInside };

const EXCLUDED = new Set(EXCLUDED_DIRS);

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
