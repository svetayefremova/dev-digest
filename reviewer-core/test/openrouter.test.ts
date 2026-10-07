/**
 * OpenRouterProvider — used in production for live pricing (server's
 * PriceBook) and as the default CI-runner provider, but previously had no
 * test isolating its own request/response/cost parsing (only incidental
 * coverage via unrelated tests). Spins up a tiny local HTTP server that
 * mimics OpenRouter's OpenAI-compatible API, so this stays hermetic/offline —
 * no real network call, no API key.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { z } from 'zod';
import { OpenRouterProvider } from '../src/llm/openrouter.js';

let server: http.Server;
let baseURL: string;
let lastRequestBody: unknown;
/** Swapped per-test to control what the mock /chat/completions responds with. */
let chatResponse: () => { status: number; body: unknown };
let modelsResponse: () => { status: number; body: unknown };

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      if (req.method === 'POST' && req.url === '/chat/completions') {
        lastRequestBody = JSON.parse(Buffer.concat(chunks).toString() || '{}');
        const { status, body } = chatResponse();
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(body));
        return;
      }
      if (req.method === 'GET' && req.url === '/models') {
        const { status, body } = modelsResponse();
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(body));
        return;
      }
      res.writeHead(404).end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as { port: number }).port;
  baseURL = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const Schema = z.object({ ok: z.boolean() });

describe('OpenRouterProvider.completeStructured', () => {
  it('parses the response, sums token usage, and prefers the API-reported cost', async () => {
    chatResponse = () => ({
      status: 200,
      body: {
        choices: [{ message: { content: JSON.stringify({ ok: true }) } }],
        usage: { prompt_tokens: 120, completion_tokens: 40, cost: 0.00231 },
      },
    });

    const provider = new OpenRouterProvider('test-key', { baseURL });
    const result = await provider.completeStructured({
      model: 'deepseek/deepseek-v4-flash',
      schema: Schema,
      schemaName: 'TestSchema',
      messages: [{ role: 'user', content: 'go' }],
    });

    expect(result.data).toEqual({ ok: true });
    expect(result.tokensIn).toBe(120);
    expect(result.tokensOut).toBe(40);
    expect(result.costUsd).toBeCloseTo(0.00231, 6);
    expect(result.attempts).toBe(1);
  });

  it('falls back to the injected estimateCost when the API reports no usage.cost', async () => {
    chatResponse = () => ({
      status: 200,
      body: {
        choices: [{ message: { content: JSON.stringify({ ok: true }) } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      },
    });

    const provider = new OpenRouterProvider('test-key', {
      baseURL,
      estimateCost: (_model, tokensIn, tokensOut) => (tokensIn + tokensOut) * 0.001,
    });
    const result = await provider.completeStructured({
      model: 'x',
      schema: Schema,
      schemaName: 'TestSchema',
      messages: [{ role: 'user', content: 'go' }],
    });

    expect(result.costUsd).toBeCloseTo(0.015, 6); // (10+5) * 0.001
  });

  it('throws a descriptive error when OpenRouter returns no choices', async () => {
    chatResponse = () => ({
      status: 200,
      body: { choices: [], error: { message: 'upstream provider overloaded' } },
    });

    const provider = new OpenRouterProvider('test-key', { baseURL });
    await expect(
      provider.completeStructured({
        model: 'x',
        schema: Schema,
        schemaName: 'TestSchema',
        messages: [{ role: 'user', content: 'go' }],
      }),
    ).rejects.toThrow(/no choices for TestSchema.*upstream provider overloaded/);
  });

  it('retries with a repair prompt when the model returns invalid JSON, then succeeds', async () => {
    let call = 0;
    chatResponse = () => {
      call++;
      if (call === 1) {
        return { status: 200, body: { choices: [{ message: { content: 'not json' } }], usage: {} } };
      }
      return {
        status: 200,
        body: { choices: [{ message: { content: JSON.stringify({ ok: true }) } }], usage: {} },
      };
    };

    const provider = new OpenRouterProvider('test-key', { baseURL });
    const result = await provider.completeStructured({
      model: 'x',
      schema: Schema,
      schemaName: 'TestSchema',
      messages: [{ role: 'user', content: 'go' }],
      maxRetries: 1,
    });

    expect(result.data).toEqual({ ok: true });
    expect(result.attempts).toBe(2);
  });

  it('sends session_id for the openrouter id but not for a plain openai id', async () => {
    chatResponse = () => ({
      status: 200,
      body: { choices: [{ message: { content: JSON.stringify({ ok: true }) } }], usage: {} },
    });

    const openrouter = new OpenRouterProvider('test-key', { baseURL, id: 'openrouter' });
    await openrouter.completeStructured({
      model: 'x',
      schema: Schema,
      schemaName: 'TestSchema',
      messages: [{ role: 'user', content: 'go' }],
      sessionId: 'sess-123',
    });
    expect((lastRequestBody as { session_id?: string }).session_id).toBe('sess-123');

    const openai = new OpenRouterProvider('test-key', { baseURL, id: 'openai' });
    await openai.completeStructured({
      model: 'x',
      schema: Schema,
      schemaName: 'TestSchema',
      messages: [{ role: 'user', content: 'go' }],
      sessionId: 'sess-123',
    });
    expect((lastRequestBody as { session_id?: string }).session_id).toBeUndefined();
  });
});

describe('OpenRouterProvider.listModels', () => {
  it('converts per-token pricing to per-1M and sorts cheapest-completion first', async () => {
    modelsResponse = () => ({
      status: 200,
      body: {
        data: [
          { id: 'pricey/model', name: 'Pricey', pricing: { prompt: '0.00001', completion: '0.00003' } },
          { id: 'cheap/model', name: 'Cheap', pricing: { prompt: '0.0000001', completion: '0.0000002' } },
        ],
      },
    });

    const provider = new OpenRouterProvider('test-key', { baseURL });
    const models = await provider.listModels();

    expect(models.map((m) => m.id)).toEqual(['cheap/model', 'pricey/model']);
    expect(models[0]!.pricing!.promptPerM).toBeCloseTo(0.1, 6);
    expect(models[0]!.pricing!.completionPerM).toBeCloseTo(0.2, 6);
  });

  it('treats -1 sentinel pricing (variable-priced router models) as unknown, not negative', async () => {
    modelsResponse = () => ({
      status: 200,
      body: {
        data: [{ id: 'openrouter/auto', name: 'Auto', pricing: { prompt: '-1', completion: '-1' } }],
      },
    });

    const provider = new OpenRouterProvider('test-key', { baseURL });
    const models = await provider.listModels();

    expect(models[0]!.pricing).toBeNull();
  });

  it('throws when the /models endpoint returns a non-OK status', async () => {
    modelsResponse = () => ({ status: 500, body: { error: 'boom' } });
    const provider = new OpenRouterProvider('test-key', { baseURL });
    await expect(provider.listModels()).rejects.toThrow(/500/);
  });
});
