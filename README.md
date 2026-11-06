# dsh-mcp-manager

An adapter-oriented manager core for DeepSeek Harness MCP client instances.

## Upstream compatibility

Targets DeepSeek Harness `v0.2.2-rc.1` and the `@deepseek-ai/dsh-mcp-client@0.2.2-rc.1` API. The upstream MCP client is a Cordis plugin module, not a standalone MCP client class:

- mount with `ctx.plugin(McpClient, McpClient.Config(config))`
- await startup with `fiber.await()`
- inspect status with `connectionStatusOf(fiber)`
- run an isolated connection test with `probeServer(ctx, config, options)`
- dispose with `fiber.dispose()`

The adapter accepts the real upstream module namespace and Cordis context through `DshMcpClientRuntime` and `DshPluginContext`. This deliberate host injection avoids importing the upstream package's `workspace:*` peer dependency graph into this standalone repository. A host integration must pass the actual `@deepseek-ai/dsh-mcp-client@0.2.2-rc.1` namespace and context; mocks are used only in unit tests.

## Configuration

`parseServerConfig` and `parseServerMap` validate `stdio` and `streamable-http` entries, transport-specific fields, URL protocols, timeout bounds, and reconnect policy.

`McpConfigStore` serializes validated create/update/enable/delete operations through an injected `McpConfigStorage`. `MemoryMcpConfigStorage` is for tests and embedding. Production hosts should implement storage using their own ConfigEditor or durable settings layer; credentials should be referenced with `${credential:NAME}` and resolved by the upstream DSH credentials provider.

## Connection test

`DshMcpClientAdapter.probe()` delegates to the upstream one-shot `probeServer()`: connect, read server identity, list tool names, then close. `testMcpConnection()` treats unconfirmed closure or cleanup errors as failures. It does not modify the live adapter instance or register tools.

## Commands

```sh
npm install
npm run typecheck
npm test
npm run test:integration
```

The unit suite tests config validation/persistence and the adapter's lifecycle/probe contract with a controlled runtime double. The live integration suite is opt-in: the host must inject `globalThis.__DSH_MCP_INTEGRATION__` with the actual DSH client namespace, Cordis context, and a reachable Streamable HTTP fixture endpoint before running Vitest. It is skipped otherwise; no mocked test is reported as a real network E2E.

## Current boundaries

- The upstream client itself owns MCP protocol negotiation, transport, reconnect, tool discovery, and tool execution.
- This package currently provides a host adapter and validated configuration store; it does not yet own a Cordis service or Settings UI.
- Tool listing and tool execution remain registered in the host's `ctx.tools` service by the upstream plugin. This adapter exposes connection lifecycle and status; it does not duplicate the host tool registry.
