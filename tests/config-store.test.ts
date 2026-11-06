import { describe, expect, it, vi } from "vitest";
import { MemoryMcpConfigStorage, McpConfigStore, parseServerConfig, parseServerMap } from "../src/index.js";

const stdio = { transport: "stdio", command: "node", args: ["server.js"] } as const;

describe("MCP server configuration", () => {
  it("normalizes stdio defaults", () => {
    expect(parseServerConfig(stdio, "local")).toMatchObject({
      transport: "stdio", command: "node", args: ["server.js"], env: {}, cwd: "",
      enabled: true, startupTimeoutMs: 30_000, reconnect: { enabled: true, initialDelayMs: 500 },
    });
  });

  it("rejects invalid names and cross-transport fields", () => {
    expect(() => parseServerMap({ "bad name": stdio })).toThrow(/server name/);
    expect(() => parseServerConfig({ transport: "stdio", command: "node", url: "https://example.com" })).toThrow(/url is not valid/);
    expect(() => parseServerConfig({ transport: "streamable-http", url: "file:///tmp/socket" })).toThrow(/http or https/);
  });

  it("rejects inconsistent reconnect backoff", () => {
    expect(() => parseServerConfig({
      ...stdio, reconnect: { initialDelayMs: 5000, maxDelayMs: 1000 },
    })).toThrow(/must not exceed/);
  });
});

describe("McpConfigStore", () => {
  it("loads, creates, updates, enables, and deletes persisted entries", async () => {
    const storage = new MemoryMcpConfigStorage({ local: stdio });
    const store = new McpConfigStore(storage);
    await store.load();
    await store.create("remote", { transport: "streamable-http", url: "https://example.com/mcp" });
    await store.setEnabled("remote", false);
    expect(store.get("remote")?.enabled).toBe(false);
    await store.update("remote", { transport: "streamable-http", url: "https://example.org/mcp" });
    expect(store.get("remote")).toMatchObject({ url: "https://example.org/mcp", enabled: true });
    await store.delete("local");
    expect(Object.keys(store.list())).toEqual(["remote"]);
  });

  it("does not publish a write when storage persistence fails", async () => {
    const storage = new MemoryMcpConfigStorage();
    const store = new McpConfigStore(storage);
    await store.load();
    vi.spyOn(storage, "save").mockRejectedValueOnce(new Error("disk unavailable"));
    await expect(store.create("local", stdio)).rejects.toThrow("disk unavailable");
    expect(store.get("local")).toBeUndefined();
  });
});
