import type { McpServerConfig } from "./config.js";

export interface DshFiber {
  await(): Promise<unknown>;
  dispose(): Promise<unknown>;
}

export interface DshPluginContext {
  plugin(plugin: unknown, config: unknown): DshFiber;
}

export interface DshConnectionStatusHandle {
  current(): { state: string; toolCount?: number; [key: string]: unknown };
  closure(): { closeConfirmed: boolean; cleanupError?: string };
}

export interface DshProbeOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

export type DshProbeResult =
  | {
      ok: true;
      serverInfo?: { name: string; version: string };
      toolNames: string[];
      truncated: boolean;
      durationMs: number;
      closeConfirmed: boolean;
      cleanupError?: string;
    }
  | {
      ok: false;
      stage: "connect" | "list";
      message: string;
      durationMs: number;
      closeConfirmed: boolean;
      cleanupError?: string;
    };

/**
 * Structural subset of @deepseek-ai/dsh-mcp-client@0.2.2-rc.1.
 * Inject the real module at the host boundary; this avoids importing its
 * workspace:* peer graph into a standalone package.
 */
export interface DshMcpClientRuntime {
  readonly plugin: unknown;
  Config(input: Record<string, unknown>): unknown;
  connectionStatusOf(fiber: DshFiber): DshConnectionStatusHandle | undefined;
  probeServer(
    context: DshPluginContext,
    config: unknown,
    options?: DshProbeOptions,
  ): Promise<DshProbeResult>;
}

function toClientConfig(name: string, entry: McpServerConfig): Record<string, unknown> {
  const common = {
    serverName: name,
    startupTimeoutMs: entry.startupTimeoutMs,
    toolCallTimeoutMs: entry.toolCallTimeoutMs,
    closeTimeoutMs: entry.closeTimeoutMs,
    reconnect: entry.reconnect,
    expandTemplates: true,
    failOnStartupError: true,
  };
  if (entry.transport === "stdio") {
    return {
      ...common,
      transport: "stdio",
      command: entry.command,
      args: [...entry.args],
      env: { ...entry.env },
      cwd: entry.cwd,
    };
  }
  return {
    ...common,
    transport: "streamable-http",
    url: entry.url,
    headers: { ...entry.headers },
  };
}

/**
 * A concrete lifecycle adapter for the official DSH MCP client plugin.
 * It delegates transport, protocol negotiation, tool registration, reconnect,
 * and execution to the upstream client instead of reimplementing MCP.
 */
export class DshMcpClientAdapter {
  private fiber?: DshFiber;

  constructor(
    readonly id: string,
    private readonly context: DshPluginContext,
    private readonly runtime: DshMcpClientRuntime,
    private config: McpServerConfig,
  ) {
    if (!id.trim()) throw new TypeError("Adapter id must not be empty");
  }

  updateConfig(config: McpServerConfig): void {
    if (this.fiber !== undefined) throw new Error("Cannot replace config while the DSH client is mounted");
    this.config = config;
  }

  async connect(): Promise<void> {
    if (this.fiber !== undefined) return;
    const resolved = this.runtime.Config(toClientConfig(this.id, this.config));
    const fiber = this.context.plugin(this.runtime.plugin, resolved);
    this.fiber = fiber;
    try {
      await fiber.await();
      const status = this.runtime.connectionStatusOf(fiber)?.current();
      if (status !== undefined && status.state !== "connected") {
        throw new Error(`DSH MCP client "${this.id}" activated in state "${status.state}"`);
      }
    } catch (error) {
      try {
        await fiber.dispose();
      } catch {
        // Preserve the startup error; cleanup status remains available on the fiber.
      }
      this.fiber = undefined;
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    const fiber = this.fiber;
    if (fiber === undefined) return;
    await fiber.dispose();
    const closure = this.runtime.connectionStatusOf(fiber)?.closure();
    if (closure !== undefined && (!closure.closeConfirmed || closure.cleanupError !== undefined)) {
      throw new Error(
        `DSH MCP client "${this.id}" cleanup incomplete: ${closure.cleanupError ?? "transport closure unconfirmed"}`,
      );
    }
    this.fiber = undefined;
  }

  status(): { state: string; toolCount?: number } | undefined {
    if (this.fiber === undefined) return undefined;
    const current = this.runtime.connectionStatusOf(this.fiber)?.current();
    if (current === undefined) return undefined;
    return {
      state: current.state,
      ...(typeof current.toolCount === "number" ? { toolCount: current.toolCount } : {}),
    };
  }

  /** Run the upstream one-shot probe without registering tools or touching the live fiber. */
  probe(options?: DshProbeOptions): Promise<DshProbeResult> {
    const config = this.runtime.Config(toClientConfig(this.id, this.config));
    return this.runtime.probeServer(this.context, config, options);
  }
}
