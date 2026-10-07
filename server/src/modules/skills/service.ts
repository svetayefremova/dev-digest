import type { Container } from '../../platform/container.js';
import type {
  Skill,
  SkillImportPreview,
  SkillSource,
  SkillStats,
  SkillType,
  SkillUsage,
  SkillVersion,
} from '@devdigest/shared';
import { SkillsRepository, type SkillRow, type SkillUsageCounts } from './repository.js';
import { pct, toSkillDto, toSkillVersionDto } from './helpers.js';
import { buildImportPreview } from './import.js';
import { FINDING_CATEGORIES, VERSION_MESSAGES } from './constants.js';

/**
 * Skills service. A skill is a reusable block of review instructions — name,
 * description, type and a markdown body — that agents link to. It is text only:
 * it carries no tools and nothing in it is executed.
 */

export interface CreateSkillInput {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  source?: Extract<SkillSource, 'manual' | 'imported_file'>;
  enabled?: boolean;
  /** Message for version 1; defaulted when absent/blank. */
  message?: string;
  /** Name of the uploaded file an import came from (default message only). */
  source_file?: string;
}

export interface UpdateSkillInput {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
  /** Message for the version a body change creates; ignored otherwise. */
  message?: string;
}

/** Thrown-free result of a restore, so the route can pick the right 404. */
export type RestoreOutcome = { skill: Skill } | { missing: 'skill' | 'version' };

export class SkillsService {
  private repo: SkillsRepository;

  constructor(private container: Container) {
    this.repo = new SkillsRepository(container.db);
  }

  /** `body_tokens` is derived, not stored: counted with the server tokenizer. */
  private toDto(row: SkillRow, usage?: SkillUsage): Skill {
    return toSkillDto(row, this.container.tokenizer.count(row.body), usage);
  }

  /** Every skill with its usage roll-up — two queries total, however many skills. */
  async list(workspaceId: string): Promise<Skill[]> {
    const [rows, counts] = await Promise.all([
      this.repo.list(workspaceId),
      this.repo.usageCounts(workspaceId),
    ]);
    const usage = new Map(counts.map((c) => [c.skillId, toUsage(c)]));
    return rows.map((row) =>
      this.toDto(row, usage.get(row.id) ?? { agents: 0, pull_pct: null, accept_pct: null }),
    );
  }

  async get(workspaceId: string, id: string): Promise<Skill | undefined> {
    const row = await this.repo.getById(workspaceId, id);
    return row ? this.toDto(row) : undefined;
  }

  async create(workspaceId: string, input: CreateSkillInput): Promise<Skill> {
    const source = input.source ?? 'manual';
    const fallback =
      source === 'imported_file' ? VERSION_MESSAGES.imported(input.source_file) : VERSION_MESSAGES.initial;
    const row = await this.repo.insert({
      workspaceId,
      name: input.name,
      description: input.description,
      type: input.type,
      source,
      body: input.body,
      // Someone else's skill is someone else's instructions in the agent's
      // prompt: an imported skill is always stored disabled, whatever the
      // request says, until the user switches it on themselves.
      enabled: source === 'imported_file' ? false : (input.enabled ?? true),
      message: input.message || fallback,
    });
    return this.toDto(row);
  }

  async update(workspaceId: string, id: string, input: UpdateSkillInput): Promise<Skill | undefined> {
    const { message, ...patch } = input;
    const row = await this.repo.update(workspaceId, id, patch, message || VERSION_MESSAGES.updated);
    return row ? this.toDto(row) : undefined;
  }

  async delete(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.deleteById(workspaceId, id);
  }

  /** Body history, newest first; undefined when the skill isn't in the workspace. */
  async versions(workspaceId: string, id: string): Promise<SkillVersion[] | undefined> {
    const skill = await this.repo.getById(workspaceId, id);
    if (!skill) return undefined;
    const rows = await this.repo.listVersions(skill.id);
    return rows.map((row) => toSkillVersionDto(row, skill.version));
  }

  /** Restore = append a new version carrying the old body. */
  async restore(workspaceId: string, id: string, version: number): Promise<RestoreOutcome> {
    const result = await this.repo.restoreVersion(workspaceId, id, version, VERSION_MESSAGES.restored);
    return 'row' in result ? { skill: this.toDto(result.row) } : result;
  }

  /**
   * 30-day stats over completed runs. Attribution is per run: a run that
   * carried several skills credits its findings to each of them.
   */
  async stats(workspaceId: string, id: string): Promise<SkillStats | undefined> {
    const [counts] = await this.repo.usageCounts(workspaceId, id);
    if (!counts) return undefined; // not in this workspace
    const [agents, byCategory] = await Promise.all([
      this.repo.agentsUsing(workspaceId, id),
      this.repo.findingsByCategory(workspaceId, id),
    ]);
    const usage = toUsage(counts);
    return {
      used_by: agents.length,
      pull_pct: usage.pull_pct,
      accept_pct: usage.accept_pct,
      findings_30d: counts.findings,
      agents,
      // Always all five categories, fixed order, zeros included — a stable legend.
      by_category: FINDING_CATEGORIES.map((category) => ({
        category,
        count: byCategory.get(category) ?? 0,
      })),
    };
  }

  /** Parse an upload into a preview. Persists nothing — saving is a separate,
   *  explicit `create` once the user has confirmed what they saw. */
  previewImport(filename: string, contentBase64: string): SkillImportPreview {
    return buildImportPreview(filename, Buffer.from(contentBase64, 'base64'));
  }
}

/** Raw counters → the card roll-up. Percentages are null without a denominator. */
function toUsage(c: SkillUsageCounts): SkillUsage {
  return {
    agents: c.agents,
    pull_pct: pct(c.runsWithSkill, c.totalRuns),
    accept_pct: pct(c.accepted, c.accepted + c.dismissed),
  };
}
