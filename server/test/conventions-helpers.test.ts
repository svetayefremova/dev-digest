import { describe, it, expect } from 'vitest';
import {
  buildSkillDraft,
  ruleSlug,
  verifyEvidence,
  type ExtractedCandidate,
} from '../src/modules/conventions/helpers.js';
import type { ConventionRow } from '../src/db/rows.js';

const FILE = [
  "import { db } from './db';",
  '',
  'export async function getUser(id: string) {',
  '  const user = await db.users.find(id);',
  '  const posts = await db.posts.findMany({ userId: id });',
  '  return { user, posts };',
  '}',
];
const files = new Map([['src/api/users.ts', FILE]]);

const candidate = (evidence: Partial<ExtractedCandidate['evidence']>): ExtractedCandidate => ({
  category: 'general',
  rule: 'Always use async/await instead of .then() chains.',
  evidence: {
    file: 'src/api/users.ts',
    line: 4,
    end_line: 5,
    quote: 'const user = await db.users.find(id);',
    ...evidence,
  },
  confidence: 0.9,
});

describe('verifyEvidence', () => {
  it('keeps a candidate whose quote is in the file and cuts the snippet from the file', () => {
    const verified = verifyEvidence(candidate({}), files);
    expect(verified).toMatchObject({ evidencePath: 'src/api/users.ts', evidenceLine: 4, evidenceEndLine: 5 });
    // Dedented, and taken from the file — including the line the quote left out.
    expect(verified!.evidenceSnippet).toBe(
      'const user = await db.users.find(id);\nconst posts = await db.posts.findMany({ userId: id });',
    );
  });

  it('drops a candidate citing a file that was not sampled', () => {
    expect(verifyEvidence(candidate({ file: 'src/api/ghost.ts' }), files)).toBeNull();
  });

  it('drops a candidate whose line is outside the file', () => {
    expect(verifyEvidence(candidate({ line: 99, end_line: null }), files)).toBeNull();
    expect(verifyEvidence(candidate({ line: 0, end_line: null }), files)).toBeNull();
  });

  it('drops a candidate whose quoted code is not in the file', () => {
    expect(verifyEvidence(candidate({ quote: 'return fetchUser(id).then(render);' }), files)).toBeNull();
  });

  it('corrects a drifted line number to where the quote really is', () => {
    const verified = verifyEvidence(candidate({ line: 6, end_line: null }), files);
    expect(verified).toMatchObject({ evidenceLine: 4, evidenceEndLine: 4 });
  });

  it('ignores whitespace differences between the quote and the file', () => {
    const verified = verifyEvidence(candidate({ quote: 'const   user =  await db.users.find(id);' }), files);
    expect(verified?.evidenceLine).toBe(4);
  });
});

describe('buildSkillDraft', () => {
  const row = (rule: string, snippet: string): ConventionRow =>
    ({
      rule,
      evidencePath: 'src/api/users.ts',
      evidenceLine: 4,
      evidenceEndLine: 5,
      evidenceSnippet: snippet,
    }) as ConventionRow;

  it('merges the accepted rules into one repo-conventions skill', () => {
    const draft = buildSkillDraft('payments-api', [
      row('Always use async/await instead of .then() chains.', 'const user = await find(id);'),
      row('Redis access goes through the singleton.', 'export const redis = new Redis();'),
    ]);
    expect(draft.name).toBe('repo-conventions');
    expect(draft.description).toBe('2 house conventions extracted from payments-api');
    expect(draft.body).toContain('# repo-conventions');
    expect(draft.body).toContain('## always-use-async-await-instead');
    expect(draft.body).toContain('Detected in `src/api/users.ts:4-5`:');
    expect(draft.body).toContain('```\nexport const redis = new Redis();\n```');
  });

  it('widens the fence around a snippet that contains backticks', () => {
    const draft = buildSkillDraft('repo', [row('Rule.', 'const md = "```";')]);
    expect(draft.body).toContain('````\nconst md = "```";\n````');
  });

  it('slugs a rule with no usable words', () => {
    expect(ruleSlug('…')).toBe('rule');
  });
});
