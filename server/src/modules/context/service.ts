import type { ContextAttachment, ContextDoc, ContextDocContent, ContextDocList } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import { RUN_TOKEN_BUDGET, MAX_DOC_BYTES, TRUNCATE_ITERATIONS } from './constants.js';
import { categoryOf, dedupePaths, isValidAttachmentPath, searchedFolders } from './helpers.js';
import { isDirectory, readDoc, resolveInside, scanMarkdown } from './checkout.js';
import { TokenCache } from './token-cache.js';

/** What a run gets from the attached documents; `specs` goes to reviewer-core as-is. */
export interface ResolvedContext {
  specs: string[];
  /** Paths actually injected, in order (a truncated document is included). */
  read: string[];
  /** Per injected document: path + tokens of its labelled chunk (as injected). */
  readDocs: { path: string; tokens: number }[];
  tokens: number | null;
  /** Human-readable, content-free problems shown in the run trace. */
  warnings: string[];
  /** Paths that were skipped, truncated or dropped (for the server log). */
  skipped: string[];
}

const EMPTY_RESOLVED: ResolvedContext = { specs: [], read: [], readDocs: [], tokens: null, warnings: [], skipped: [] };
const SCAN_BATCH = 32;

export class ContextService {
  private readonly tokenCache: TokenCache;

  constructor(private readonly container: Container) {
    this.tokenCache = new TokenCache(container.tokenizer);
  }

  private async requireRepo(workspaceId: string, repoId: string) {
    const repo = await this.container.reposRepo.getById(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    return repo;
  }

  /** Every `.md` in the repo's checkout with category, tokens and used-by count. */
  async list(workspaceId: string, repoId: string): Promise<ContextDocList> {
    const repo = await this.requireRepo(workspaceId, repoId);
    const scannedAt = new Date().toISOString();
    const globs = this.container.config.contextSearchGlobs;
    const searchRoots = searchedFolders(globs);
    if (!repo.clonePath || !(await isDirectory(repo.clonePath))) {
      return { cloned: false, docs: [], truncated: false, total_tokens: 0, scanned_at: scannedAt, search_roots: searchRoots };
    }
    const clonePath = repo.clonePath;
    const { files, truncated } = await scanMarkdown(clonePath, globs);
    const usedBy = await this.container.contextRepo.usedByAgentCounts(workspaceId);

    const docs: ContextDoc[] = [];
    for (let i = 0; i < files.length; i += SCAN_BATCH) {
      const batch = files.slice(i, i + SCAN_BATCH);
      const built = await Promise.all(
        batch.map(async (file): Promise<ContextDoc> => {
          const read = file.size > MAX_DOC_BYTES ? null : await readDoc(clonePath, file.path);
          const text = read?.ok ? read.text : null;
          const tokens =
            read?.ok && text !== null
              ? this.tokenCache.count(read.abs, file.mtimeMs, file.size, () => text)
              : null;
          return {
            path: file.path,
            category: categoryOf(file.path),
            tokens,
            size: file.size,
            updated_at: new Date(file.mtimeMs).toISOString(),
            previewable: tokens !== null,
            used_by_agents: usedBy.get(file.path) ?? 0,
          };
        }),
      );
      docs.push(...built);
    }

    const totalTokens = docs.reduce((sum, d) => sum + (d.tokens ?? 0), 0);
    return { cloned: true, docs, truncated, total_tokens: totalTokens, scanned_at: scannedAt, search_roots: searchRoots };
  }

  /** One document's text for the preview; never returns content for a path outside the checkout. */
  async read(workspaceId: string, repoId: string, path: string): Promise<ContextDocContent> {
    const repo = await this.requireRepo(workspaceId, repoId);
    if (!repo.clonePath) throw new ValidationError('This repo has not been cloned yet.');
    // Only listable Markdown documents: never `.git/config` (clone token), `.env`, etc.
    if (!isValidAttachmentPath(path)) throw new ValidationError('Invalid document path.');
    if (!(await resolveInside(repo.clonePath, path))) throw new ValidationError('Invalid document path.');
    const result = await readDoc(repo.clonePath, path);
    if (result.ok) return { path, content: result.text, reason: null };
    if (result.reason === 'outside') throw new ValidationError('Invalid document path.');
    if (result.reason === 'missing') throw new NotFoundError('Document not found');
    return { path, content: null, reason: result.reason };
  }

  async getAgentDocs(workspaceId: string, agentId: string): Promise<ContextAttachment[]> {
    await this.requireAgent(workspaceId, agentId);
    return this.container.contextRepo.listForAgent(agentId);
  }

  async setAgentDocs(workspaceId: string, agentId: string, paths: string[]): Promise<ContextAttachment[]> {
    await this.requireAgent(workspaceId, agentId);
    this.validatePaths(paths);
    await this.container.contextRepo.setForAgent(agentId, paths);
    return this.container.contextRepo.listForAgent(agentId);
  }

  async getSkillDocs(workspaceId: string, skillId: string): Promise<ContextAttachment[]> {
    await this.requireSkill(workspaceId, skillId);
    return this.container.contextRepo.listForSkill(skillId);
  }

  async setSkillDocs(workspaceId: string, skillId: string, paths: string[]): Promise<ContextAttachment[]> {
    await this.requireSkill(workspaceId, skillId);
    this.validatePaths(paths);
    await this.container.contextRepo.setForSkill(skillId, paths);
    return this.container.contextRepo.listForSkill(skillId);
  }

  private async requireAgent(workspaceId: string, agentId: string): Promise<void> {
    if (!(await this.container.agentsRepo.getById(workspaceId, agentId))) throw new NotFoundError('Agent not found');
  }

  private async requireSkill(workspaceId: string, skillId: string): Promise<void> {
    if (!(await this.container.skillsRepo.getById(workspaceId, skillId))) throw new NotFoundError('Skill not found');
  }

  private validatePaths(paths: string[]): void {
    for (const p of paths) {
      if (!isValidAttachmentPath(p)) throw new ValidationError(`Invalid document path: ${p}`);
    }
    if (new Set(paths).size !== paths.length) throw new ValidationError('Duplicate document paths');
  }

  /**
   * Read the agent's attached documents (agent first, then enabled skills,
   * deduplicated) from the checkout, within RUN_TOKEN_BUDGET. Problems become
   * warnings; the run always continues.
   */
  async resolveForRun(clonePath: string | null, agentId: string): Promise<ResolvedContext> {
    const paths = dedupePaths(await this.container.contextRepo.docsForRun(agentId));
    if (paths.length === 0) return EMPTY_RESOLVED;
    if (!clonePath || !(await isDirectory(clonePath))) {
      return { ...EMPTY_RESOLVED, warnings: ['Project context skipped: repository checkout unavailable'], skipped: paths };
    }

    const tokenizer = this.container.tokenizer;
    const specs: string[] = [];
    const read: string[] = [];
    const readDocs: { path: string; tokens: number }[] = [];
    const warnings: string[] = [];
    const skipped: string[] = [];
    const dropped: string[] = [];
    let truncatedPath: string | null = null;
    let used = 0;
    let full = false;

    for (const path of paths) {
      const doc = await readDoc(clonePath, path);
      if (!doc.ok) {
        warnings.push(
          doc.reason === 'missing'
            ? `Attached document not found: ${path}`
            : `Attached document skipped (too large or unreadable): ${path}`,
        );
        skipped.push(path);
        continue;
      }
      if (full) {
        dropped.push(path);
        continue;
      }
      const chunk = `### ${path}\n\n${doc.text}`;
      const n = tokenizer.count(chunk);
      if (used + n <= RUN_TOKEN_BUDGET) {
        specs.push(chunk);
        read.push(path);
        readDocs.push({ path, tokens: n });
        used += n;
        continue;
      }
      full = true;
      const cut = this.cutToBudget(chunk, RUN_TOKEN_BUDGET - used);
      if (cut) {
        specs.push(cut);
        read.push(path);
        readDocs.push({ path, tokens: tokenizer.count(cut) });
        truncatedPath = path;
      } else {
        dropped.push(path);
      }
    }

    if (truncatedPath !== null || dropped.length > 0) {
      const parts = ['Notice: project context exceeded 8,000 tokens.'];
      if (truncatedPath !== null) parts.push(`Truncated: ${truncatedPath}.`);
      if (dropped.length > 0) parts.push(`Dropped: ${dropped.join(', ')}.`);
      const notice = parts.join(' ');
      specs.push(notice);
      warnings.push(notice);
      if (truncatedPath !== null) skipped.push(truncatedPath);
      skipped.push(...dropped);
    }

    if (specs.length === 0) return { ...EMPTY_RESOLVED, warnings, skipped };
    return { specs, read, readDocs, tokens: tokenizer.count(specs.join('\n\n')), warnings, skipped };
  }

  /** Longest prefix of `text` within `budget` tokens (binary search on characters); null when nothing fits. */
  private cutToBudget(text: string, budget: number): string | null {
    if (budget <= 0) return null;
    const tokenizer = this.container.tokenizer;
    let lo = 0;
    let hi = text.length;
    for (let i = 0; i < TRUNCATE_ITERATIONS && lo < hi; i++) {
      const mid = Math.ceil((lo + hi) / 2);
      if (tokenizer.count(text.slice(0, mid)) <= budget) lo = mid;
      else hi = mid - 1;
    }
    return lo > 0 ? text.slice(0, lo) : null;
  }
}
