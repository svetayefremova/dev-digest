import type { ReviewRecord, Severity } from '@devdigest/shared';
import { fail, ok, type Result } from '../domain/errors.js';
import { renderText, shapeReview, truncate, type ResponseFormat, type ShapedReview } from '../domain/shape.js';
import { resolveAgent, resolvePull, resolveRepo } from './resolve.js';
import { runFailure } from './run-status.js';
import type { Deps, Output } from './types.js';

export interface FindingsStructured {
  status: 'done' | 'running';
  run_id?: string;
  repo?: string;
  pr?: number;
  agent?: string | null;
  verdict?: string | null;
  score?: number | null;
  findings?: ShapedReview['findings'];
  total?: number;
  shown?: number;
  reviews?: ShapedReview[];
}

export interface GetFindingsArgs {
  repo?: string | undefined;
  pr?: number | undefined;
  agent?: string | undefined;
  run_id?: string | undefined;
  severity?: Severity | undefined;
  limit: number;
  format: ResponseFormat;
}

const newestFirst = (a: ReviewRecord, b: ReviewRecord) => b.created_at.localeCompare(a.created_at);

export async function getFindings(deps: Deps, args: GetFindingsArgs): Promise<Result<Output<FindingsStructured>>> {
  const { api } = deps;
  const shapeOpts = { severity: args.severity, limit: args.limit, format: args.format };

  // ---- by run_id --------------------------------------------------------
  if (args.run_id) {
    const runId = args.run_id;
    let prId: string;
    let repoName: string;
    let pr: number;
    const ref = deps.sessionRuns.lookup(runId);
    if (ref) {
      ({ prId, repo: repoName, pr } = ref);
    } else if (args.pr !== undefined) {
      const repo = await resolveRepo(api, args.repo);
      if (!repo.ok) return repo;
      const pull = await resolvePull(api, repo.value, args.pr);
      if (!pull.ok) return pull;
      prId = pull.value.prId;
      repoName = repo.value.full_name;
      pr = args.pr;
    } else {
      return fail('unknown_run', 'Unknown run_id in this session', 'Call get_findings with repo + pr (+ agent) instead.');
    }

    const run = (await api.listRuns(prId)).find((r) => r.run_id === runId);
    if (!run) {
      return fail('unknown_run', `run_id ${runId} was not found on ${repoName}#${pr}`, 'Call get_findings with repo + pr (+ agent) instead.');
    }
    if (run.status === 'running') {
      return ok({
        structured: { status: 'running', run_id: runId, repo: repoName, pr },
        text: `Run ${runId} is still running. Call get_findings again later with the same run_id.`,
      });
    }
    if (run.status !== 'done') return runFailure(runId, run, run.status ?? 'unknown');

    const review = (await api.reviewsForPull(prId)).find((r) => r.run_id === runId && r.kind === 'review');
    if (!review) {
      return fail('review_unreadable', `Run ${runId} finished but its review is not readable yet`, 'Call get_findings again in a few seconds.');
    }
    const shaped = shapeReview(review, shapeOpts);
    return ok({
      structured: { status: 'done', run_id: runId, repo: repoName, pr, ...shaped },
      text: truncate(renderText(shaped, `${repoName}#${pr}`)),
    });
  }

  // ---- by repo + pr (+ agent) ---------------------------------------------
  if (args.pr === undefined) {
    return fail(
      'missing_target',
      'Nothing to look up',
      "Pass pr (number, + repo 'owner/name' if several repos are connected), or a run_id from run_agent_on_pr.",
    );
  }
  const repo = await resolveRepo(api, args.repo);
  if (!repo.ok) return repo;
  const pull = await resolvePull(api, repo.value, args.pr);
  if (!pull.ok) return pull;
  const repoName = repo.value.full_name;

  let agentId: string | undefined;
  if (args.agent) {
    const agent = await resolveAgent(api, args.agent);
    if (!agent.ok) return agent;
    agentId = agent.value.id;
  }

  const all = (await api.reviewsForPull(pull.value.prId)).filter(
    (r) => r.kind === 'review' && (agentId === undefined || r.agent_id === agentId),
  );
  const newestPerAgent = new Map<string, ReviewRecord>();
  for (const r of [...all].sort(newestFirst)) {
    const key = r.agent_id ?? '';
    if (!newestPerAgent.has(key)) newestPerAgent.set(key, r);
  }
  const reviews = [...newestPerAgent.values()];

  if (reviews.length === 0) {
    const active = await api.activeRuns(pull.value.prId);
    const running = agentId ? active.filter((a) => a.agent_id === agentId) : active;
    if (running.length > 0) {
      const id = running[0]!.run_id;
      return ok({
        structured: { status: 'running', run_id: id, repo: repoName, pr: args.pr },
        text: `Review in progress (run_id=${id}). Call get_findings again later.`,
      });
    }
    return fail('no_review', `No finished review for ${repoName}#${args.pr}`, 'Call run_agent_on_pr to start one.');
  }

  const header = `${repoName}#${args.pr}`;
  if (reviews.length === 1) {
    const r = reviews[0]!;
    const shaped = shapeReview(r, shapeOpts);
    return ok({
      structured: { status: 'done', repo: repoName, pr: args.pr, ...(r.run_id ? { run_id: r.run_id } : {}), ...shaped },
      text: truncate(renderText(shaped, header)),
    });
  }
  const shapedAll = reviews.map((r) => shapeReview(r, shapeOpts));
  const text = [...shapedAll.map((s) => renderText(s, header)), 'Several agents reviewed this PR — pass agent to narrow.'].join('\n\n');
  return ok({ structured: { status: 'done', repo: repoName, pr: args.pr, reviews: shapedAll }, text: truncate(text) });
}
