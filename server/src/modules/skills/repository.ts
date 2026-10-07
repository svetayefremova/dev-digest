import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { SkillSource, SkillType } from '@devdigest/shared';
import type { SkillRow, SkillVersionRow } from '../../db/rows.js';
import { COMPLETED_RUN_STATUS, INITIAL_SKILL_VERSION, STATS_WINDOW_DAYS } from './constants.js';

/**
 * Skills data-access. Owns `skills` and `skill_versions`; the `agent_skills`
 * link table is owned from the agent side (agents repository) and
 * `agent_run_skills` is written by the review run — both are only READ here,
 * for usage/stats. Workspace-scoped throughout — the DB is the source of truth
 * for skills.
 */

export type { SkillRow, SkillVersionRow };

/** Raw 30-day counters for one skill; the service turns them into percentages. */
export interface SkillUsageCounts {
  skillId: string;
  /** Agents with an enabled link to the skill. */
  agents: number;
  /** Completed runs in the workspace inside the window (same for every skill). */
  totalRuns: number;
  /** Of those, the runs whose prompt carried the skill. */
  runsWithSkill: number;
  /** Findings of the runs that carried the skill. */
  findings: number;
  accepted: number;
  dismissed: number;
}

/** Outcome of a restore: the updated row, or which lookup missed. */
export type RestoreResult = { row: SkillRow } | { missing: 'skill' | 'version' };

export interface InsertSkill {
  workspaceId: string;
  name: string;
  description: string;
  type: SkillType;
  source: SkillSource;
  body: string;
  enabled: boolean;
  /** Message recorded on version 1. */
  message: string;
}

export interface UpdateSkill {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
}

export class SkillsRepository {
  constructor(private db: Db) {}

  async list(workspaceId: string): Promise<SkillRow[]> {
    return this.db
      .select()
      .from(t.skills)
      .where(eq(t.skills.workspaceId, workspaceId))
      .orderBy(asc(t.skills.createdAt), asc(t.skills.name));
  }

  async getById(workspaceId: string, id: string): Promise<SkillRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)));
    return row;
  }

  /** Insert a skill AND record version 1 of its body, atomically. */
  async insert({ message, ...values }: InsertSkill): Promise<SkillRow> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(t.skills)
        .values({ ...values, version: INITIAL_SKILL_VERSION })
        .returning();
      await tx
        .insert(t.skillVersions)
        .values({ skillId: row!.id, version: INITIAL_SKILL_VERSION, body: row!.body, message });
      return row!;
    });
  }

  /**
   * Update a skill. A changed body bumps the version and stores the new body in
   * skill_versions (immutable history); metadata and `enabled` edits don't.
   * `message` is recorded on the new version and ignored when none is created.
   */
  async update(
    workspaceId: string,
    id: string,
    patch: UpdateSkill,
    message: string,
  ): Promise<SkillRow | undefined> {
    return this.db.transaction(async (tx) => {
      // Row lock: two concurrent body edits must not both claim version N+1.
      const [existing] = await tx
        .select()
        .from(t.skills)
        .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
        .for('update');
      if (!existing) return undefined;

      const bodyChanged = patch.body !== undefined && patch.body !== existing.body;
      const nextVersion = bodyChanged ? existing.version + 1 : existing.version;

      const [row] = await tx
        .update(t.skills)
        .set({
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.description !== undefined ? { description: patch.description } : {}),
          ...(patch.type !== undefined ? { type: patch.type } : {}),
          ...(patch.body !== undefined ? { body: patch.body } : {}),
          ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
          version: nextVersion,
        })
        .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
        .returning();

      if (bodyChanged && row) {
        await tx
          .insert(t.skillVersions)
          .values({ skillId: row.id, version: nextVersion, body: row.body, message })
          .onConflictDoNothing();
      }
      return row;
    });
  }

  /** A skill's body history, newest first. Call only for a skill already
   *  resolved in the caller's workspace — versions carry no workspace_id. */
  async listVersions(skillId: string): Promise<SkillVersionRow[]> {
    return this.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, skillId))
      .orderBy(desc(t.skillVersions.version));
  }

  /**
   * Restore an old version by APPENDING a new one that carries its body —
   * history is never rewritten. `message` gets the restored version number.
   */
  async restoreVersion(
    workspaceId: string,
    id: string,
    version: number,
    message: (restored: number) => string,
  ): Promise<RestoreResult> {
    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(t.skills)
        .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
        .for('update');
      if (!existing) return { missing: 'skill' as const };

      const [old] = await tx
        .select()
        .from(t.skillVersions)
        .where(and(eq(t.skillVersions.skillId, id), eq(t.skillVersions.version, version)));
      if (!old) return { missing: 'version' as const };

      const nextVersion = existing.version + 1;
      const [row] = await tx
        .update(t.skills)
        .set({ body: old.body, version: nextVersion })
        .where(eq(t.skills.id, id))
        .returning();
      await tx
        .insert(t.skillVersions)
        .values({ skillId: id, version: nextVersion, body: old.body, message: message(version) });
      return { row: row! };
    });
  }

  // ---- usage & stats (read-only over agent_skills / agent_run_skills) -----

  /**
   * 30-day counters for every skill in the workspace — or just one, with
   * `skillId` — in ONE statement (no per-skill queries). Only completed runs
   * count; a run's findings are credited to every skill its prompt carried.
   */
  async usageCounts(workspaceId: string, skillId?: string): Promise<SkillUsageCounts[]> {
    const rows = await this.db.execute<{
      skill_id: string;
      agents: number;
      total_runs: number;
      runs_with_skill: number;
      findings: number;
      accepted: number;
      dismissed: number;
    }>(sql`
      with window_runs as (
        select r.id
        from agent_runs r
        where r.workspace_id = ${workspaceId}
          and r.status = ${COMPLETED_RUN_STATUS}
          and r.ran_at >= now() - make_interval(days => ${STATS_WINDOW_DAYS}::int)
      ),
      skill_runs as (
        select distinct rs.skill_id, rs.run_id
        from agent_run_skills rs
        join window_runs w on w.id = rs.run_id
        where rs.skill_id is not null
      ),
      pulls as (
        select skill_id, count(*)::int as runs from skill_runs group by skill_id
      ),
      outcomes as (
        select
          sr.skill_id,
          count(*)::int as findings,
          (count(*) filter (where f.accepted_at is not null))::int as accepted,
          (count(*) filter (where f.dismissed_at is not null and f.accepted_at is null))::int as dismissed
        from skill_runs sr
        join reviews rv on rv.run_id = sr.run_id
        join findings f on f.review_id = rv.id
        group by sr.skill_id
      ),
      links as (
        select l.skill_id, count(*)::int as agents
        from agent_skills l
        join agents a on a.id = l.agent_id
        where a.workspace_id = ${workspaceId} and l.enabled
        group by l.skill_id
      )
      select
        s.id as skill_id,
        coalesce(l.agents, 0) as agents,
        (select count(*)::int from window_runs) as total_runs,
        coalesce(p.runs, 0) as runs_with_skill,
        coalesce(o.findings, 0) as findings,
        coalesce(o.accepted, 0) as accepted,
        coalesce(o.dismissed, 0) as dismissed
      from skills s
      left join links l on l.skill_id = s.id
      left join pulls p on p.skill_id = s.id
      left join outcomes o on o.skill_id = s.id
      where s.workspace_id = ${workspaceId}
        ${skillId ? sql`and s.id = ${skillId}` : sql``}
    `);
    return rows.map((r) => ({
      skillId: r.skill_id,
      agents: r.agents,
      totalRuns: r.total_runs,
      runsWithSkill: r.runs_with_skill,
      findings: r.findings,
      accepted: r.accepted,
      dismissed: r.dismissed,
    }));
  }

  /** Agents in the workspace with an enabled link to the skill, by name. */
  async agentsUsing(workspaceId: string, skillId: string): Promise<{ id: string; name: string }[]> {
    return this.db
      .select({ id: t.agents.id, name: t.agents.name })
      .from(t.agentSkills)
      .innerJoin(t.agents, eq(t.agentSkills.agentId, t.agents.id))
      .where(
        and(
          eq(t.agents.workspaceId, workspaceId),
          eq(t.agentSkills.skillId, skillId),
          eq(t.agentSkills.enabled, true),
        ),
      )
      .orderBy(asc(t.agents.name), asc(t.agents.id));
  }

  /** Finding counts per category over the 30-day completed runs that carried the skill. */
  async findingsByCategory(workspaceId: string, skillId: string): Promise<Map<string, number>> {
    const rows = await this.db.execute<{ category: string; count: number }>(sql`
      select f.category, count(*)::int as count
      from findings f
      join reviews rv on rv.id = f.review_id
      join agent_runs r on r.id = rv.run_id
      where r.workspace_id = ${workspaceId}
        and r.status = ${COMPLETED_RUN_STATUS}
        and r.ran_at >= now() - make_interval(days => ${STATS_WINDOW_DAYS}::int)
        and exists (
          select 1 from agent_run_skills rs where rs.run_id = r.id and rs.skill_id = ${skillId}
        )
      group by f.category
    `);
    return new Map(rows.map((r) => [r.category, r.count]));
  }

  /** Delete a skill (scoped to workspace). Versions and agent links cascade. */
  async deleteById(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning({ id: t.skills.id });
    return rows.length > 0;
  }
}
