import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { HttpDevDigestApi } from '../src/api/http.js';
import type { DevDigestApi } from '../src/api/types.js';
import { ApiError, ApiUnreachableError } from '../src/api/errors.js';

afterEach(() => vi.unstubAllGlobals());

const jsonRes = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('HttpDevDigestApi', () => {
  it('maps error bodies, unreachable API and caches pull lists', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const api = new HttpDevDigestApi('http://localhost:3001');

    fetchMock.mockResolvedValueOnce(jsonRes(404, { error: { code: 'not_found', message: 'Agent not found' } }));
    const err = await api.startReview('p1', 'a1').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 404, code: 'not_found', message: 'Agent not found' });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://localhost:3001/pulls/p1/review');
    expect(JSON.parse(init.body)).toEqual({ agentId: 'a1' });

    fetchMock.mockRejectedValueOnce(Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }));
    await expect(api.listRepos()).rejects.toBeInstanceOf(ApiUnreachableError);

    fetchMock.mockClear();
    fetchMock.mockImplementation(async () => jsonRes(200, []));
    await api.listPulls('r1');
    await api.listPulls('r1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await api.listPulls('r1', { bypassCache: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('port has exactly the 9 methods (type level)', () => {
    expectTypeOf<keyof DevDigestApi>().toEqualTypeOf<
      | 'listRepos'
      | 'listPulls'
      | 'listAgents'
      | 'startReview'
      | 'activeRuns'
      | 'listRuns'
      | 'reviewsForPull'
      | 'conventions'
      | 'blast'
    >();
  });

  it('RQ-T6: blast issues GET /pulls/:id/blast and returns the body', async () => {
    const body = { changed_symbols: [], downstream: [], summary: '0 symbols', degraded: false, reason: null };
    const fetchMock = vi.fn(async () => jsonRes(200, body));
    vi.stubGlobal('fetch', fetchMock);
    const res = await new HttpDevDigestApi('http://localhost:3001').blast('p1');
    expect(res).toEqual(body);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://localhost:3001/pulls/p1/blast');
    expect(init.method).toBe('GET');
  });

  it('listAgents drops system_prompt in the adapter', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonRes(200, [{ id: 'a', name: 'n', description: 'd', model: 'm', enabled: true, system_prompt: 'SECRET' }])));
    const agents = await new HttpDevDigestApi('http://localhost:3001').listAgents();
    expect(JSON.stringify(agents)).not.toContain('SECRET');
    expect(agents[0]).toMatchObject({ id: 'a', name: 'n', enabled: true });
  });

  it('exposes exactly the 9 port methods (least privilege)', () => {
    const methods = Object.getOwnPropertyNames(HttpDevDigestApi.prototype)
      .filter((n) => n !== 'constructor' && n !== 'request')
      .sort();
    expect(methods).toEqual(
      ['activeRuns', 'blast', 'conventions', 'listAgents', 'listPulls', 'listRepos', 'listRuns', 'reviewsForPull', 'startReview'].sort(),
    );
  });
});
