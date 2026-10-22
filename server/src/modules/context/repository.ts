import { and, asc, eq, sql } from 'drizzle-orm';
import type { ContextAttachment } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * Project-context attachments: repo-relative `.md` paths attached to an agent
 * or a skill, in saved order. Replace-the-whole-list writes, as `setSkills`.
 */
export class ContextRepository {
  constructor(private readonly db: Db) {}

  async listForAgent(agentId: string): Promise<ContextAttachment[]> {
    return this.db
      .select({ path: t.agentContextDocs.path, order: t.agentContextDocs.order })
      .from(t.agentContextDocs)
      .where(eq(t.agentContextDocs.agentId, agentId))
      .orderBy(asc(t.agentContextDocs.order));
  }

  async listForSkill(skillId: string): Promise<ContextAttachment[]> {
    return this.db
      .select({ path: t.skillContextDocs.path, order: t.skillContextDocs.order })
      .from(t.skillContextDocs)
      .where(eq(t.skillContextDocs.skillId, skillId))
      .orderBy(asc(t.skillContextDocs.order));
  }

  async setForAgent(agentId: string, paths: string[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(t.agentContextDocs).where(eq(t.agentContextDocs.agentId, agentId));
      if (paths.length === 0) return;
      await tx.insert(t.agentContextDocs).values(paths.map((path, i) => ({ agentId, path, order: i })));
    });
  }

  async setForSkill(skillId: string, paths: string[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(t.skillContextDocs).where(eq(t.skillContextDocs.skillId, skillId));
      if (paths.length === 0) return;
      await tx.insert(t.skillContextDocs).values(paths.map((path, i) => ({ skillId, path, order: i })));
    });
  }

  /**
   * Paths for one run: the agent's own docs, then each skill that is enabled
   * for the agent AND in the workspace (same filter as `enabledSkillsForRun`),
   * in skill order. May contain duplicates; the service dedupes.
   */
  async docsForRun(agentId: string): Promise<string[]> {
    const own = await this.listForAgent(agentId);
    const links = await this.db
      .select({ skillId: t.agentSkills.skillId })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
      .where(and(eq(t.agentSkills.agentId, agentId), eq(t.agentSkills.enabled, true), eq(t.skills.enabled, true)))
      .orderBy(asc(t.agentSkills.order));
    const paths = own.map((d) => d.path);
    for (const link of links) {
      for (const doc of await this.listForSkill(link.skillId)) paths.push(doc.path);
    }
    return paths;
  }

  /** Distinct agents using each path (directly or via an enabled skill) in a workspace. */
  async usedByAgentCounts(workspaceId: string): Promise<Map<string, number>> {
    const rows = await this.db.execute<{ path: string; n: number }>(sql`
      select path, count(distinct agent_id)::int as n from (
        select d.path, d.agent_id
        from agent_context_docs d
        join agents a on a.id = d.agent_id
        where a.workspace_id = ${workspaceId}
        union all
        select d.path, l.agent_id
        from skill_context_docs d
        join agent_skills l on l.skill_id = d.skill_id
        join skills s on s.id = d.skill_id
        join agents a on a.id = l.agent_id
        where a.workspace_id = ${workspaceId} and l.enabled = true and s.enabled = true
      ) x
      group by path
    `);
    return new Map(rows.map((r) => [r.path, r.n]));
  }
}
