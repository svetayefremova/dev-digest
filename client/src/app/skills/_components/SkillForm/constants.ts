import type { SkillType } from "@devdigest/shared";

/** Skill types in the order the type select offers them. Restated here rather
    than read from the contract's zod enum: the client may only `import type`
    from `@devdigest/shared` (see client/INSIGHTS.md). */
export const SKILL_TYPES: readonly SkillType[] = ["rubric", "convention", "security", "custom"];

/** Type preselected for a new skill. */
export const DEFAULT_SKILL_TYPE: SkillType = "custom";
