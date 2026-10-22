import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { HttpDevDigestApi } from './api/http.js';
import { loadConfig } from './config.js';
import { log } from './log.js';
import { createServer } from './server.js';

// Composition root: the only place that constructs the concrete HTTP adapter.
async function main(): Promise<void> {
  const config = loadConfig(process.env);
  const server = createServer({ api: new HttpDevDigestApi(config.apiUrl), config });
  await server.connect(new StdioServerTransport());
  log.info('devdigest-mcp ready', { apiUrl: config.apiUrl });

  const shutdown = () => {
    void server.close().finally(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

process.on('uncaughtException', (err) => log.error('uncaught exception', { message: err.message }));
process.on('unhandledRejection', (reason) => log.error('unhandled rejection', { reason: String(reason) }));

main().catch((err) => {
  log.error('fatal', { message: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
