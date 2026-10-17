/** Compact token count for dense meta rows: 950 → "950", 8240 → "8.2K", 1_250_000 → "1.3M". */
export function formatTokens(n: number | null | undefined): string {
  if (n == null) return "–";
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}
