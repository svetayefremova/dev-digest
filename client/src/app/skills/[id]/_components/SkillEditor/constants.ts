import type { IconName } from "@devdigest/ui";

/** Editor tab descriptor. `labelKey` resolves under the `skills` namespace. */
export interface EditorTab {
  key: string;
  labelKey: string;
  icon: IconName;
}

/** Editor tabs, in display order. Evals is a later lesson. */
export const TABS: readonly EditorTab[] = [
  { key: "config", labelKey: "editor.tabs.config", icon: "Settings" },
  { key: "preview", labelKey: "editor.tabs.preview", icon: "Eye" },
  { key: "context", labelKey: "editor.tabs.context", icon: "FileText" },
  { key: "stats", labelKey: "editor.tabs.stats", icon: "BarChart" },
  { key: "versions", labelKey: "editor.tabs.versions", icon: "History" },
];

/** Tab keys valid in `?tab=`; anything else falls back to DEFAULT_TAB. */
export const TAB_KEYS: readonly string[] = TABS.map((tab) => tab.key);

/** The tab a skill opens on when the URL carries no `?tab=`. */
export const DEFAULT_TAB = "config";
