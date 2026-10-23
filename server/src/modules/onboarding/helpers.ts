import type {
  OnboardingCommand,
  OnboardingFirstTask,
  OnboardingRankedEntry,
  OnboardingRankedList,
  OnboardingReason,
  OnboardingTour,
} from '@devdigest/shared';
import { isJunkPath } from '../repo-intel/constants.js';
import type { TourIndexFacts } from '../repo-intel/types.js';
import {
  ALLOWED_FILE_NAMES,
  COUNT_CLAIM_RE,
  EXCERPT_CHAR_CAP,
  FIRST_TASK_CAP,
  LIST_CAP,
  MAX_COMMANDS,
  REASONED_ENTRIES,
} from './constants.js';
import type { OnboardingModelOutput } from './model-output.js';
import type { GroundedOutput, RunFacts, TourFacts } from './types.js';

// ---------------------------------------------------------------------------
// Ranking (AC-12, AC-13, AC-58)
// ---------------------------------------------------------------------------

/** PageRank × (1 + hotness); hotness is 0/unavailable → PageRank alone (AC-12). */
export function fileRank(pagerank: number, hotness: number | null | undefined): number {
  return pagerank * (1 + (hotness || 0));
}

export interface Candidate {
  path: string;
  rank: number;
}

function rankMap(facts: TourIndexFacts): Map<string, number> {
  return new Map(facts.ranked.map((r) => [r.path, fileRank(r.pagerank, r.hotness)]));
}

function byRankDesc(a: Candidate, b: Candidate): number {
  return b.rank - a.rank || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}

/** Chain files ∪ endpoint files ∪ imported files; non-junk, deduped, by rank desc. */
export function criticalCandidates(facts: TourIndexFacts): Candidate[] {
  const ranks = rankMap(facts);
  const paths = new Set<string>(facts.criticalPathFiles);
  for (const [p, n] of Object.entries(facts.endpoints)) if (n > 0) paths.add(p);
  for (const [p, n] of Object.entries(facts.importers)) if (n > 0) paths.add(p);
  return [...paths]
    .filter((p) => !isJunkPath(p))
    .map((path) => ({ path, rank: ranks.get(path) ?? 0 }))
    .sort(byRankDesc);
}

/** All ranked non-junk files by rank desc. */
export function readingCandidates(facts: TourIndexFacts): Candidate[] {
  return facts.ranked
    .filter((r) => !isJunkPath(r.path))
    .map((r) => ({ path: r.path, rank: fileRank(r.pagerank, r.hotness) }))
    .sort(byRankDesc);
}

/** First LIST_CAP candidates with their index facts; `truncated` when the cap cut any. */
export function rankList(candidates: Candidate[], facts: TourIndexFacts): OnboardingRankedList {
  const entries: OnboardingRankedEntry[] = candidates.slice(0, LIST_CAP).map((c) => ({
    path: c.path,
    rank: c.rank,
    importers: facts.importers[c.path] ?? 0,
    endpoints: facts.endpoints[c.path] ?? 0,
    reason: null,
  }));
  return { entries, truncated: candidates.length > LIST_CAP };
}

/** ≤3 importers Low, 4–10 Medium, >10 High; a directory is always Low (AC-17). */
export function complexityFor(importers: number, isDirectory: boolean): OnboardingFirstTask['complexity'] {
  if (isDirectory) return 'low';
  if (importers <= 3) return 'low';
  if (importers <= 10) return 'medium';
  return 'high';
}

// ---------------------------------------------------------------------------
// Run facts (AC-15, AC-18, AC-21)
// ---------------------------------------------------------------------------

const SCRIPT_PRIORITY = ['dev', 'start', 'build', 'test', 'lint', 'typecheck', 'db:migrate', 'db:seed'];

/**
 * Script names are repo-controlled and end up in a copyable shell command, so only plain
 * names (`build`, `test:e2e`, `lint-fix`) are offered. A name with spaces, `;`, `&&`, `|`,
 * `$`, quotes or a newline is skipped rather than shown as a trusted command.
 */
const SAFE_SCRIPT_NAME = /^[A-Za-z0-9][\w:.-]*$/;

/** Commands derivable from detected files only; empty when nothing was found. */
export function deriveCommands(input: {
  scripts: Record<string, string>;
  composeFile: string | null;
  envExampleNames: string[];
}): OnboardingCommand[] {
  const out: OnboardingCommand[] = [];
  if (input.envExampleNames.length > 0) {
    out.push({ command: 'cp .env.example .env', comment: null, source: 'env_example' });
  }
  if (input.composeFile) {
    out.push({ command: 'docker compose up', comment: null, source: 'compose' });
  }
  const names = Object.keys(input.scripts).filter((n) => SAFE_SCRIPT_NAME.test(n));
  const ordered = [
    ...SCRIPT_PRIORITY.filter((n) => names.includes(n)),
    ...names.filter((n) => !SCRIPT_PRIORITY.includes(n)).sort(),
  ];
  for (const name of ordered) {
    out.push({ command: `npm run ${name}`, comment: input.scripts[name] ?? null, source: 'package_script' });
  }
  return out.slice(0, MAX_COMMANDS);
}

/** Variable names only: values are never read into the prompt. */
export function envNamesOnly(text: string): string[] {
  const names = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
    if (m) names.add(m[1]!);
  }
  return [...names];
}

export function truncateExcerpt(text: string, cap = EXCERPT_CHAR_CAP): string {
  return text.length > cap ? text.slice(0, cap) : text;
}

const STACK_BY_DEP: Array<[string, string]> = [
  ['next', 'Next.js'],
  ['react', 'React'],
  ['vue', 'Vue'],
  ['svelte', 'Svelte'],
  ['fastify', 'Fastify'],
  ['express', 'Express'],
  ['@nestjs/core', 'NestJS'],
  ['hono', 'Hono'],
  ['drizzle-orm', 'Drizzle ORM'],
  ['prisma', 'Prisma'],
  ['@prisma/client', 'Prisma'],
  ['pg', 'PostgreSQL'],
  ['postgres', 'PostgreSQL'],
  ['mongoose', 'MongoDB'],
  ['zod', 'Zod'],
  ['tailwindcss', 'Tailwind CSS'],
  ['vitest', 'Vitest'],
  ['jest', 'Jest'],
  ['playwright', 'Playwright'],
  ['@playwright/test', 'Playwright'],
];

export function detectStack(run: RunFacts): string[] {
  const stack: string[] = [];
  const add = (s: string) => {
    if (!stack.includes(s)) stack.push(s);
  };
  if (run.deps.includes('typescript') || run.hasTsconfig) add('TypeScript');
  for (const [dep, label] of STACK_BY_DEP) if (run.deps.includes(dep)) add(label);
  if (run.composeFile) add('Docker Compose');
  return stack;
}

// ---------------------------------------------------------------------------
// Redaction: secrets never reach the provider or the persisted summary
// ---------------------------------------------------------------------------

export const REDACTED = '<redacted>';
/** A tracked secret must be at least this long and not a trivial value (see `isTrackableSecret`). */
const MIN_SECRET_LEN = 4;
const TRIVIAL_VALUES = new Set(['true', 'false', 'null', 'none', 'undefined', 'yes', 'no', 'on', 'off', 'test', 'todo', 'changeme']);
const SECRET_LINE_RE =
  /^(\s*(?:export\s+)?(?:-\s+)?["']?)([\w.-]+)(["']?\s*[:=]\s*)(\S.*)$/;
// Distinctive words: matched anywhere inside a key segment (accesstoken, DB_PASSWORD, secretkey).
const SECRET_SUBSTRINGS = ['secret', 'token', 'passw', 'credential', 'apikey', 'privatekey', 'authorization'];
// Short or ambiguous words: only as a whole segment, so `author` / `authors` never match.
const SECRET_SEGMENTS = new Set(['auth', 'pwd', 'pass']);
const SECRET_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['api', 'key'],
  ['private', 'key'],
  ['access', 'key'],
  ['secret', 'key'],
];

/** Splits on `_`, `-`, `.` and camelCase, then tests segments (not raw substrings). */
export function isSecretKey(key: string): boolean {
  const segs = key
    .replace(/([a-z\d])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .split(/[_.-]+/)
    .filter(Boolean);
  if (segs.some((g) => SECRET_SEGMENTS.has(g) || SECRET_SUBSTRINGS.some((w) => g.includes(w)))) return true;
  return segs.some((g, i) => SECRET_PAIRS.some(([x, y]) => g === x && segs[i + 1] === y));
}

/** Floor chosen: >= 4 chars, not purely digits, not a common literal (true/false/null/...). */
function isTrackableSecret(s: string): boolean {
  return s.length >= MIN_SECRET_LEN && !/^\d+$/.test(s) && !TRIVIAL_VALUES.has(s.toLowerCase());
}
const TOKEN_SHAPES: RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\bsk-[A-Za-z0-9_-]{16,}/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/g,
];

export interface Redacted {
  text: string;
  /** Original values that were replaced (for the output-side check). */
  secrets: string[];
}

function unquote(v: string): string {
  return v.trim().replace(/^["']|["']$/g, '');
}

function replaceTokenShapes(text: string, secrets: string[]): string {
  let out = text;
  for (const re of TOKEN_SHAPES) {
    out = out.replace(re, (m) => {
      secrets.push(m);
      return REDACTED;
    });
  }
  return out;
}

/** README / excerpt text: secret-keyed `KEY=value` / `key: value` values and well-known token shapes. */
export function redactText(text: string): Redacted {
  const secrets: string[] = [];
  const lines = replaceTokenShapes(text, secrets)
    .split(/\r?\n/)
    .map((line) => {
      const m = SECRET_LINE_RE.exec(line);
      if (!m || !isSecretKey(m[2]!)) return line;
      const value = unquote(m[4]!);
      if (value === '' || value === REDACTED) return line;
      secrets.push(value);
      return `${m[1]}${m[2]}${m[3]}${REDACTED}`;
    });
  return { text: lines.join('\n'), secrets: secrets.filter(isTrackableSecret) };
}

/** Compose: service names, images, ports, depends_on and env var NAMES stay; env values are replaced. */
export function redactCompose(text: string): Redacted {
  const secrets: string[] = [];
  let envIndent = -1;
  const lines = text.split(/\r?\n/).map((line) => {
    const indent = line.length - line.trimStart().length;
    if (envIndent >= 0) {
      if (line.trim() === '' || indent > envIndent) {
        const m = /^(\s*(?:-\s+)?["']?[A-Za-z_][\w.-]*["']?\s*[:=]\s*)(\S.*)$/.exec(line);
        if (m) {
          secrets.push(unquote(m[2]!));
          return `${m[1]}${REDACTED}`;
        }
        return line;
      }
      envIndent = -1;
    }
    const env = /^(\s*)environment:\s*(.*)$/.exec(line);
    if (env) {
      const rest = env[2]!.trim();
      if (rest === '' || rest.startsWith('#')) envIndent = indent;
      else if (rest.startsWith('{') || rest.startsWith('[')) return `${env[1]}environment: ${REDACTED}`;
    }
    return line;
  });
  const pass = redactText(lines.join('\n'));
  return {
    text: pass.text,
    secrets: [...secrets.filter(isTrackableSecret), ...pass.secrets],
  };
}

/** package.json: name, script commands and dependency names only. */
export function redactPackageJson(text: string): Redacted {
  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { text: '', secrets: [] };
  }
  const names = (v: unknown) => (v && typeof v === 'object' ? Object.keys(v) : []);
  const slim = {
    name: typeof pkg.name === 'string' ? pkg.name : undefined,
    scripts: pkg.scripts && typeof pkg.scripts === 'object' ? pkg.scripts : undefined,
    dependencies: names(pkg.dependencies),
    devDependencies: names(pkg.devDependencies),
  };
  return redactText(JSON.stringify(slim, null, 2));
}

export function containsSecret(text: string, secrets: readonly string[]): boolean {
  return secrets.some((s) => isTrackableSecret(s) && text.includes(s));
}

/** Model Markdown reaches the browser: drop images, unwrap links, remove bare URLs. */
export function stripMarkdownLinks(text: string | null): string | null {
  if (text == null) return null;
  const out = text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/!\[[^\]]*\]\[[^\]]*\]/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\[[^\]]*\]/g, '$1')
    .replace(/^\s*\[[^\]]+\]:\s*\S+.*$/gm, '')
    .replace(/<https?:\/\/[^>]*>/gi, '')
    .replace(/\bhttps?:\/\/\S+/gi, '');
  return out.trim() === '' ? null : out;
}

// ---------------------------------------------------------------------------
// Grounding (AC-14, AC-15, AC-16, AC-51)
// ---------------------------------------------------------------------------

const dirCache = new WeakMap<ReadonlySet<string>, Set<string>>();

function ancestorDirs(paths: ReadonlySet<string>): Set<string> {
  let dirs = dirCache.get(paths);
  if (dirs) return dirs;
  dirs = new Set<string>();
  for (const p of paths) {
    let i = p.lastIndexOf('/');
    while (i > 0) {
      const d = p.slice(0, i);
      if (dirs.has(d)) break;
      dirs.add(d);
      i = d.lastIndexOf('/');
    }
  }
  dirCache.set(paths, dirs);
  return dirs;
}

function normalizePath(token: string): string {
  return token.replace(/^\.\//, '').replace(/\/+$/, '');
}

function pathKnown(token: string, indexed: ReadonlySet<string>, allowlist: ReadonlySet<string>): boolean {
  const p = normalizePath(token);
  return indexed.has(p) || allowlist.has(p) || ancestorDirs(indexed).has(p);
}

const FILE_EXT = '(?:ts|tsx|js|jsx|mjs|cjs|json|md|ya?ml|sql|css|html|sh|toml)';
const BACKTICK_RE = /`([^`\n]+)`/g;
const BACKTICK_PATHLIKE_RE = new RegExp(`^[\\w@.-]+\\.${FILE_EXT}$`);
const SLASH_FILE_RE = new RegExp(
  `(?<![\\w@./-])(?:\\.?/)?[\\w@.-]+(?:/[\\w@.\\-\\[\\]]+)+\\.${FILE_EXT}\\b`,
  'g',
);

/**
 * False when the text names a path (backticked path-like token, or any
 * `dir/file.ext` token) that is neither indexed nor allowlisted. Plain
 * identifiers, versions and protocols (`OAuth2`, `http/2`) never count.
 */
export function isGroundedText(
  text: string,
  indexedPaths: ReadonlySet<string>,
  allowlist: ReadonlySet<string>,
): boolean {
  for (const m of text.matchAll(BACKTICK_RE)) {
    const token = m[1]!.trim();
    if (/\s/.test(token)) continue;
    if (!token.includes('/') && !BACKTICK_PATHLIKE_RE.test(token)) continue;
    if (!pathKnown(token, indexedPaths, allowlist)) return false;
  }
  for (const m of text.matchAll(SLASH_FILE_RE)) {
    if (!pathKnown(m[0], indexedPaths, allowlist)) return false;
  }
  return true;
}

export interface GroundingContext {
  indexedPaths: ReadonlySet<string>;
  allowlist: ReadonlySet<string>;
  topLevelDirs: readonly string[];
  derivedCommands: readonly OnboardingCommand[];
  /** Original secret values redacted from the prompt input; model text echoing any is dropped. */
  secrets?: readonly string[];
}

export function buildAllowlist(topLevelDirs: readonly string[]): Set<string> {
  return new Set<string>([...topLevelDirs, ...ALLOWED_FILE_NAMES]);
}

/** A first-task target: an indexed file, or a directory holding at least one indexed file (AC-51). */
function isKnownTarget(path: string, ctx: GroundingContext): boolean {
  const p = normalizePath(path);
  if (!p) return false;
  return pathKnown(p, ctx.indexedPaths, NO_ALLOWLIST);
}

const NO_ALLOWLIST: ReadonlySet<string> = new Set<string>();

/** Drop everything the index/checkout cannot back up. */
export function groundModelOutput(output: OnboardingModelOutput, ctx: GroundingContext): GroundedOutput {
  const secrets = ctx.secrets ?? [];
  const clean = (s: string) => !containsSecret(s, secrets);
  const text = (s: string | null) =>
    s && s.trim() !== '' && clean(s) && isGroundedText(s, ctx.indexedPaths, ctx.allowlist) ? s : null;
  const summary = stripMarkdownLinks(output.architecture.summary);
  const reasons = (list: Array<{ path: string; reason: string }>) =>
    list
      .filter(
        (r) =>
          ctx.indexedPaths.has(normalizePath(r.path)) &&
          r.reason.trim() !== '' &&
          clean(r.reason) &&
          isGroundedText(r.reason, ctx.indexedPaths, ctx.allowlist) &&
          !COUNT_CLAIM_RE.test(r.reason),
      )
      .map((r) => ({ path: normalizePath(r.path), reason: r.reason.trim() }))
      .slice(0, REASONED_ENTRIES);

  const derived = new Set(ctx.derivedCommands.map((c) => c.command));
  return {
    summary: text(summary),
    diagram: text(output.architecture.diagram),
    criticalReasons: reasons(output.criticalPathReasons),
    readingReasons: reasons(output.readingPathReasons),
    runCommands: output.runCommands.map((c) => c.trim()).filter((c) => derived.has(c)),
    firstTasks: output.firstTasks
      .filter((t) => isKnownTarget(t.path, ctx) && clean(t.title) && isGroundedText(t.title, ctx.indexedPaths, ctx.allowlist))
      .map((t) => ({ title: t.title.trim(), path: normalizePath(t.path) }))
      .slice(0, FIRST_TASK_CAP),
  };
}

// ---------------------------------------------------------------------------
// Tour assembly (AC-26, AC-31, AC-56, AC-57)
// ---------------------------------------------------------------------------

/** Reasons that describe the index/flag, not the model: a zero-file index never overrides them. */
const FACT_REASONS: readonly OnboardingReason[] = ['flag_off', 'index_failed', 'no_data'];

/** Facts-only tour: no model text, all reasons null, no first tasks. */
export function buildSkeleton(facts: TourFacts, reason: OnboardingReason | null): OnboardingTour {
  const effective: OnboardingReason | null =
    facts.index.filesIndexed === 0 && !(reason && FACT_REASONS.includes(reason))
      ? 'no_supported_files'
      : reason;
  return {
    mode: 'skeleton',
    reason: effective,
    architecture: {
      summary: null,
      diagram: null,
      stack: detectStack(facts.run),
      topLevelDirs: facts.run.topLevelDirs,
    },
    criticalPaths: rankList(criticalCandidates(facts.intel), facts.intel),
    readingPath: rankList(readingCandidates(facts.intel), facts.intel),
    runLocally: {
      commands: deriveCommands(facts.run),
      envVars: facts.run.envExampleNames,
    },
    firstTasks: null,
    index: facts.index,
    generatedAt: null,
  };
}

function withReasons(
  list: OnboardingRankedList,
  reasons: Array<{ path: string; reason: string }>,
): OnboardingRankedList {
  const byPath = new Map(reasons.map((r) => [r.path, r.reason]));
  return {
    truncated: list.truncated,
    entries: list.entries.map((e, i) => ({
      ...e,
      reason: i < REASONED_ENTRIES ? (byPath.get(e.path) ?? null) : null,
    })),
  };
}

/** Skeleton + grounded model prose. Persisted commands always come from `deriveCommands`. */
export function mergeGenerated(
  skeleton: OnboardingTour,
  grounded: GroundedOutput,
  facts: TourFacts,
  generatedAt: string,
): OnboardingTour {
  const indexed = new Set(facts.intel.indexedPaths);
  const firstTasks: OnboardingFirstTask[] = grounded.firstTasks.map((t) => {
    const isDirectory = !indexed.has(t.path);
    const importers = isDirectory ? 0 : (facts.intel.importers[t.path] ?? 0);
    return {
      title: t.title,
      path: t.path,
      isDirectory,
      importers,
      complexity: complexityFor(importers, isDirectory),
    };
  });
  return {
    ...skeleton,
    mode: 'generated',
    reason: null,
    architecture: {
      ...skeleton.architecture,
      summary: grounded.summary,
      diagram: grounded.diagram,
    },
    criticalPaths: withReasons(skeleton.criticalPaths, grounded.criticalReasons),
    readingPath: withReasons(skeleton.readingPath, grounded.readingReasons),
    firstTasks,
    generatedAt,
  };
}
