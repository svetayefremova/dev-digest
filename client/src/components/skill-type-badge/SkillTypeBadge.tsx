import { Badge } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";

/** Colour per skill type — shared by the Skills page and the agent Skills tab. */
export const SKILL_TYPE_COLORS: Record<SkillType, { color: string; bg: string }> = {
  rubric: { color: "var(--accent)", bg: "var(--accent-bg)" },
  convention: { color: "var(--ok)", bg: "var(--ok-bg)" },
  security: { color: "var(--crit)", bg: "var(--crit-bg)" },
  custom: { color: "var(--text-secondary)", bg: "var(--bg-hover)" },
};

/** Small coloured chip naming a skill's type. `label` is the translated name. */
export function SkillTypeBadge({ type, label }: { type: SkillType; label: string }) {
  const { color, bg } = SKILL_TYPE_COLORS[type];
  return (
    <Badge color={color} bg={bg} mono>
      {label}
    </Badge>
  );
}
