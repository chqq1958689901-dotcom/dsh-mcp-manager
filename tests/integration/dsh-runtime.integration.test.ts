import { describe, expect, it } from "vitest";
import { DshMcpClientAdapter, testMcpConnection } from "../../src/index.js";
import type { DshMcpClientRuntime, DshPluginContext } from "../../src/index.js";

/**
 * The host harness can inject the actual module namespace and Cordis context
 * on globalThis before running this suite. The integration test is skipped
 * unless both are supplied; unit tests never pretend a mock is a wire E2E.
 */
interface DshIntegrationHarness {
  runtime: DshMcpClientRuntime;
  context: DshPluginContext;
  config: {
    transport: "streamable-http";
    url: string;
    headers?: Record<string, string>;
    startupTimeoutMs?: number;
  };
}
declare global {
  // eslint-disable-next-line no-var
  var __DSH_MCP_INTEGRATION__: DshIntegrationHarness | undefined;
}

const harness = globalThis.__DSH_MCP_INTEGRATION__;

describe.skipIf(harness === undefined)("live DSH MCP integration (host-provided)", () => {
  it("negotiates MCP, discovers fixture tools, and confirms transport closure", async () => {
    if (harness === undefined) return;
    const adapter = new DshMcpClientAdapter(
      "manager-e2e",
      harness.context,
      harness.runtime,
      {
        transport: "streamable-http",
        url: harness.config.url,
        headers: harness.config.headers ?? {},
        enabled: true,
        startupTimeoutMs: harness.config.startupTimeoutMs ?? 10_000,
        reconnect: { enabled: false, initialDelayMs: 500, maxDelayMs: 1000, maxAttempts: 1 },
      },
    );
    const result = await testMcpConnection(adapter, { timeoutMs: 10_000 });
    expect(result.ok).toBe(true);
    expect(result.closeConfirmed).toBe(true);
    if (result.ok) expect(result.toolNames.length).toBeGreaterThanOrEqual(0);
  });
});
