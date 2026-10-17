import type { IntentSource, UnifiedDiff } from '@devdigest/shared';
import { isMeaningfulBody } from '@devdigest/reviewer-core';
import type { IntentDoc, IntentFileSummary, IntentInput } from '@devdigest/reviewer-core';
import type { Container } from '../../platform/container.js';
import type { PullRow } from '../reviews/repository.js';
import { parseBodyLinks, type ParsedLink } from './link-parser.js';

const MAX_ISSUES = 3;
const MAX_REPO_DOCS = 5;
const MAX_EXTERNAL = 5;
const MAX_BODY_CHARS = 4000;

export interface CollectedSources {
  input: IntentInput;
  sources: IntentSource[];
  /** Human-readable, log-safe notes about context that could not be retrieved. */
  missing: string[];
  hasMeaningfulBody: boolean;
}

const fileSummaries = (diff: UnifiedDiff): IntentFileSummary[] =>
  diff.files.map((f) => ({
    path: f.path,
    additions: f.additions,
    deletions: f.deletions,
    // Headers rebuilt from line numbers only — never any hunk content.
    hunkHeaders: f.hunks.map(
      (h) => `@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`,
    ),
  }));

const docKind = (path: string): IntentDoc['kind'] => (/spec/i.test(path) ? 'spec' : 'plan');

const reason = (err: unknown): string => {
  const status = (err as { status?: number }).status;
  if (status === 404) return 'not found';
  if (status === 401 || status === 403) return 'permission denied';
  return 'could not be read';
};

/**
 * Gathers the classifier's inputs. The only reads it performs are GitHub issues
 * of the PR's own repo and repo-relative markdown docs from the clone; every
 * other link is recorded as unavailable and never fetched. Failures degrade to
 * `unavailable` sources, never to invented content.
 */
export class SourceResolver {
  constructor(private container: Container) {}

  async collect(
    pull: PullRow,
    repo: { owner: string; name: string },
    diff: UnifiedDiff,
  ): Promise<CollectedSources> {
    const sources: IntentSource[] = [];
    const missing: string[] = [];
    const missingForPrompt: IntentInput['missing'] = [];
    const docs: IntentDoc[] = [];
    let issue: IntentDoc | undefined;

    sources.push({ kind: 'title', ref: 'title', status: 'used', chars: pull.title.length });

    const body = pull.body ?? '';
    sources.push(
      body.trim()
        ? {
            kind: 'description',
            ref: 'description',
            status: body.length > MAX_BODY_CHARS ? 'truncated' : 'used',
            chars: body.length,
          }
        : { kind: 'description', ref: 'description', status: 'unavailable', chars: 0, reason: 'empty description' },
    );

    const links = parseBodyLinks(body, { owner: repo.owner, repo: repo.name });
    const note = (kind: IntentDoc['kind'], ref: string, why: string) => {
      missing.push(`${kind} ${ref}: ${why}`);
      missingForPrompt.push({ kind, ref });
    };

    for (const link of links.filter((l): l is Extract<ParsedLink, { kind: 'issue' }> => l.kind === 'issue').slice(0, MAX_ISSUES)) {
      const ref = `${repo.owner}/${repo.name}#${link.number}`;
      try {
        const gh = await this.container.github();
        const res = await gh.getIssue({ owner: repo.owner, name: repo.name }, link.number);
        const text = `${res.title}\n\n${res.body ?? ''}`;
        sources.push({ kind: 'linked_issue', ref, status: 'used', chars: text.length });
        issue ??= { kind: 'linked_issue', ref, text };
      } catch (err) {
        const why = reason(err);
        sources.push({ kind: 'linked_issue', ref, status: 'unavailable', chars: 0, reason: why });
        note('linked_issue', ref, why);
      }
    }

    for (const link of links.filter((l): l is Extract<ParsedLink, { kind: 'repoDoc' }> => l.kind === 'repoDoc').slice(0, MAX_REPO_DOCS)) {
      const kind = docKind(link.path);
      const ref = link.ref ? `${link.path}@${link.ref}` : link.path;
      try {
        const text = await this.container.git.readFile(repo, link.path);
        if (!text.trim()) throw Object.assign(new Error('empty'), { status: 404 });
        sources.push({ kind, ref, status: 'used', chars: text.length });
        docs.push({ kind, ref, text });
      } catch (err) {
        const why = reason(err);
        sources.push({ kind, ref, status: 'unavailable', chars: 0, reason: why });
        note(kind, ref, why);
      }
    }

    for (const link of links.filter((l): l is Extract<ParsedLink, { kind: 'external' }> => l.kind === 'external').slice(0, MAX_EXTERNAL)) {
      const ref = `${link.host}${link.path}`;
      sources.push({ kind: 'spec', ref, status: 'unavailable', chars: 0, reason: 'external host not fetched' });
      note('spec', ref, 'external host not fetched');
    }

    const files = fileSummaries(diff);
    sources.push({ kind: 'files', ref: `${files.length} files`, status: 'used', chars: files.reduce((n, f) => n + f.path.length, 0) });

    return {
      input: { title: pull.title, body, ...(issue ? { issue } : {}), docs, files, missing: missingForPrompt },
      sources,
      missing,
      hasMeaningfulBody: isMeaningfulBody(body),
    };
  }
}
