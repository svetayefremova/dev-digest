import type { DevDigestApi } from '../api/types.js';
import type { Config } from '../domain/constants.js';
import type { SessionRuns } from './session-runs.js';

/** What a use case hands to the tool layer: structured data + compact text. */
export interface Output<T> {
  structured: T;
  text: string;
}

export interface Deps {
  api: DevDigestApi;
  config: Config;
  sessionRuns: SessionRuns;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
}
