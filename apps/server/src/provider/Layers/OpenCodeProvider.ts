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

type OpenCodeProviderList = {
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

function buildOpenCodeModels(providerList: OpenCodeProviderList): ReadonlyArray<ServerProviderModel> {
  const defaults = new Set(
    Object.entries(providerList.default).map(([providerID, modelID]) =>
      buildOpenCodeModelSlug(providerID, modelID),
    ),
  );

  return providerList.all
    .filter((provider) => providerList.connected.includes(provider.id))
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

      if (connectedProviders.length === 0) {
        return buildServerProvider({
          provider: PROVIDER,
          enabled: true,
          checkedAt,
          models,
          probe: {
            installed: true,
            version: null,
            status: "error",
            auth: { status: "unauthenticated" },
            message: `Connected to OpenCode at ${configuredServer.baseUrl}, but no model providers are authenticated there.`,
          },
        });
      }

      return buildServerProvider({
        provider: PROVIDER,
        enabled: true,
        checkedAt,
        models,
        probe: {
          installed: true,
          version: null,
          status: "ready",
          auth: buildOpenCodeAuth({ connectedProviders }),
          message:
            connectedProviders.length === 1
              ? `Connected to ${connectedProviders[0]!.name} through OpenCode at ${configuredServer.baseUrl}.`
              : `Connected to ${connectedProviders.length} authenticated providers through OpenCode at ${configuredServer.baseUrl}.`,
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

    if (connectedProviders.length === 0) {
      return buildServerProvider({
        provider: PROVIDER,
        enabled: true,
        checkedAt,
        models,
        probe: {
          installed: true,
          version: parsedVersion,
          status: "error",
          auth: { status: "unauthenticated" },
          message:
            "OpenCode is installed, but no model providers are authenticated. Run `opencode auth login` and refresh.",
        },
      });
    }

    return buildServerProvider({
      provider: PROVIDER,
      enabled: true,
      checkedAt,
      models,
      probe: {
        installed: true,
        version: parsedVersion,
        status: "ready",
        auth: buildOpenCodeAuth({ connectedProviders }),
        message:
          connectedProviders.length === 1
            ? `Using ${connectedProviders[0]!.name} through OpenCode.`
            : `Using ${connectedProviders.length} authenticated providers through OpenCode.`,
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
