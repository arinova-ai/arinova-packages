import { afterEach, describe, expect, it, vi } from "vitest";
import plugin, { buildArinovaPromptContext, isHealthy, shutdownOffice } from "./index.js";

afterEach(() => shutdownOffice());

describe("Arinova plugin", () => {
  it("builds credential-free prompt context", () => {
    const context = buildArinovaPromptContext().prependContext;
    expect(context).toContain("the channel streams your response automatically");
    expect(context).not.toMatch(/Authorization:|Bearer |botToken|curl /);
  });

  it("registers one CLI root and restarts office maintenance with the gateway", () => {
    const handlers = new Map<string, () => void>();
    const api = {
      runtime: {},
      config: { channels: {} },
      logger: { warn: vi.fn() },
      registerChannel: vi.fn(),
      registerCli: vi.fn(),
      registerHttpRoute: vi.fn(),
      on: vi.fn((name: string, handler: () => void) => handlers.set(name, handler)),
    };

    plugin.register(api as never);
    expect(api.registerChannel).toHaveBeenCalledOnce();
    expect(api.registerCli).toHaveBeenCalledOnce();
    expect(api.registerHttpRoute).toHaveBeenCalledWith(expect.objectContaining({
      path: "/plugins/openclaw-arinova-ai/office/status",
      auth: "gateway",
    }));
    expect(isHealthy()).toBe(true);

    handlers.get("gateway_stop")?.();
    expect(isHealthy()).toBe(false);
    handlers.get("gateway_start")?.();
    expect(isHealthy()).toBe(true);
  });
});
