import { realpath, stat } from 'node:fs/promises';
import { join, resolve, sep, isAbsolute } from 'node:path';

export async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
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
