/** Copy the command only: drop a trailing `# comment` (AC-43). */
export function stripTrailingComment(command: string): string {
  return command.replace(/\s+#.*$/, "").trim();
}
