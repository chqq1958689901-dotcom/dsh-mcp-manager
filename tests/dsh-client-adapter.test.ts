import { describe, expect, it, vi } from "vitest";
import { DshMcpClientAdapter, testMcpConnection } from "../src/index.js";
import type { DshMcpClientRuntime, DshFiber } from "../src/index.js";

function setup() {
  const fiber: DshFiber = { await: vi.fn(async () => undefined), dispose: vi.fn(async () => undefined) };
  const status = { current: () => ({ state: "connected", toolCount: 2 }), closure: () => ({ closeConfirmed: true }) };
  const runtime: DshMcpClientRuntime = {
    plugin: { apply: vi.fn() },
    Config: vi.fn((value) => value),
    connectionStatusOf: vi.fn(() => status),
    probeServer: vi.fn(async () => ({
      ok: true as const, serverInfo: { name: "fixture", version: "1" },
      toolNames: ["echo", "ping"], truncated: false, durationMs: 5, closeConfirmed: true,
    })),
  };
  const context = { plugin: vi.fn(() => fiber) };
  const config = {
    transport: "stdio" as const, command: "node", args: ["fixture.js"], env: {}, cwd: "",
    enabled: true, startupTimeoutMs: 1000,
    reconnect: { enabled: true, initialDelayMs: 500, maxDelayMs: 2000, maxAttempts: 3 },
  };
  return { fiber, runtime, context, config };
}

describe("DshMcpClientAdapter", () => {
  it("mounts and disposes the real DSH plugin through the injected host runtime", async () => {
    const { fiber, runtime, context, config } = setup();
    const adapter = new DshMcpClientAdapter("fixture", context, runtime, config);
    await adapter.connect();
    expect(context.plugin).toHaveBeenCalledOnce();
    expect(runtime.Config).toHaveBeenCalledWith(expect.objectContaining({
      transport: "stdio", serverName: "fixture", failOnStartupError: true, expandTemplates: true,
    }));
    expect(adapter.status()).toEqual({ state: "connected", toolCount: 2 });
    await adapter.disconnect();
    expect(fiber.dispose).toHaveBeenCalledOnce();
  });

  it("uses the upstream one-shot probe and requires confirmed cleanup", async () => {
    const { runtime, context, config } = setup();
    const adapter = new DshMcpClientAdapter("fixture", context, runtime, config);
    const result = await testMcpConnection(adapter, { timeoutMs: 500 });
    expect(result).toMatchObject({ ok: true, toolNames: ["echo", "ping"], closeConfirmed: true });
    expect(runtime.probeServer).toHaveBeenCalledOnce();
  });

  it("surfaces startup failure and disposes the failed fiber", async () => {
    const { fiber, runtime, context, config } = setup();
    vi.mocked(fiber.await).mockRejectedValueOnce(new Error("initialize failed"));
    const adapter = new DshMcpClientAdapter("fixture", context, runtime, config);
    await expect(adapter.connect()).rejects.toThrow("initialize failed");
    expect(fiber.dispose).toHaveBeenCalledOnce();
  });
});
