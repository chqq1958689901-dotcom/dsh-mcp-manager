/**
 * Stable boundary between the manager and a concrete DSH MCP client.
 *
 * The manager intentionally does not import @deepseek-ai/dsh-mcp-client:
 * the upstream package currently declares workspace:* peer dependencies,
 * so consumers must provide the host-compatible client rather than assume
 * the package is independently installable.
 */
export interface ToolDefinition {
  readonly name: string;
  readonly description?: string;
  readonly inputSchema?: Readonly<Record<string, unknown>>;
}

export interface ToolCallResult {
  readonly content: readonly unknown[];
  readonly isError?: boolean;
  readonly [key: string]: unknown;
}

export interface McpAdapter {
  /** Unique, stable identifier within one manager instance. */
  readonly id: string;
  /** Establish the underlying MCP connection. */
  connect(): Promise<void>;
  /** Close the underlying MCP connection and release resources. */
  disconnect(): Promise<void>;
  /** Return tools currently exposed by this adapter. */
  listTools(): Promise<readonly ToolDefinition[]>;
  /** Invoke a tool exposed by this adapter. */
  callTool(name: string, args?: Readonly<Record<string, unknown>>): Promise<ToolCallResult>;
}

export type AdapterStatus = "registered" | "connecting" | "connected" | "disconnecting" | "disconnected" | "failed";

export interface AdapterSnapshot {
  readonly id: string;
  readonly status: AdapterStatus;
}
