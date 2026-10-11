import type { AgentSkillLink, Skill } from "@devdigest/shared";

/** One row of the Skills tab: a workspace skill + whether this agent uses it. */
export interface SkillRow {
  skill: Skill;
  enabled: boolean;
}

/**
 * Every workspace skill as a row, in prompt order: linked skills first in their
 * saved order (enabled or not — a disabled link keeps its position), then
 * skills this agent has never linked, unchecked.
 */
export function buildRows(skills: Skill[], links: AgentSkillLink[]): SkillRow[] {
  const byId = new Map(skills.map((sk) => [sk.id, sk]));
  const linked = [...links]
    .sort((a, b) => a.order - b.order)
    .flatMap((link) => {
      const skill = byId.get(link.skill_id);
      return skill ? [{ skill, enabled: link.enabled }] : [];
    });
  const linkedIds = new Set(linked.map((row) => row.skill.id));
  const unlinked = skills.filter((sk) => !linkedIds.has(sk.id)).map((skill) => ({ skill, enabled: false }));
  return [...linked, ...unlinked];
}

/** Move the row `fromId` to the position currently held by `toId`. */
export function moveRow(rows: SkillRow[], fromId: string, toId: string): SkillRow[] {
  const from = rows.findIndex((row) => row.skill.id === fromId);
  const to = rows.findIndex((row) => row.skill.id === toId);
  if (from < 0 || to < 0 || from === to) return rows;
  const next = [...rows];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}

/** Case-insensitive filter over a row's skill name and type. */
export function filterRows(rows: SkillRow[], search: string): SkillRow[] {
  const q = search.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((row) => `${row.skill.name} ${row.skill.type}`.toLowerCase().includes(q));
}
