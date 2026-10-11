import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import type { Container } from '../../platform/container.js';
import {
  ConventionCategory,
  type ConventionCandidate,
  type ConventionScan,
  type ConventionSkillCreated,
  type ConventionSkillDraft,
  type ConventionStatus,
  type SkillType,
} from '@devdigest/shared';
import { AppError, ExternalServiceError, NotFoundError, ValidationError } from '../../platform/errors.js';
import { renderPrompt } from '../../platform/prompts.js';
import { wrapUntrusted } from '../../platform/prompt.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import type { RepoRow } from '../repos/repository.js';
import { ConventionsRepository, type UpdateConvention } from './repository.js';
import {
  ConventionExtraction,
  buildSkillDraft,
  numberLines,
  sampleLines,
  toCandidateDto,
  toScanDto,
  verifyEvidence,
  type VerifiedCandidate,
} from './helpers.js';
import {
  CONFIG_FILE_CANDIDATES,
  EXTRACTED_VERSION_MESSAGE,
  EXTRACTION_PROMPT,
  EXTRACTION_SCHEMA_NAME,
  MAX_CANDIDATES,
  SAMPLE_FILE_COUNT,
} from './constants.js';

/**
 * Conventions service. A scan samples the repo in code, asks one model call for
 * candidate house rules, and keeps only those whose evidence is found in the
 * cloned files. The user accepts, rejects or edits candidates; the accepted
 * ones merge into a single skill that is linked to agents.
 */

export interface CreateConventionSkillInput {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  enabled: boolean;
  agent_ids: string[];
}

export class ConventionsService {
  private repo: ConventionsRepository;

  constructor(private container: Container) {
    this.repo = new ConventionsRepository(container.db);
  }

  private async requireRepo(workspaceId: string, repoId: string): Promise<RepoRow> {
    const repo = await this.container.reposRepo.getById(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    return repo;
  }

  private async scanDto(workspaceId: string, repoId: string): Promise<ConventionScan> {
    const [scan, rows] = await Promise.all([
      this.repo.getScan(workspaceId, repoId),
      this.repo.listVisible(workspaceId, repoId),
    ]);
    return toScanDto(repoId, scan, rows);
  }

  async get(workspaceId: string, repoId: string): Promise<ConventionScan> {
    await this.requireRepo(workspaceId, repoId);
    return this.scanDto(workspaceId, repoId);
  }

  /**
   * The files a scan reads, chosen in code — no model involved: the lint /
   * compiler / formatter configs present at the repo root, then the top-ranked
   * source files from repo-intel. Unreadable and empty files are left out.
   *
   * Read from the repo row's own `clonePath` (as repo-intel does), not through
   * `git.readFile`: that resolves against this process's clone dir, which is
   * not where the repo was cloned when the database is shared between checkouts.
   */
  private async readSamples(repo: RepoRow, clonePath: string): Promise<Map<string, string[]>> {
    const root = resolve(clonePath);
    const read = (path: string) => {
      const file = resolve(root, path);
      if (!file.startsWith(root + sep)) return Promise.resolve('');
      return readFile(file, 'utf8').catch(() => '');
    };
    const ranked = await this.container.repoIntel.getConventionSamples(repo.id, SAMPLE_FILE_COUNT);
    const paths = [...new Set([...CONFIG_FILE_CANDIDATES, ...ranked])];
    const contents = await Promise.all(paths.map(read));
    const files = new Map<string, string[]>();
    paths.forEach((path, i) => {
      if (contents[i]!.trim() !== '') files.set(path, sampleLines(contents[i]!));
    });
    return files;
  }

  /** Run a scan and persist its verified candidates. */
  async extract(workspaceId: string, repoId: string): Promise<ConventionScan> {
    const repo = await this.requireRepo(workspaceId, repoId);
    if (!repo.clonePath) throw new ValidationError('This repo has not been cloned yet.');

    const files = await this.readSamples(repo, repo.clonePath);
    if (files.size === 0) {
      throw new ValidationError('No files to analyse — the repo is not indexed yet, or its clone is missing on disk.');
    }

    const { provider, model } = await resolveFeatureModel(this.container, workspaceId, 'conventions');
    const system = await renderPrompt(EXTRACTION_PROMPT, {
      max_candidates: String(MAX_CANDIDATES),
      categories: ConventionCategory.options.join(', '),
    });
    const user = [...files].map(([path, lines]) => wrapUntrusted(path, numberLines(lines))).join('\n\n');

    let extraction: ConventionExtraction;
    try {
      const llm = await this.container.llm(provider);
      const result = await llm.completeStructured({
        model,
        schema: ConventionExtraction,
        schemaName: EXTRACTION_SCHEMA_NAME,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.1,
      });
      extraction = result.data;
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new ExternalServiceError(
        `Conventions analysis failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // Candidates without evidence in the files are discarded here.
    const verified = extraction.candidates
      .map((candidate) => verifyEvidence(candidate, files))
      .filter((c): c is VerifiedCandidate => c !== null)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, MAX_CANDIDATES);

    await this.repo.replaceScan(workspaceId, repoId, verified, { sampleFiles: files.size, model });
    return this.scanDto(workspaceId, repoId);
  }

  /** Accept / reject / edit one candidate. */
  async update(
    workspaceId: string,
    id: string,
    patch: UpdateConvention,
  ): Promise<ConventionCandidate | undefined> {
    const row = await this.repo.update(workspaceId, id, patch);
    return row ? toCandidateDto(row) : undefined;
  }

  async setAllStatus(
    workspaceId: string,
    repoId: string,
    status: Exclude<ConventionStatus, 'rejected'>,
  ): Promise<ConventionScan> {
    await this.requireRepo(workspaceId, repoId);
    await this.repo.setAllStatus(workspaceId, repoId, status);
    return this.scanDto(workspaceId, repoId);
  }

  /** The skill the accepted candidates would merge into. Saves nothing. */
  async skillDraft(workspaceId: string, repoId: string): Promise<ConventionSkillDraft> {
    const repo = await this.requireRepo(workspaceId, repoId);
    const accepted = await this.repo.listAccepted(workspaceId, repoId);
    if (accepted.length === 0) throw new ValidationError('Accept at least one convention first.');
    const draft = buildSkillDraft(repo.name, accepted);
    return {
      ...draft,
      type: 'convention',
      body_tokens: this.container.tokenizer.count(draft.body),
      conventions: accepted.length,
    };
  }

  /**
   * Save the (user-edited) draft as one skill and link it to the chosen agents,
   * at the end of each agent's skill order.
   */
  async createSkill(
    workspaceId: string,
    repoId: string,
    input: CreateConventionSkillInput,
  ): Promise<ConventionSkillCreated> {
    await this.requireRepo(workspaceId, repoId);
    const accepted = await this.repo.listAccepted(workspaceId, repoId);
    if (accepted.length === 0) throw new ValidationError('Accept at least one convention first.');

    const agentIds = [...new Set(input.agent_ids)];
    const agents = this.container.agentsRepo;
    const found = await Promise.all(agentIds.map((id) => agents.getById(workspaceId, id)));
    if (found.some((agent) => !agent)) throw new ValidationError('Unknown agent.');

    const skill = await this.container.skillsRepo.insert({
      workspaceId,
      name: input.name,
      description: input.description,
      type: input.type,
      source: 'extracted',
      body: input.body,
      enabled: input.enabled,
      evidenceFiles: [...new Set(accepted.map((row) => row.evidencePath ?? '').filter(Boolean))],
      message: EXTRACTED_VERSION_MESSAGE,
    });

    try {
      for (const agentId of agentIds) {
        const linked = await agents.linkedSkills(agentId);
        await agents.linkSkill(agentId, skill.id, linked.length);
        await agents.bumpVersion(workspaceId, agentId);
      }
    } catch (err) {
      // No skill without its agent links: deleting it cascades the links made so far.
      await this.container.skillsRepo.deleteById(workspaceId, skill.id);
      throw err;
    }
    return { skill_id: skill.id, name: skill.name, agent_ids: agentIds };
  }
}
