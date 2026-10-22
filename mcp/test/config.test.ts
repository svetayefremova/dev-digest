import { describe, expect, it } from 'vitest';
import { parseConfig } from '../src/config.js';

describe('config', () => {
  it('applies defaults and rejects bad values', () => {
    const c = parseConfig({});
    expect(c.apiUrl).toBe('http://localhost:3001');
    expect(c.waitMs).toBe(240000);
    expect(c.pollMs).toBe(3000);

    expect(() => parseConfig({ DEVDIGEST_MCP_POLL_MS: '10' })).toThrow();
    expect(() => parseConfig({ DEVDIGEST_API_URL: 'https://example.com' })).toThrow(/loopback/);
    expect(parseConfig({ DEVDIGEST_API_URL: 'http://127.0.0.1:4000/' }).apiUrl).toBe('http://127.0.0.1:4000');
    expect(parseConfig({ DEVDIGEST_API_URL: 'http://[::1]:3001' }).apiUrl).toBe('http://[::1]:3001');
  });
});
