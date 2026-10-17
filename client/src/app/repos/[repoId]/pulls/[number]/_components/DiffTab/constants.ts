import type { SmartDiffRole } from "@devdigest/shared";

/** Display order (restated locally: client may only `import type` from the shared barrel). */
export const SMART_DIFF_ROLES: readonly SmartDiffRole[] = ["core", "tests", "wiring", "docs", "boilerplate"];

/** Roles whose files start collapsed. */
export const COLLAPSED_ROLES: ReadonlySet<SmartDiffRole> = new Set<SmartDiffRole>(["docs", "boilerplate"]);

export const ROLE_COLOR: Record<SmartDiffRole, string> = {
  core: "var(--accent)",
  tests: "var(--ok)",
  wiring: "var(--info)",
  docs: "var(--warn)",
  boilerplate: "var(--text-muted)",
};

export const ROLE_LABEL_KEY: Record<SmartDiffRole, string> = {
  core: "smartDiff.coreLabel",
  tests: "smartDiff.testsLabel",
  wiring: "smartDiff.wiringLabel",
  docs: "smartDiff.docsLabel",
  boilerplate: "smartDiff.boilerplateLabel",
};

export const ROLE_HINT_KEY: Record<SmartDiffRole, string> = {
  core: "smartDiff.coreHint",
  tests: "smartDiff.testsHint",
  wiring: "smartDiff.wiringHint",
  docs: "smartDiff.docsHint",
  boilerplate: "smartDiff.boilerplateHint",
};
