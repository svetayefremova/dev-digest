import type { ReviewRecord, Severity } from '@devdigest/shared';
import { fail, ok, type Result } from '../domain/errors.js';
import { summarizeReview, truncate, type ConciseFinding } from '../domain/shape.js';
import { UNTRUSTED_MARKER } from '../domain/constants.js';
import { resolveAgent, resolvePull, resolveRepo } from './resolve.js';
import { runFailure } from './run-status.js';
import type { Deps, Output } from './types.js';
import { waitForRun } from './wait.js';

export interface RunStructured {
  status: 'done' | 'running';
  run_id: string;
  agent: string;
  repo: string;
  pr: number;
  attached: boolean;
  verdict?: string | null;
  score?: number | null;
  counts?: Record<Severity, number>;
  top_findings?: ConciseFinding[];
  total?: number;
}

export async function runAgentOnPr(
  deps: Deps,
  args: { pr: number; agent: string; repo?: string | undefined },
): Promise<Result<Output<RunStructured>>> {
  const { api, config } = deps;

  const repo = await resolveRepo(api, args.repo);
  if (!repo.ok) return repo;
  const pull = await resolvePull(api, repo.value, args.pr);
  if (!pull.ok) return pull;
  const agent = await resolveAgent(api, args.agent);
  if (!agent.ok) return agent;

  if (agent.value.enabled === false) {
    return fail(
      'agent_disabled',
      `Agent '${agent.value.name}' is disabled in DevDigest`,
      'Enable it in the DevDigest UI (Agents) or pick another from list_agents.',
    );
  }

  const prId = pull.value.prId;
  const repoName = repo.value.full_name;
  const agentName = agent.value.name;

  // Attach to an in-flight run of the same agent instead of starting a duplicate.
  const active = (await api.activeRuns(prId)).find((r) => r.agent_id === agent.value.id);
  let runId: string;
  let attached = false;
  if (active) {
    runId = active.run_id;
    attached = true;
  } else {
    const started = await api.startReview(prId, agent.value.id);
    const first = started.runs[0];
    if (!first) {
      return fail('no_run', 'DevDigest did not create a run', 'Retry run_agent_on_pr.');
    }
    runId = first.run_id;
  }
  deps.sessionRuns.remember(runId, { prId, repo: repoName, pr: args.pr, agentId: agent.value.id, agentName });

  const waited = await waitForRun(api, prId, runId, {
    waitMs: config.waitMs,
    pollMs: config.pollMs,
    sleep: deps.sleep,
    now: deps.now,
  });

  if (waited.state === 'timeout') {
    return ok({
      structured: { status: 'running', run_id: runId, agent: agentName, repo: repoName, pr: args.pr, attached },
      text: `Review still running after ~${Math.round(config.waitMs / 1000)}s. Call get_findings with run_id="${runId}" (or repo+pr+agent) later.`,
    });
  }
  if (waited.state !== 'done') return runFailure(runId, waited.run, waited.state);

  const findReview = async (): Promise<ReviewRecord | undefined> =>
    (await api.reviewsForPull(prId)).find((r) => r.run_id === runId && r.kind === 'review');
  let review = await findReview();
  if (!review) {
    await deps.sleep(config.pollMs);
    review = await findReview();
  }
  if (!review) {
    return fail(
      'review_unreadable',
      'Run finished but its review is not readable yet',
      `Call get_findings with run_id="${runId}".`,
    );
  }

  const s = summarizeReview(review);
  const lines = s.top_findings.map((f) => `${f.severity} ${f.file}:${f.line} — ${f.title}: ${f.message}`);
  const text = [
    UNTRUSTED_MARKER,
    `${repoName}#${args.pr} — ${agentName}: verdict ${s.verdict ?? 'n/a'}, score ${s.score ?? 'n/a'}; ` +
      `${s.counts.CRITICAL} critical, ${s.counts.WARNING} warning, ${s.counts.SUGGESTION} suggestion (${s.total} total)`,
    ...lines,
    `Full list: call get_findings with run_id="${runId}" (optionally severity=CRITICAL).`,
  ].join('\n');

  return ok({
    structured: {
      status: 'done',
      run_id: runId,
      agent: agentName,
      repo: repoName,
      pr: args.pr,
      attached,
      verdict: s.verdict,
      score: s.score,
      counts: s.counts,
      top_findings: s.top_findings,
      total: s.total,
    },
    text: truncate(text),
  });
}
