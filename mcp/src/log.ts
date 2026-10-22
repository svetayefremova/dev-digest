// stdout is the MCP protocol channel — every log line goes to stderr.
function write(level: 'info' | 'warn' | 'error', msg: string, data?: unknown): void {
  process.stderr.write(`${JSON.stringify({ level, msg, ...(data === undefined ? {} : { data }) })}\n`);
}

export const log = {
  info: (msg: string, data?: unknown) => write('info', msg, data),
  warn: (msg: string, data?: unknown) => write('warn', msg, data),
  error: (msg: string, data?: unknown) => write('error', msg, data),
};
