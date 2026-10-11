import type { Skill } from "@devdigest/shared";

/**
 * The lines that open a skill's block in the review prompt, before its body.
 * Mirrors `formatSkillBlock` in server/src/modules/skills/helpers.ts — keep the
 * two in step: `### Skill: <name>`, then the trimmed description when there is one.
 */
export function skillBlockHeader(skill: Pick<Skill, "name" | "description">): string {
  const description = skill.description.trim();
  return [`### Skill: ${skill.name}`, ...(description ? [description] : [])].join("\n");
}
