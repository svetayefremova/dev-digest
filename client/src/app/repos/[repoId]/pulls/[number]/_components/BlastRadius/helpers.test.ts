import { describe, it, expect } from "vitest";
import type { BlastRadiusResponse } from "@devdigest/shared";
import { blastStats } from "./helpers";

const sym = (name: string) => ({ name, file: "src/x.ts", kind: "function" });

describe("blastStats", () => {
  it("T4: counts symbols and unique callers/endpoints/crons across groups", () => {
    const data: Pick<BlastRadiusResponse, "changed_symbols" | "downstream"> = {
      changed_symbols: [sym("a"), sym("b"), sym("c")],
      downstream: [
        {
          symbol: "a",
          callers: [
            { name: "x", file: "src/x.ts", line: 1 },
            { name: "y", file: "src/y.ts", line: 2 },
          ],
          endpoints_affected: ["GET /one", "GET /two"],
          crons_affected: ["nightly"],
        },
        {
          symbol: "b",
          // same caller as in group a -> counted once; one new caller
          callers: [
            { name: "x", file: "src/x.ts", line: 1 },
            { name: "z", file: "src/z.ts", line: 3 },
          ],
          endpoints_affected: ["GET /two"],
          crons_affected: ["nightly", "hourly"],
        },
      ],
    };
    expect(blastStats(data)).toEqual({ symbols: 3, callers: 3, endpoints: 2, crons: 2 });
  });

  it("T4: returns zeros when there is no downstream", () => {
    expect(blastStats({ changed_symbols: [], downstream: [] })).toEqual({
      symbols: 0,
      callers: 0,
      endpoints: 0,
      crons: 0,
    });
  });
});
