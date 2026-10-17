/**
 * Pure parser for links in a PR body. Never fetches anything — it only
 * classifies references so the resolver knows what it may read:
 *  - `issue`   : a GitHub issue/pull of the PR's own repo
 *  - `repoDoc` : a markdown file in the PR's own repo (blob URL or repo-relative path)
 *  - `external`: anything else (other hosts, other repos). Recorded, never fetched.
 */

export type ParsedLink =
  | { kind: 'issue'; owner: string; repo: string; number: number }
  | { kind: 'repoDoc'; path: string; ref?: string }
  | { kind: 'external'; host: string; path: string };

export interface RepoCoords {
  owner: string;
  repo: string;
}

const MAX_LINKS = 20;
const URL_RE = /https?:\/\/[^\s<>()\[\]"'`]+/gi;
const CLOSING_RE = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s+(?:([\w.-]+)\/([\w.-]+))?#(\d+)\b/gi;
// Repo-relative markdown paths such as docs/plans/x.md or ./docs/x.md.
const REL_PATH_RE = /(?:^|[\s(`"'])((?:\.\/)?(?:[\w.-]+\/)*[\w.-]+\.md)(?=$|[\s)`"',.;:])/gim;

const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** Reject traversal, absolute paths and non-markdown files. */
export function safeDocPath(raw: string): string | null {
  const path = raw.replace(/^\.\//, '');
  if (!path || path.startsWith('/') || path.includes('\\')) return null;
  if (path.split('/').some((seg) => seg === '..' || seg === '')) return null;
  if (!/\.md$/i.test(path)) return null;
  return path;
}

function parseUrl(raw: string, self: RepoCoords): ParsedLink | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  const segs = url.pathname.split('/').filter(Boolean);
  if (host === 'github.com' && segs.length >= 2 && eq(segs[0]!, self.owner) && eq(segs[1]!, self.repo)) {
    const type = segs[2];
    if ((type === 'issues' || type === 'pull') && /^\d+$/.test(segs[3] ?? '')) {
      return { kind: 'issue', owner: self.owner, repo: self.repo, number: Number(segs[3]) };
    }
    if (type === 'blob' && segs.length >= 5) {
      const path = safeDocPath(decodeURIComponent(segs.slice(4).join('/')));
      return path ? { kind: 'repoDoc', path, ref: segs[3]! } : null;
    }
    return null;
  }
  // Query string and fragment are dropped: refs must never carry tokens.
  return { kind: 'external', host, path: url.pathname };
}

/** Extract classified, de-duplicated links from a PR body (capped). */
export function parseBodyLinks(body: string, self: RepoCoords): ParsedLink[] {
  const out: ParsedLink[] = [];
  const seen = new Set<string>();
  const push = (link: ParsedLink | null) => {
    if (!link || out.length >= MAX_LINKS) return;
    const key =
      link.kind === 'issue'
        ? `i:${link.number}`
        : link.kind === 'repoDoc'
          ? `d:${link.path}`
          : `e:${link.host}${link.path}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(link);
  };

  for (const m of body.matchAll(CLOSING_RE)) {
    // Only the PR's own repo; a bare `#12` without a closing keyword is not a link.
    const sameRepo = !m[1] || (eq(m[1], self.owner) && eq(m[2]!, self.repo));
    if (sameRepo) push({ kind: 'issue', owner: self.owner, repo: self.repo, number: Number(m[3]) });
  }
  for (const m of body.matchAll(URL_RE)) push(parseUrl(m[0].replace(/[.,;:]+$/, ''), self));
  for (const m of body.matchAll(REL_PATH_RE)) {
    const path = safeDocPath(m[1]!);
    if (path) push({ kind: 'repoDoc', path });
  }
  return out;
}
