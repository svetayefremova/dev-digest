import type { Skill, SkillSource, SkillType, SkillUsage, SkillVersion } from '@devdigest/shared';
import type { SkillRow, SkillVersionRow } from '../../db/rows.js';
import { INITIAL_SKILL_VERSION, VERSION_MESSAGES } from './constants.js';

/**
 * Pure helpers for the skills module — DB row ⇄ DTO mapping and the prompt
 * block format. No I/O.
 */

/**
 * Map a persisted skill row to the public `Skill` DTO. `bodyTokens` is not a
 * column — the caller counts it with the server tokenizer.
 */
export function toSkillDto(row: SkillRow, bodyTokens: number, usage?: SkillUsage): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type as SkillType,
    source: row.source as SkillSource,
    body: row.body,
    enabled: row.enabled,
    version: row.version,
    evidence_files: row.evidenceFiles ?? null,
    body_tokens: bodyTokens,
    ...(usage ? { usage } : {}),
  };
}

/**
 * Map a version row to its DTO; `currentVersion` is the skill's live version.
 * Rows written before messages existed have an empty one — they read as the
 * default the server would have written.
 */
export function toSkillVersionDto(row: SkillVersionRow, currentVersion: number): SkillVersion {
  return {
    version: row.version,
    message:
      row.message ||
      (row.version === INITIAL_SKILL_VERSION ? VERSION_MESSAGES.initial : VERSION_MESSAGES.updated),
    body: row.body,
    created_at: row.createdAt.toISOString(),
    current: row.version === currentVersion,
  };
}

/** `part / whole` as a whole-number percentage 0–100; null when there is no whole. */
export function pct(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null;
}

/**
 * Render one skill as its own block of the prompt's `## Skills / rules`
 * section. The description leads because it is the skill's interface — it tells
 * the model when the body below applies.
 */
export function formatSkillBlock(skill: Pick<SkillRow, 'name' | 'description' | 'body'>): string {
  const description = skill.description.trim();
  return [`### Skill: ${skill.name}`, ...(description ? [description] : []), '', skill.body.trim()].join('\n');
}
