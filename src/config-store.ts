import { parseServerConfig, parseServerMap } from "./config.js";
import type { McpServerConfig, McpServerConfigInput } from "./config.js";

export interface McpConfigStorage {
  load(): Promise<unknown>;
  save(value: Readonly<Record<string, McpServerConfig>>): Promise<void>;
}

/** In-memory storage useful for tests and embedded hosts. */
export class MemoryMcpConfigStorage implements McpConfigStorage {
  private value: unknown;
  constructor(initial: unknown = {}) { this.value = initial; }
  async load(): Promise<unknown> { return structuredClone(this.value); }
  async save(value: Readonly<Record<string, McpServerConfig>>): Promise<void> {
    this.value = structuredClone(value);
  }
}

/**
 * Serialized, validated configuration repository.
 * Storage is injected so a host can persist through its own ConfigEditor,
 * database, or file layer without coupling this library to a filesystem.
 */
export class McpConfigStore {
  private servers: Record<string, McpServerConfig> = {};
  private tail: Promise<unknown> = Promise.resolve();

  constructor(private readonly storage: McpConfigStorage) {}

  async load(): Promise<Readonly<Record<string, McpServerConfig>>> {
    const loaded = parseServerMap(await this.storage.load());
    this.servers = loaded;
    return this.snapshot();
  }

  list(): Readonly<Record<string, McpServerConfig>> { return this.snapshot(); }

  get(name: string): McpServerConfig | undefined { return this.servers[name]; }

  create(name: string, input: McpServerConfigInput): Promise<void> {
    return this.enqueue(async () => {
      if (Object.hasOwn(this.servers, name)) throw new Error(`MCP server "${name}" already exists`);
      await this.commit({ ...this.servers, [name]: parseServerConfig(input, `servers.${name}`) });
    });
  }

  update(name: string, input: McpServerConfigInput): Promise<void> {
    return this.enqueue(async () => {
      if (!Object.hasOwn(this.servers, name)) throw new Error(`Unknown MCP server "${name}"`);
      await this.commit({ ...this.servers, [name]: parseServerConfig(input, `servers.${name}`) });
    });
  }

  setEnabled(name: string, enabled: boolean): Promise<void> {
    return this.enqueue(async () => {
      const current = this.require(name);
      await this.commit({ ...this.servers, [name]: parseServerConfig({ ...current, enabled }, `servers.${name}`) });
    });
  }

  delete(name: string): Promise<void> {
    return this.enqueue(async () => {
      this.require(name);
      const next = { ...this.servers };
      delete next[name];
      await this.commit(next);
    });
  }

  private require(name: string): McpServerConfig {
    const entry = this.servers[name];
    if (entry === undefined) throw new Error(`Unknown MCP server "${name}"`);
    return entry;
  }

  private async commit(next: Record<string, McpServerConfig>): Promise<void> {
    const normalized = parseServerMap(next);
    await this.storage.save(normalized);
    this.servers = normalized;
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation);
    this.tail = result.then(() => undefined, () => undefined);
    return result;
  }

  private snapshot(): Readonly<Record<string, McpServerConfig>> {
    return structuredClone(this.servers);
  }
}
