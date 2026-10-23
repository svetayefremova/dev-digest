import { describe, it, expect } from "vitest";
import { layoutBlastGraph } from "./graph-layout";

describe("layoutBlastGraph", () => {
  it("T4: lays out symbol -> callers -> endpoints/crons in three columns with solid caller edges and dashed target edges", () => {
    const layout = layoutBlastGraph({
      symbol: "charge",
      callers: [
        { name: "pay", file: "src/pay.ts", line: 10 },
        { name: "refund", file: "src/refund.ts", line: 20 },
      ],
      endpoints_affected: ["POST /pay"],
      crons_affected: ["nightly-settle"],
    });

    const byKind = (k: string) => layout.nodes.filter((n) => n.kind === k);
    expect(byKind("symbol")).toHaveLength(1);
    expect(byKind("caller").map((n) => n.label)).toEqual(["pay", "refund"]);
    expect(byKind("endpoint").map((n) => n.label)).toEqual(["POST /pay"]);
    expect(byKind("cron").map((n) => n.label)).toEqual(["nightly-settle"]);
    expect(layout.nodes).toHaveLength(5);

    // columns: symbol left of callers left of targets; callers share a column
    const symbolX = byKind("symbol")[0]!.x;
    const callerXs = new Set(byKind("caller").map((n) => n.x));
    const targetXs = new Set([...byKind("endpoint"), ...byKind("cron")].map((n) => n.x));
    expect(callerXs.size).toBe(1);
    expect(targetXs.size).toBe(1);
    expect(symbolX).toBeLessThan([...callerXs][0]!);
    expect([...callerXs][0]!).toBeLessThan([...targetXs][0]!);

    // edges: 2 solid (symbol->caller) + 2 dashed (symbol->endpoint/cron)
    expect(layout.edges).toHaveLength(4);
    expect(layout.edges.filter((e) => !e.dashed)).toHaveLength(2);
    expect(layout.edges.filter((e) => e.dashed)).toHaveLength(2);
    for (const e of layout.edges) expect(e.path).toMatch(/^M /);
  });

  it("T4: with no endpoints or crons every edge is solid", () => {
    const layout = layoutBlastGraph({
      symbol: "f",
      callers: [{ name: "g", file: "a.ts", line: 1 }],
      endpoints_affected: [],
      crons_affected: [],
    });
    expect(layout.nodes).toHaveLength(2);
    expect(layout.edges).toHaveLength(1);
    expect(layout.edges[0]!.dashed).toBe(false);
  });
});
