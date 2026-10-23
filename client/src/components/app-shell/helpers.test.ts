import { describe, it, expect } from "vitest";
import { activeKeyFor } from "./helpers";

describe("activeKeyFor", () => {
  it("SPEC-02 AC-3: the add-repository page /onboarding does not mark any tab (not the tour tab) active", () => {
    expect(activeKeyFor("/onboarding")).toBe("");
  });

  it("SPEC-02 AC-2: the tour page of a repo marks the onboarding-tour tab active, and its neighbours keep their own keys", () => {
    expect(activeKeyFor("/repos/x/onboarding-tour")).toBe("onboarding-tour");
    expect(activeKeyFor("/repos/x/context")).toBe("context");
    expect(activeKeyFor("/repos/x/pulls")).toBe("pulls");
  });
});
