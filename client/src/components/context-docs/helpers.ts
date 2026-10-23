import type { ContextAttachment, ContextDoc } from "@devdigest/shared";

/** Token total as shown in footers: plain integer below 1,000, else lowercase `k` with one decimal. */
export function formatTokenTotal(n: number): string {
  return n < 1000 ? String(n) : `${(n / 1000).toFixed(1)}k`;
}

/** Case-insensitive path-substring filter. */
export function filterDocs<T extends { path: string }>(docs: T[], search: string): T[] {
  const q = search.trim().toLowerCase();
  if (!q) return docs;
  return docs.filter((doc) => doc.path.toLowerCase().includes(q));
}

/** One row of an attach tab: a path, its doc (absent when missing from the checkout) and whether it is attached. */
export interface AttachRow {
  path: string;
  doc: ContextDoc | null;
  attached: boolean;
  missing: boolean;
}

/**
 * Attached docs first in saved order (a path absent from `docs` is flagged
 * `missing`), then every unattached doc by path.
 */
export function buildAttachRows(docs: ContextDoc[], attachments: ContextAttachment[]): AttachRow[] {
  const byPath = new Map(docs.map((doc) => [doc.path, doc]));
  const attached = [...attachments]
    .sort((a, b) => a.order - b.order)
    .map((att): AttachRow => {
      const doc = byPath.get(att.path) ?? null;
      return { path: att.path, doc, attached: true, missing: doc === null };
    });
  const attachedPaths = new Set(attached.map((row) => row.path));
  const rest = docs
    .filter((doc) => !attachedPaths.has(doc.path))
    .map((doc): AttachRow => ({ path: doc.path, doc, attached: false, missing: false }));
  return [...attached, ...rest];
}

/** Move the row `fromPath` to the position currently held by `toPath`. */
export function moveRow(rows: AttachRow[], fromPath: string, toPath: string): AttachRow[] {
  const from = rows.findIndex((row) => row.path === fromPath);
  const to = rows.findIndex((row) => row.path === toPath);
  if (from < 0 || to < 0 || from === to) return rows;
  const next = [...rows];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}

/** The ordered attached paths of a row list. */
export const attachedPaths = (rows: AttachRow[]): string[] => rows.filter((row) => row.attached).map((row) => row.path);

/** Sum of tokens over attached rows whose doc is known and previewable. */
export function attachedTokens(rows: AttachRow[]): number {
  return rows.reduce((sum, row) => sum + (row.attached ? (row.doc?.tokens ?? 0) : 0), 0);
}
