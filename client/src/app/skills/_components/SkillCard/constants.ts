import type { IconName } from "@devdigest/ui";
import type { SkillSource } from "@devdigest/shared";

/** Icon shown next to a skill's source label. */
export const SOURCE_ICONS: Record<SkillSource, IconName> = {
  manual: "Edit",
  imported_file: "Upload",
  imported_url: "Link",
  extracted: "Wrench",
  community: "Globe",
};
