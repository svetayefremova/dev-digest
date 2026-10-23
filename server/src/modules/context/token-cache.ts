import type { Tokenizer } from '../../adapters/tokenizer/index.js';
import { TOKEN_CACHE_MAX } from './constants.js';

/** In-process token counts keyed by (file, mtime, size) so Refresh only re-tokenizes changed files. */
export class TokenCache {
  private readonly map = new Map<string, number>();

  constructor(private readonly tokenizer: Tokenizer) {}

  count(abs: string, mtimeMs: number, size: number, text: () => string): number {
    const key = `${abs}:${mtimeMs}:${size}`;
    const hit = this.map.get(key);
    if (hit !== undefined) return hit;
    const n = this.tokenizer.count(text());
    if (this.map.size >= TOKEN_CACHE_MAX) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(key, n);
    return n;
  }
}
