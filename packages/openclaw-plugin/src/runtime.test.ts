import { describe, expect, it } from "vitest";
import { getAgentInstance, removeAgentInstance, setAgentInstance } from "./runtime.js";

describe("agent runtime registry", () => {
  it("only removes the expected live instance", () => {
    const first = {} as never;
    const second = {} as never;
    setAgentInstance("account", first);
    expect(removeAgentInstance("account", second)).toBe(first);
    expect(getAgentInstance("account")).toBe(first);
    expect(removeAgentInstance("account", first)).toBe(first);
    expect(getAgentInstance("account")).toBeUndefined();
  });
});
