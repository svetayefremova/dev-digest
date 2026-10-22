/** A failure that tells the model what to do next. Plain data — no SDK types. */
export interface ToolFailure {
  code: string;
  message: string;
  next: string;
}

export type Result<T, E = ToolFailure> = { ok: true; value: T } | { ok: false; failure: E };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const fail = (code: string, message: string, next: string): Result<never> => ({
  ok: false,
  failure: { code, message, next },
});
