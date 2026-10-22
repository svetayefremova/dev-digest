export interface RunRef {
  prId: string;
  repo: string;
  pr: number;
  agentId: string;
  agentName: string;
}

/** In-process memory of runs started/attached in this session (stdio process lifetime). */
export class SessionRuns {
  private readonly runs = new Map<string, RunRef>();

  remember(runId: string, ref: RunRef): void {
    this.runs.set(runId, ref);
  }

  lookup(runId: string): RunRef | undefined {
    return this.runs.get(runId);
  }
}
