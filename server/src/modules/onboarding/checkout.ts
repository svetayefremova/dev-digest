import { readFile, readdir, stat } from 'node:fs/promises';
import { EXCLUDED_DIRS } from '../repo-intel/constants.js';
import { isDirectory, resolveInside } from '../_shared/checkout-fs.js';
import { COMPOSE_FILES, MAX_READ_BYTES, README_FILES } from './constants.js';
import { envNamesOnly, truncateExcerpt } from './helpers.js';
import type { Excerpt, RunFacts } from './types.js';

/** True when the repo's checkout directory exists on disk (AC-27). */
export async function cloneExists(clonePath: string): Promise<boolean> {
  return isDirectory(clonePath);
}

/** Text of a file inside the checkout, or null (missing, outside, too large, binary). Never throws. */
async function readText(clonePath: string, rel: string): Promise<string | null> {
  try {
    const abs = await resolveInside(clonePath, rel);
    if (!abs) return null;
    const s = await stat(abs);
    if (!s.isFile() || s.size > MAX_READ_BYTES) return null;
    const text = await readFile(abs, 'utf8');
    return text.includes('\u0000') ? null : text;
  } catch {
    return null;
  }
}

async function firstExisting(
  clonePath: string,
  names: readonly string[],
): Promise<{ name: string; text: string } | null> {
  for (const name of names) {
    const text = await readText(clonePath, name);
    if (text !== null) return { name, text };
  }
  return null;
}

const EMPTY_RUN_FACTS: RunFacts = {
  scripts: {},
  deps: [],
  envExampleNames: [],
  composeFile: null,
  composeText: null,
  readme: null,
  packageJsonText: null,
  topLevelDirs: [],
  hasTsconfig: false,
};

/** Deterministic facts read from the checkout. Never throws. */
export async function readRunFacts(clonePath: string): Promise<RunFacts> {
  try {
    const facts: RunFacts = { ...EMPTY_RUN_FACTS };

    const pkgText = await readText(clonePath, 'package.json');
    if (pkgText !== null) {
      facts.packageJsonText = pkgText;
      try {
        const pkg = JSON.parse(pkgText) as {
          scripts?: Record<string, unknown>;
          dependencies?: Record<string, unknown>;
          devDependencies?: Record<string, unknown>;
        };
        facts.scripts = Object.fromEntries(
          Object.entries(pkg.scripts ?? {}).filter(([, v]) => typeof v === 'string'),
        ) as Record<string, string>;
        facts.deps = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})];
      } catch {
        // malformed package.json: keep the empty script/dep facts
      }
    }

    const env = await readText(clonePath, '.env.example');
    if (env !== null) facts.envExampleNames = envNamesOnly(env);

    const compose = await firstExisting(clonePath, COMPOSE_FILES);
    if (compose) {
      facts.composeFile = compose.name;
      facts.composeText = compose.text;
    }

    const readme = await firstExisting(clonePath, README_FILES);
    if (readme) facts.readme = readme.text;

    facts.hasTsconfig = (await readText(clonePath, 'tsconfig.json')) !== null;

    const entries = await readdir(clonePath, { withFileTypes: true });
    const excluded = new Set<string>(EXCLUDED_DIRS);
    facts.topLevelDirs = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !excluded.has(e.name))
      .map((e) => e.name)
      .sort();
    return facts;
  } catch {
    return { ...EMPTY_RUN_FACTS };
  }
}

/** Capped excerpts of the given repo-relative files (missing ones are skipped). */
export async function readExcerpts(clonePath: string, paths: readonly string[]): Promise<Excerpt[]> {
  const out: Excerpt[] = [];
  for (const path of paths) {
    const text = await readText(clonePath, path);
    if (text !== null && text.trim() !== '') out.push({ label: path, text: truncateExcerpt(text) });
  }
  return out;
}
