export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class ApiUnreachableError extends Error {
  constructor(readonly url: string) {
    super(`DevDigest API is not reachable at ${url}`);
    this.name = 'ApiUnreachableError';
  }
}
