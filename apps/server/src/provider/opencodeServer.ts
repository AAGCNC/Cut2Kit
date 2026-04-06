import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";
import { createOpencodeClient, type OpencodeClient } from "@opencode-ai/sdk";

export interface ManagedOpenCodeServer {
  readonly baseUrl: string;
  readonly client: OpencodeClient;
  close(): void;
}

export interface OpenCodeRemoteEndpoint {
  readonly baseUrl: string;
  readonly authToken?: string;
}

export function trimToUndefined(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function buildOpenCodeModelSlug(providerID: string, modelID: string): string {
  return `${providerID}/${modelID}`;
}

export function parseOpenCodeServerUrl(
  value: string | null | undefined,
): { readonly baseUrl: string } | { readonly error: string } | null {
  const trimmed = trimToUndefined(value);
  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { error: "OpenCode server URL must use http:// or https://." };
    }
    url.hash = "";
    url.search = "";
    const normalized = url.toString().replace(/\/+$/, "");
    return { baseUrl: normalized };
  } catch {
    return { error: `Invalid OpenCode server URL '${trimmed}'.` };
  }
}

export function buildOpenCodeAuthHeaders(
  authToken: string | null | undefined,
): Record<string, string> | undefined {
  const token = trimToUndefined(authToken);
  if (!token) {
    return undefined;
  }

  return {
    authorization: /^bearer\s+/i.test(token) ? token : `Bearer ${token}`,
  };
}

export function parseOpenCodeModelRef(model: string | null | undefined): {
  readonly providerID: string;
  readonly modelID: string;
} | null {
  const trimmed = trimToUndefined(model);
  if (!trimmed) {
    return null;
  }
  const separatorIndex = trimmed.indexOf("/");
  if (separatorIndex <= 0 || separatorIndex >= trimmed.length - 1) {
    return null;
  }
  const providerID = trimToUndefined(trimmed.slice(0, separatorIndex));
  const modelID = trimToUndefined(trimmed.slice(separatorIndex + 1));
  if (!providerID || !modelID) {
    return null;
  }
  return { providerID, modelID };
}

export function createScopedOpenCodeClient(
  baseUrl: string,
  directory?: string,
  authToken?: string,
): OpencodeClient {
  const headers = buildOpenCodeAuthHeaders(authToken);
  return createOpencodeClient({
    baseUrl,
    throwOnError: true,
    ...(headers ? { headers } : {}),
    ...(directory ? { directory } : {}),
  });
}

export function unixMillisToIso(value: number | undefined | null): string | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  return new Date(value).toISOString();
}

export function openCodeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message.trim();
  }
  return String(error);
}

async function reserveOpenCodePort(hostname: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, hostname, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Failed to reserve an OpenCode port.")));
        return;
      }
      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}

function stopOpenCodeProcess(child: ChildProcess): void {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  child.kill();
}

async function waitForOpenCodeHealth(input: {
  readonly baseUrl: string;
  readonly child: ChildProcess;
  readonly timeoutMs: number;
  readonly outputRef: { value: string };
}): Promise<void> {
  const deadline = Date.now() + input.timeoutMs;
  while (Date.now() < deadline) {
    if (input.child.exitCode !== null || input.child.signalCode !== null) {
      throw new Error(
        input.outputRef.value.trim().length > 0
          ? input.outputRef.value.trim()
          : `OpenCode server exited before becoming healthy (exit=${input.child.exitCode ?? "unknown"}).`,
      );
    }

    try {
      const response = await fetch(`${input.baseUrl}/global/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // Server is still starting up.
    }

    await sleep(100);
  }

  throw new Error(
    input.outputRef.value.trim().length > 0
      ? `Timed out waiting for OpenCode server health check. ${input.outputRef.value.trim()}`
      : "Timed out waiting for OpenCode server health check.",
  );
}

export async function startManagedOpenCodeServer(input: {
  readonly binaryPath: string;
  readonly configPath?: string;
  readonly cwd?: string;
  readonly hostname?: string;
  readonly timeoutMs?: number;
}): Promise<ManagedOpenCodeServer> {
  const hostname = input.hostname ?? "127.0.0.1";
  const timeoutMs = input.timeoutMs ?? 8_000;
  const port = await reserveOpenCodePort(hostname);
  const baseUrl = `http://${hostname}:${port}`;
  const outputRef = { value: "" };
  const child = spawn(input.binaryPath, ["serve", `--hostname=${hostname}`, `--port=${port}`], {
    cwd: input.cwd ?? process.cwd(),
    env: {
      ...process.env,
      OPENCODE_DISABLE_AUTOUPDATE: "1",
      ...(input.configPath ? { OPENCODE_CONFIG: input.configPath } : {}),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk: Buffer | string) => {
    outputRef.value += chunk.toString();
  });
  child.stderr.on("data", (chunk: Buffer | string) => {
    outputRef.value += chunk.toString();
  });

  try {
    await waitForOpenCodeHealth({ baseUrl, child, timeoutMs, outputRef });
  } catch (error) {
    stopOpenCodeProcess(child);
    throw error;
  }

  return {
    baseUrl,
    client: createScopedOpenCodeClient(baseUrl),
    close() {
      stopOpenCodeProcess(child);
    },
  };
}
