import { describe, expect, it, vi } from "vitest";
import {
  AdapterAlreadyRegisteredError,
  AdapterNotConnectedError,
  AdapterNotFoundError,
  McpManager,
} from "../src/index.js";
import type { McpAdapter } from "../src/index.js";

function makeAdapter(id = "local"): McpAdapter {
  return {
    id,
    connect: vi.fn(async () => undefined),
    disconnect: vi.fn(async () => undefined),
    listTools: vi.fn(async () => [{ name: "echo", inputSchema: { type: "object" } }]),
    callTool: vi.fn(async (name, args) => ({
      content: [{ type: "text", text: JSON.stringify({ name, args }) }],
    })),
  };
}

describe("McpManager", () => {
  it("registers adapters and reports their initial status", () => {
    const manager = new McpManager();
    expect(manager.register(makeAdapter())).toEqual({ id: "local", status: "registered" });
    expect(manager.listAdapters()).toEqual([{ id: "local", status: "registered" }]);
  });

  it("rejects duplicate adapter ids", () => {
    const manager = new McpManager();
    manager.register(makeAdapter());
    expect(() => manager.register(makeAdapter())).toThrow(AdapterAlreadyRegisteredError);
  });

  it("connects, lists tools, dispatches calls, and disconnects", async () => {
    const manager = new McpManager();
    const adapter = makeAdapter();
    manager.register(adapter);

    await expect(manager.connect("local")).resolves.toEqual({ id: "local", status: "connected" });
    await expect(manager.listTools("local")).resolves.toHaveLength(1);
    await expect(manager.callTool("local", "echo", { value: 42 })).resolves.toMatchObject({
      content: [{ type: "text" }],
    });
    await expect(manager.disconnect("local")).resolves.toEqual({ id: "local", status: "disconnected" });

    expect(adapter.connect).toHaveBeenCalledOnce();
    expect(adapter.callTool).toHaveBeenCalledWith("echo", { value: 42 });
    expect(adapter.disconnect).toHaveBeenCalledOnce();
  });

  it("does not dispatch tools while disconnected", async () => {
    const manager = new McpManager();
    manager.register(makeAdapter());
    await expect(manager.listTools("local")).rejects.toThrow(AdapterNotConnectedError);
    await expect(manager.callTool("local", "echo")).rejects.toThrow(AdapterNotConnectedError);
  });

  it("reports unknown adapters", async () => {
    const manager = new McpManager();
    await expect(manager.connect("missing")).rejects.toThrow(AdapterNotFoundError);
  });

  it("marks an adapter failed when connect throws", async () => {
    const manager = new McpManager();
    const adapter = makeAdapter();
    vi.mocked(adapter.connect).mockRejectedValueOnce(new Error("connection refused"));
    manager.register(adapter);

    await expect(manager.connect("local")).rejects.toThrow("connection refused");
    expect(manager.listAdapters()).toEqual([{ id: "local", status: "failed" }]);
  });
});
