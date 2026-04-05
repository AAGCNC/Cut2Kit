import type { ModelCapabilities, ServerProvider, ServerProviderAuth, ServerProviderModel } from "@t3tools/contracts";
import { Duration, Effect, Equal, Layer, Option, Result, Schema, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import { ServerSettingsError } from "@t3tools/contracts";
import { ServerSettingsService } from "../../serverSettings";
import { makeManagedServerProvider } from "../makeManagedServerProvider";
import {
  buildServerProvider,
  type CommandResult,
  DEFAULT_TIMEOUT_MS,
  detailFromResult,
  isCommandMissingCause,
  parseGenericCliVersion,
  providerModelsFromSettings,
  spawnAndCollect,
} from "../providerSnapshot";
import { OpenCodeProvider } from "../Services/OpenCodeProvider";
import {
  buildOpenCodeModelSlug,
  createScopedOpenCodeClient,
  openCodeErrorMessage,
  parseOpenCodeServerUrl,
  startManagedOpenCodeServer,
  trimToUndefined,
} from "../opencodeServer";

const PROVIDER = "opencode" as const;
const EMPTY_CAPABILITIES: ModelCapabilities = {
  reasoningEffortLevels: [],
  supportsFastMode: false,
  supportsThinkingToggle: false,
  contextWindowOptions: [],
  promptInjectedEffortLevels: [],
};

export type OpenCodeProviderList = {
  readonly all: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly models?: Record<
      string,
      {
        readonly id: string;
        readonly name: string;
      }
    >;
  }>;
  readonly connected: ReadonlyArray<string>;
  readonly default: Record<string, string>;
};

class OpenCodeProviderProbeError extends Schema.TaggedErrorClass<OpenCodeProviderProbeError>()(
  "OpenCodeProviderProbeError",
  {
    detail: Schema.String,
    cause: Schema.optional(Schema.Defect),
  },
) {}

function buildOpenCodeModelName(input: {
  readonly providerName: string;
  readonly modelName: string;
}): string {
  return `${input.providerName} · ${input.modelName}`;
}

export function buildOpenCodeModels(
  providerList: OpenCodeProviderList,
): ReadonlyArray<ServerProviderModel> {
  const defaults = new Set(
    Object.entries(providerList.default).map(([providerID, modelID]) =>
      buildOpenCodeModelSlug(providerID, modelID),
    ),
  );

  return providerList.all
    .filter((provider) => Object.keys(provider.models ?? {}).length > 0)
    .flatMap((provider) =>
      Object.values(provider.models ?? {}).map((model) => ({
        slug: buildOpenCodeModelSlug(provider.id, model.id),
        name: buildOpenCodeModelName({
          providerName: provider.name,
          modelName: trimToUndefined(model.name) ?? model.id,
        }),
        isCustom: false,
        capabilities: EMPTY_CAPABILITIES,
      })),
    )
    .toSorted((left, right) => {
      const leftDefault = defaults.has(left.slug);
      const rightDefault = defaults.has(right.slug);
      if (leftDefault !== rightDefault) {
        return leftDefault ? -1 : 1;
      }
      return left.name.localeCompare(right.name);
    });
}

function buildOpenCodeAuth(input: {
  readonly connectedProviders: ReadonlyArray<{ id: string; name: string }>;
}): Pick<ServerProviderAuth, "status" | "type" | "label"> {
  if (input.connectedProviders.length === 0) {
    return { status: "unauthenticated" };
  }
  if (input.connectedProviders.length === 1) {
    const provider = input.connectedProviders[0]!;
    return {
      status: "authenticated",
      type: provider.id,
      label: `${provider.name} connected`,
    };
  }
  return {
    status: "authenticated",
    type: "multi",
    label: `${input.connectedProviders.length} providers connected`,
  };
}

export function summarizeOpenCodeAvailability(
  input:
    | {
        readonly mode: "remote";
        readonly baseUrl: string;
        readonly connectedProviders: ReadonlyArray<{ id: string; name: string }>;
        readonly discoveredModelCount: number;
        readonly customModelCount: number;
      }
    | {
        readonly mode: "managed";
        readonly connectedProviders: ReadonlyArray<{ id: string; name: string }>;
        readonly discoveredModelCount: number;
        readonly customModelCount: number;
      },
): {
  readonly status: "ready" | "error";
  readonly auth: ServerProviderAuth;
  readonly message: string;
} {
  if (input.connectedProviders.length > 0) {
    return {
      status: "ready",
      auth: buildOpenCodeAuth({ connectedProviders: input.connectedProviders }),
      message:
        input.connectedProviders.length === 1
          ? input.mode === "remote"
            ? `Connected to ${input.connectedProviders[0]!.name} through OpenCode at ${input.baseUrl}.`
            : `Using ${input.connectedProviders[0]!.name} through OpenCode.`
          : input.mode === "remote"
            ? `Connected to ${input.connectedProviders.length} authenticated providers through OpenCode at ${input.baseUrl}.`
            : `Using ${input.connectedProviders.length} authenticated providers through OpenCode.`,
    };
  }

  if (input.discoveredModelCount > 0) {
    return {
      status: "ready",
      auth: { status: "unknown" },
      message:
        input.mode === "remote"
          ? `Connected to OpenCode at ${input.baseUrl}. ${input.discoveredModelCount} model${input.discoveredModelCount === 1 ? " is" : "s are"} available for local or self-hosted routing.`
          : `${input.discoveredModelCount} model${input.discoveredModelCount === 1 ? " is" : "s are"} available through local OpenCode routing.`,
    };
  }

  if (input.customModelCount > 0) {
    return {
      status: "ready",
      auth: { status: "unknown" },
      message:
        input.mode === "remote"
          ? `Connected to OpenCode at ${input.baseUrl}. Using ${input.customModelCount} manual provider/model slug${input.customModelCount === 1 ? "" : "s"} from Cut2Kit settings.`
          : `Using ${input.customModelCount} manual provider/model slug${input.customModelCount === 1 ? "" : "s"} through local OpenCode routing.`,
    };
  }

  return {
    status: "error",
    auth: { status: "unknown" },
    message:
      input.mode === "remote"
        ? `Connected to OpenCode at ${input.baseUrl}, but no usable models were discovered. Configure a local or hosted provider inside OpenCode, or save a manual provider/model slug in Settings.`
        : "OpenCode is installed, but no usable models were discovered. Configure a local or hosted provider inside OpenCode, or save a manual provider/model slug in Settings.",
  };
}

const runOpenCodeCommand = (
  args: ReadonlyArray<string>,
): Effect.Effect<
  CommandResult,
  Error | ServerSettingsError,
  ChildProcessSpawner.ChildProcessSpawner | ServerSettingsService
> =>
  Effect.gen(function* () {
    const settingsService = yield* ServerSettingsService;
    const openCodeSettings = yield* settingsService.getSettings.pipe(
      Effect.map((settings) => settings.providers.opencode),
    );
    const command = ChildProcess.make(openCodeSettings.binaryPath, [...args], {
      shell: process.platform === "win32",
    });
    return yield* spawnAndCollect(openCodeSettings.binaryPath, command);
  });

const probeOpenCodeProviders = (input:
  | {
      readonly mode: "managed";
      readonly binaryPath: string;
      readonly configPath?: string;
    }
  | {
      readonly mode: "remote";
      readonly baseUrl: string;
      readonly authToken?: string;
    }): Effect.Effect<OpenCodeProviderList, OpenCodeProviderProbeError> =>
  Effect.tryPromise({
    try: async () => {
      if (input.mode === "remote") {
        const response = await createScopedOpenCodeClient(
          input.baseUrl,
          undefined,
          input.authToken,
        ).provider.list();
        if (!response.data) {
          throw new Error("OpenCode provider discovery returned no data.");
        }
        return response.data as OpenCodeProviderList;
      }

      const server = await startManagedOpenCodeServer({
        binaryPath: input.binaryPath,
        ...(input.configPath ? { configPath: input.configPath } : {}),
        timeoutMs: 8_000,
      });
      try {
        const response = await server.client.provider.list();
        if (!response.data) {
          throw new Error("OpenCode provider discovery returned no data.");
        }
        return response.data as OpenCodeProviderList;
      } finally {
        server.close();
      }
    },
    catch: (cause) =>
      new OpenCodeProviderProbeError({
        detail: openCodeErrorMessage(cause),
        cause,
      }),
  });

export const checkOpenCodeProviderStatus = (): Effect.Effect<
  ServerProvider,
  ServerSettingsError,
  ChildProcessSpawner.ChildProcessSpawner | ServerSettingsService
> =>
  Effect.gen(function* () {
    const settingsService = yield* ServerSettingsService;
    const openCodeSettings = yield* settingsService.getSettings.pipe(
      Effect.map((settings) => settings.providers.opencode),
    );
    const checkedAt = new Date().toISOString();
    const configuredServer = parseOpenCodeServerUrl(openCodeSettings.serverUrl);

    if (!openCodeSettings.enabled) {
      const models = providerModelsFromSettings([], PROVIDER, openCodeSettings.customModels);
      return buildServerProvider({
        provider: PROVIDER,
        enabled: false,
        checkedAt,
        models,
        probe: {
          installed: false,
          version: null,
          status: "warning",
          auth: { status: "unknown" },
          message: "OpenCode is disabled in Cut2Kit settings.",
        },
      });
    }

    if (configuredServer && "error" in configuredServer) {
      return buildServerProvider({
        provider: PROVIDER,
        enabled: true,
        checkedAt,
        models: providerModelsFromSettings([], PROVIDER, openCodeSettings.customModels),
        probe: {
          installed: true,
          version: null,
          status: "error",
          auth: { status: "unknown" },
          message: configuredServer.error,
        },
      });
    }

    if (configuredServer && "baseUrl" in configuredServer) {
      const providerProbe = yield* probeOpenCodeProviders({
        mode: "remote",
        baseUrl: configuredServer.baseUrl,
        ...(trimToUndefined(openCodeSettings.authToken)
          ? { authToken: trimToUndefined(openCodeSettings.authToken)! }
          : {}),
      }).pipe(Effect.result);

      if (Result.isFailure(providerProbe)) {
        return buildServerProvider({
          provider: PROVIDER,
          enabled: true,
          checkedAt,
          models: providerModelsFromSettings([], PROVIDER, openCodeSettings.customModels),
          probe: {
            installed: true,
            version: null,
            status: "error",
            auth: { status: "unknown" },
            message: `Unable to reach OpenCode server at ${configuredServer.baseUrl}: ${openCodeErrorMessage(providerProbe.failure)}.`,
          },
        });
      }

      const connectedProviders = providerProbe.success.all
        .filter((provider) => providerProbe.success.connected.includes(provider.id))
        .map((provider) => ({ id: provider.id, name: provider.name }));
      const builtInModels = buildOpenCodeModels(providerProbe.success);
      const models = providerModelsFromSettings(
        builtInModels,
        PROVIDER,
        openCodeSettings.customModels,
      );
      const availability = summarizeOpenCodeAvailability({
        mode: "remote",
        baseUrl: configuredServer.baseUrl,
        connectedProviders,
        discoveredModelCount: builtInModels.length,
        customModelCount: models.filter((model) => model.isCustom).length,
      });

      return buildServerProvider({
        provider: PROVIDER,
        enabled: true,
        checkedAt,
        models,
        probe: {
          installed: true,
          version: null,
          status: availability.status,
          auth: availability.auth,
          message: availability.message,
        },
      });
    }

    if (!openCodeSettings.autoStartServer) {
      return buildServerProvider({
        provider: PROVIDER,
        enabled: true,
        checkedAt,
        models: providerModelsFromSettings([], PROVIDER, openCodeSettings.customModels),
        probe: {
          installed: true,
          version: null,
          status: "error",
          auth: { status: "unknown" },
          message:
            "Set an OpenCode server URL or enable automatic local OpenCode startup in Settings.",
        },
      });
    }

    const versionProbe = yield* runOpenCodeCommand(["--version"]).pipe(
      Effect.timeoutOption(DEFAULT_TIMEOUT_MS),
      Effect.result,
    );

    if (Result.isFailure(versionProbe)) {
      const error = versionProbe.failure;
      return buildServerProvider({
        provider: PROVIDER,
        enabled: true,
        checkedAt,
        models: providerModelsFromSettings([], PROVIDER, openCodeSettings.customModels),
        probe: {
          installed: !isCommandMissingCause(error),
          version: null,
          status: "error",
          auth: { status: "unknown" },
          message: isCommandMissingCause(error)
            ? "OpenCode CLI (`opencode`) is not installed or not on PATH."
            : `Failed to execute OpenCode CLI health check: ${openCodeErrorMessage(error)}.`,
        },
      });
    }

    if (Option.isNone(versionProbe.success)) {
      return buildServerProvider({
        provider: PROVIDER,
        enabled: true,
        checkedAt,
        models: providerModelsFromSettings([], PROVIDER, openCodeSettings.customModels),
        probe: {
          installed: true,
          version: null,
          status: "error",
          auth: { status: "unknown" },
          message: "OpenCode CLI is installed but failed to run. Timed out while running command.",
        },
      });
    }

    const version = versionProbe.success.value;
    const parsedVersion = parseGenericCliVersion(`${version.stdout}\n${version.stderr}`);
    if (version.code !== 0) {
      const detail = detailFromResult(version);
      return buildServerProvider({
        provider: PROVIDER,
        enabled: true,
        checkedAt,
        models: providerModelsFromSettings([], PROVIDER, openCodeSettings.customModels),
        probe: {
          installed: true,
          version: parsedVersion,
          status: "error",
          auth: { status: "unknown" },
          message: detail
            ? `OpenCode CLI is installed but failed to run. ${detail}`
            : "OpenCode CLI is installed but failed to run.",
        },
      });
    }

    const providerProbe = yield* probeOpenCodeProviders({
      mode: "managed",
      binaryPath: openCodeSettings.binaryPath,
      ...(trimToUndefined(openCodeSettings.configPath)
        ? { configPath: trimToUndefined(openCodeSettings.configPath)! }
        : {}),
    }).pipe(Effect.result);

    if (Result.isFailure(providerProbe)) {
      return buildServerProvider({
        provider: PROVIDER,
        enabled: true,
        checkedAt,
        models: providerModelsFromSettings([], PROVIDER, openCodeSettings.customModels),
        probe: {
          installed: true,
          version: parsedVersion,
          status: "warning",
          auth: { status: "unknown" },
          message: `OpenCode started, but provider discovery failed: ${openCodeErrorMessage(providerProbe.failure)}.`,
        },
      });
    }

    const connectedProviders = providerProbe.success.all
      .filter((provider) => providerProbe.success.connected.includes(provider.id))
      .map((provider) => ({ id: provider.id, name: provider.name }));
    const builtInModels = buildOpenCodeModels(providerProbe.success);
    const models = providerModelsFromSettings(builtInModels, PROVIDER, openCodeSettings.customModels);
    const availability = summarizeOpenCodeAvailability({
      mode: "managed",
      connectedProviders,
      discoveredModelCount: builtInModels.length,
      customModelCount: models.filter((model) => model.isCustom).length,
    });

    return buildServerProvider({
      provider: PROVIDER,
      enabled: true,
      checkedAt,
      models,
      probe: {
        installed: true,
        version: parsedVersion,
        status: availability.status,
        auth: availability.auth,
        message: availability.message,
      },
    });
  });

export const OpenCodeProviderLive = Layer.effect(
  OpenCodeProvider,
  Effect.gen(function* () {
    const serverSettings = yield* ServerSettingsService;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const checkProvider = checkOpenCodeProviderStatus().pipe(
      Effect.provideService(ServerSettingsService, serverSettings),
      Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
    );

    return yield* makeManagedServerProvider({
      getSettings: serverSettings.getSettings.pipe(
        Effect.map((settings) => settings.providers.opencode),
        Effect.orDie,
      ),
      streamSettings: serverSettings.streamChanges.pipe(
        Stream.map((settings) => settings.providers.opencode),
      ),
      haveSettingsChanged: (previous, next) => !Equal.equals(previous, next),
      checkProvider,
      refreshInterval: Duration.seconds(60),
    });
  }),
);
