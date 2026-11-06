import type { DshMcpClientAdapter, DshProbeOptions, DshProbeResult } from "./dsh-client-adapter.js";

/** Probe a configured server through the official DSH MCP client's probeServer(). */
export async function testMcpConnection(
  adapter: DshMcpClientAdapter,
  options?: DshProbeOptions,
): Promise<DshProbeResult> {
  const result = await adapter.probe(options);
  if (!result.closeConfirmed || result.cleanupError !== undefined) {
    throw new Error(
      `MCP probe completed but cleanup was not confirmed: ${result.cleanupError ?? "transport closure unconfirmed"}`,
    );
  }
  return result;
}
