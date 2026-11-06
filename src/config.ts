export const SERVER_NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;

export interface ReconnectConfig {
  enabled: boolean;
  initialDelayMs: number;
  maxDelayMs: number;
  maxAttempts: number;
}

interface CommonServerConfig {
  enabled: boolean;
  startupTimeoutMs: number;
  toolCallTimeoutMs?: number;
  closeTimeoutMs?: number;
  reconnect: ReconnectConfig;
}

export interface StdioServerConfig extends CommonServerConfig {
  transport: "stdio";
  command: string;
  args: string[];
  env: Record<string, string>;
  cwd: string;
  url?: never;
  headers?: never;
}

export interface StreamableHttpServerConfig extends CommonServerConfig {
  transport: "streamable-http";
  url: string;
  headers: Record<string, string>;
  command?: never;
  args?: never;
  env?: never;
  cwd?: never;
}

export type McpServerConfig = StdioServerConfig | StreamableHttpServerConfig;
export type McpServerConfigInput =
  | (Omit<StdioServerConfig, "enabled" | "startupTimeoutMs" | "args" | "env" | "cwd" | "reconnect"> &
      Partial<Pick<StdioServerConfig, "enabled" | "startupTimeoutMs" | "args" | "env" | "cwd" | "reconnect">>)
  | (Omit<StreamableHttpServerConfig, "enabled" | "startupTimeoutMs" | "headers" | "reconnect"> &
      Partial<Pick<StreamableHttpServerConfig, "enabled" | "startupTimeoutMs" | "headers" | "reconnect">>);

export type McpServerMap = Readonly<Record<string, McpServerConfig>>;

export const DEFAULT_RECONNECT: ReconnectConfig = {
  enabled: true,
  initialDelayMs: 500,
  maxDelayMs: 30_000,
  maxAttempts: 10,
};

const MAX_TIMER_DELAY_MS = 2_147_483_647;

function record(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function string(value: unknown, path: string, fallback?: string): string {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== "string") throw new TypeError(`${path} must be a string`);
  return value;
}

function stringMap(value: unknown, path: string): Record<string, string> {
  if (value === undefined) return {};
  const input = record(value, path);
  const output: Record<string, string> = {};
  for (const [key, item] of Object.entries(input)) {
    if (typeof item !== "string") throw new TypeError(`${path}.${key} must be a string`);
    output[key] = item;
  }
  return output;
}

function stringArray(value: unknown, path: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new TypeError(`${path} must be an array of strings`);
  }
  return [...value] as string[];
}

function positiveInteger(value: unknown, path: string, fallback: number): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > MAX_TIMER_DELAY_MS) {
    throw new RangeError(`${path} must be a positive integer no greater than ${MAX_TIMER_DELAY_MS}`);
  }
  return value as number;
}

function parseReconnect(value: unknown, path: string): ReconnectConfig {
  if (value === undefined) return { ...DEFAULT_RECONNECT };
  const input = record(value, path);
  const parsed: ReconnectConfig = {
    enabled: input.enabled === undefined ? DEFAULT_RECONNECT.enabled : input.enabled as boolean,
    initialDelayMs: positiveInteger(input.initialDelayMs, `${path}.initialDelayMs`, DEFAULT_RECONNECT.initialDelayMs),
    maxDelayMs: positiveInteger(input.maxDelayMs, `${path}.maxDelayMs`, DEFAULT_RECONNECT.maxDelayMs),
    maxAttempts: positiveInteger(input.maxAttempts, `${path}.maxAttempts`, DEFAULT_RECONNECT.maxAttempts),
  };
  if (typeof parsed.enabled !== "boolean") throw new TypeError(`${path}.enabled must be a boolean`);
  if (parsed.initialDelayMs > parsed.maxDelayMs) {
    throw new RangeError(`${path}.initialDelayMs must not exceed maxDelayMs`);
  }
  return parsed;
}

/** Parse and normalize one server entry, including cross-transport validation. */
export function parseServerConfig(value: unknown, name = "server"): McpServerConfig {
  const input = record(value, name);
  const common: CommonServerConfig = {
    enabled: input.enabled === undefined ? true : input.enabled as boolean,
    startupTimeoutMs: positiveInteger(input.startupTimeoutMs, `${name}.startupTimeoutMs`, 30_000),
    reconnect: parseReconnect(input.reconnect, `${name}.reconnect`),
    ...(input.toolCallTimeoutMs === undefined ? {} : {
      toolCallTimeoutMs: positiveInteger(input.toolCallTimeoutMs, `${name}.toolCallTimeoutMs`, 60_000),
    }),
    ...(input.closeTimeoutMs === undefined ? {} : {
      closeTimeoutMs: positiveInteger(input.closeTimeoutMs, `${name}.closeTimeoutMs`, 5_000),
    }),
  };
  if (typeof common.enabled !== "boolean") throw new TypeError(`${name}.enabled must be a boolean`);

  if (input.transport === "stdio") {
    const command = string(input.command, `${name}.command`);
    if (!command.trim()) throw new TypeError(`${name}.command must not be empty`);
    if (input.url !== undefined && input.url !== "") throw new TypeError(`${name}.url is not valid for stdio transport`);
    if (input.headers !== undefined && Object.keys(record(input.headers, `${name}.headers`)).length > 0) {
      throw new TypeError(`${name}.headers is not valid for stdio transport`);
    }
    return {
      ...common,
      transport: "stdio",
      command,
      args: stringArray(input.args, `${name}.args`),
      env: stringMap(input.env, `${name}.env`),
      cwd: string(input.cwd, `${name}.cwd`, ""),
    };
  }

  if (input.transport === "streamable-http") {
    const url = string(input.url, `${name}.url`);
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      throw new TypeError(`${name}.url must be an absolute HTTP(S) URL`);
    }
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      throw new TypeError(`${name}.url must use http or https`);
    }
    if (input.command !== undefined && input.command !== "") throw new TypeError(`${name}.command is not valid for streamable-http transport`);
    if (input.args !== undefined && stringArray(input.args, `${name}.args`).length > 0) {
      throw new TypeError(`${name}.args is not valid for streamable-http transport`);
    }
    if (input.env !== undefined && Object.keys(stringMap(input.env, `${name}.env`)).length > 0) {
      throw new TypeError(`${name}.env is not valid for streamable-http transport`);
    }
    if (input.cwd !== undefined && input.cwd !== "") throw new TypeError(`${name}.cwd is not valid for streamable-http transport`);
    return { ...common, transport: "streamable-http", url, headers: stringMap(input.headers, `${name}.headers`) };
  }

  throw new TypeError(`${name}.transport must be "stdio" or "streamable-http"`);
}

/** Validate and normalize a complete server map. */
export function parseServerMap(value: unknown): Record<string, McpServerConfig> {
  const input = record(value, "servers");
  const output: Record<string, McpServerConfig> = {};
  for (const [name, entry] of Object.entries(input)) {
    if (!SERVER_NAME_PATTERN.test(name)) {
      throw new TypeError(`servers.${name}: name must match ${String(SERVER_NAME_PATTERN)}`);
    }
    output[name] = parseServerConfig(entry, `servers.${name}`);
  }
  return output;
}
