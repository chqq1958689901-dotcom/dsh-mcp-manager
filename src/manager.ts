import {
  AdapterAlreadyRegisteredError,
  AdapterNotConnectedError,
  AdapterNotFoundError,
} from "./errors.js";
import type {
  AdapterSnapshot,
  AdapterStatus,
  McpAdapter,
  ToolCallResult,
  ToolDefinition,
} from "./types.js";

interface AdapterEntry {
  readonly adapter: McpAdapter;
  status: AdapterStatus;
}

/**
 * Owns adapter registration and connection lifecycle.
 *
 * Calls for a given adapter are guarded by its current lifecycle status.
 * This class does not create or configure DSH clients; concrete adapters
 * bridge the host's supported @deepseek-ai/dsh-mcp-client API.
 */
export class McpManager {
  private readonly adapters = new Map<string, AdapterEntry>();

  register(adapter: McpAdapter): AdapterSnapshot {
    if (!adapter.id.trim()) {
      throw new TypeError("Adapter id must be a non-empty string.");
    }
    if (this.adapters.has(adapter.id)) {
      throw new AdapterAlreadyRegisteredError(adapter.id);
    }

    const entry: AdapterEntry = { adapter, status: "registered" };
    this.adapters.set(adapter.id, entry);
    return this.snapshot(entry);
  }

  unregister(id: string): void {
    const entry = this.requireEntry(id);
    if (entry.status === "connected" || entry.status === "connecting" || entry.status === "disconnecting") {
      throw new Error(`Cannot unregister adapter "${id}" while it is ${entry.status}.`);
    }
    this.adapters.delete(id);
  }

  async connect(id: string): Promise<AdapterSnapshot> {
    const entry = this.requireEntry(id);
    if (entry.status === "connected") return this.snapshot(entry);
    if (entry.status === "connecting" || entry.status === "disconnecting") {
      throw new Error(`Cannot connect adapter "${id}" while it is ${entry.status}.`);
    }

    entry.status = "connecting";
    try {
      await entry.adapter.connect();
      entry.status = "connected";
      return this.snapshot(entry);
    } catch (error) {
      entry.status = "failed";
      throw error;
    }
  }

  async disconnect(id: string): Promise<AdapterSnapshot> {
    const entry = this.requireEntry(id);
    if (entry.status === "registered" || entry.status === "disconnected") {
      entry.status = "disconnected";
      return this.snapshot(entry);
    }
    if (entry.status !== "connected" && entry.status !== "failed") {
      throw new Error(`Cannot disconnect adapter "${id}" while it is ${entry.status}.`);
    }

    entry.status = "disconnecting";
    try {
      await entry.adapter.disconnect();
      entry.status = "disconnected";
      return this.snapshot(entry);
    } catch (error) {
      entry.status = "failed";
      throw error;
    }
  }

  listAdapters(): readonly AdapterSnapshot[] {
    return [...this.adapters.values()].map((entry) => this.snapshot(entry));
  }

  async listTools(id: string): Promise<readonly ToolDefinition[]> {
    const entry = this.requireConnected(id);
    return entry.adapter.listTools();
  }

  async callTool(
    id: string,
    name: string,
    args?: Readonly<Record<string, unknown>>,
  ): Promise<ToolCallResult> {
    const entry = this.requireConnected(id);
    if (!name.trim()) throw new TypeError("Tool name must be a non-empty string.");
    return entry.adapter.callTool(name, args);
  }

  private requireEntry(id: string): AdapterEntry {
    const entry = this.adapters.get(id);
    if (!entry) throw new AdapterNotFoundError(id);
    return entry;
  }

  private requireConnected(id: string): AdapterEntry {
    const entry = this.requireEntry(id);
    if (entry.status !== "connected") {
      throw new AdapterNotConnectedError(id, entry.status);
    }
    return entry;
  }

  private snapshot(entry: AdapterEntry): AdapterSnapshot {
    return { id: entry.adapter.id, status: entry.status };
  }
}
