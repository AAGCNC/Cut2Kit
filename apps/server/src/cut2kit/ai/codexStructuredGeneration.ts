import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

import { Effect, FileSystem, Option, Path, Schema, Scope, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import type { ModelSelection, OpenCodeModelSelection } from "@t3tools/contracts";
import { normalizeCodexModelOptionsWithCapabilities } from "@t3tools/shared/model";

import { extractStructuredJsonText, toJsonSchemaObject } from "../../git/Utils.ts";
import { getCodexModelCapabilities } from "../../provider/Layers/CodexProvider.ts";
import {
  createScopedOpenCodeClient,
  openCodeErrorMessage,
  parseOpenCodeModelRef,
  parseOpenCodeServerUrl,
  startManagedOpenCodeServer,
  trimToUndefined,
} from "../../provider/opencodeServer.ts";
import { ServerSettingsService } from "../../serverSettings.ts";

const CODEX_TIMEOUT_MS = 240_000;
const OPENCODE_START_TIMEOUT_MS = 8_000;
const DEFAULT_REASONING_EFFORT = "high";

export class Cut2KitCodexGenerationError extends Schema.TaggedErrorClass<Cut2KitCodexGenerationError>()(
  "Cut2KitCodexGenerationError",
  {
    operation: Schema.String,
    detail: Schema.String,
    cause: Schema.optional(Schema.Defect),
  },
) {}

const readStreamAsString = <E>(
  operation: string,
  stream: Stream.Stream<Uint8Array, E>,
): Effect.Effect<string, Cut2KitCodexGenerationError> =>
  stream.pipe(
    Stream.decodeText(),
    Stream.runFold(
      () => "",
      (acc, chunk) => acc + chunk,
    ),
    Effect.mapError(
      (cause) =>
        new Cut2KitCodexGenerationError({
          operation,
          detail: "Failed to collect Codex process output.",
          cause,
        }),
    ),
  );

const writeTempFile = (
  operation: string,
  prefix: string,
  content: string,
): Effect.Effect<string, Cut2KitCodexGenerationError, Scope.Scope | FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    return yield* fileSystem
      .makeTempFileScoped({
        prefix: `cut2kit-${prefix}-${process.pid}-${randomUUID()}.tmp`,
      })
      .pipe(
        Effect.tap((filePath) => fileSystem.writeFileString(filePath, content)),
        Effect.mapError(
          (cause) =>
            new Cut2KitCodexGenerationError({
              operation,
              detail: "Failed to write temporary Codex input file.",
              cause,
            }),
        ),
      );
  });

const safeUnlink = (filePath: string): Effect.Effect<void, never, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    yield* fileSystem.remove(filePath).pipe(Effect.catch(() => Effect.void));
  });

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function schemaAlreadyAllowsNull(schema: unknown): boolean {
  if (!isRecord(schema)) {
    return false;
  }
  const type = schema.type;
  if (type === "null") {
    return true;
  }
  if (Array.isArray(type) && type.includes("null")) {
    return true;
  }
  return ["anyOf", "oneOf"].some(
    (key) =>
      Array.isArray(schema[key]) &&
      schema[key].some(
        (entry) =>
          isRecord(entry) &&
          (entry.type === "null" || (Array.isArray(entry.type) && entry.type.includes("null"))),
      ),
  );
}

function makeSchemaNullable(schema: unknown): unknown {
  if (!isRecord(schema) || schemaAlreadyAllowsNull(schema)) {
    return schema;
  }
  return {
    anyOf: [schema, { type: "null" }],
  };
}

function toOpenAiStructuredOutputSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) {
    return schema.map((entry) => toOpenAiStructuredOutputSchema(entry));
  }
  if (!isRecord(schema)) {
    return schema;
  }

  const transformedEntries = Object.fromEntries(
    Object.entries(schema).map(([key, value]) => [key, toOpenAiStructuredOutputSchema(value)]),
  );

  if (!isRecord(transformedEntries.properties)) {
    return transformedEntries;
  }

  const propertyEntries = Object.entries(transformedEntries.properties);
  const originalRequired = new Set(
    Array.isArray(transformedEntries.required)
      ? transformedEntries.required.filter((entry): entry is string => typeof entry === "string")
      : [],
  );

  transformedEntries.properties = Object.fromEntries(
    propertyEntries.map(([key, value]) => [
      key,
      originalRequired.has(key) ? value : makeSchemaNullable(value),
    ]),
  );
  transformedEntries.required = propertyEntries.map(([key]) => key);
  return transformedEntries;
}

function stripNullValues(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => stripNullValues(entry));
  }
  if (!isRecord(value)) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== null)
      .map(([key, entry]) => [key, stripNullValues(entry)]),
  );
}

function inferMimeTypeFromPath(filePath: string): string {
  const normalized = filePath.trim().toLowerCase();
  if (normalized.endsWith(".png")) {
    return "image/png";
  }
  if (normalized.endsWith(".jpg") || normalized.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (normalized.endsWith(".webp")) {
    return "image/webp";
  }
  if (normalized.endsWith(".gif")) {
    return "image/gif";
  }
  return "application/octet-stream";
}

function fileNameFromPath(filePath: string): string {
  return filePath.split(/[\\/]/u).at(-1) ?? "attachment";
}

function buildOpenCodeStructuredPrompt(prompt: string, outputSchema: Schema.Top): string {
  return [
    prompt.trim(),
    "",
    "Return only a JSON object that matches this schema.",
    "Do not include Markdown fences or explanatory text.",
    JSON.stringify(toJsonSchemaObject(outputSchema), null, 2),
  ].join("\n");
}

const runCut2KitOpenCodeJson = Effect.fn("runCut2KitOpenCodeJson")(function* <
  S extends Schema.Top,
>(input: {
  operation: string;
  cwd: string;
  prompt: string;
  outputSchema: S;
  modelSelection: OpenCodeModelSelection;
  imagePaths?: ReadonlyArray<string>;
}): Effect.fn.Return<S["Type"], Cut2KitCodexGenerationError, S["DecodingServices"]> {
  const serverSettingsService = yield* Effect.service(ServerSettingsService);

  const openCodeSettings = yield* Effect.map(
    serverSettingsService.getSettings,
    (settings) => settings.providers.opencode,
  ).pipe(Effect.catch(() => Effect.undefined));
  const configuredServer = parseOpenCodeServerUrl(openCodeSettings?.serverUrl);
  if (configuredServer && "error" in configuredServer) {
    return yield* new Cut2KitCodexGenerationError({
      operation: input.operation,
      detail: configuredServer.error,
    });
  }

  const modelRef = parseOpenCodeModelRef(input.modelSelection.model);
  if (!modelRef) {
    return yield* new Cut2KitCodexGenerationError({
      operation: input.operation,
      detail: `Invalid OpenCode model '${input.modelSelection.model}'. Expected provider/model format.`,
    });
  }

  let closeManagedServer: (() => void) | undefined;
  const cleanupManagedServer = Effect.sync(() => {
    closeManagedServer?.();
  });

  return yield* Effect.gen(function* () {
    let baseUrl: string;
    const authToken = trimToUndefined(openCodeSettings?.authToken);

    if (configuredServer && "baseUrl" in configuredServer) {
      baseUrl = configuredServer.baseUrl;
    } else {
      if (openCodeSettings?.autoStartServer === false) {
        return yield* new Cut2KitCodexGenerationError({
          operation: input.operation,
          detail:
            "Set an OpenCode server URL or enable automatic local OpenCode startup in Settings.",
        });
      }

      const managedServer = yield* Effect.tryPromise({
        try: async () =>
          startManagedOpenCodeServer({
            binaryPath: openCodeSettings?.binaryPath || "opencode",
            ...(trimToUndefined(openCodeSettings?.configPath)
              ? { configPath: trimToUndefined(openCodeSettings?.configPath)! }
              : {}),
            cwd: input.cwd,
            timeoutMs: OPENCODE_START_TIMEOUT_MS,
          }),
        catch: (cause) =>
          new Cut2KitCodexGenerationError({
            operation: input.operation,
            detail: `Failed to start OpenCode server: ${openCodeErrorMessage(cause)}`,
            cause,
          }),
      });
      baseUrl = managedServer.baseUrl;
      closeManagedServer = managedServer.close;
    }

    const client = createScopedOpenCodeClient(baseUrl, input.cwd, authToken);
    const created = yield* Effect.tryPromise({
      try: async () =>
        client.session.create({
          body: {
            title: `Cut2Kit ${input.operation}`,
          },
        }),
      catch: (cause) =>
        new Cut2KitCodexGenerationError({
          operation: input.operation,
          detail: "Failed to create OpenCode session.",
          cause,
        }),
    });
    const sessionId = created.data?.id;
    if (!sessionId) {
      return yield* new Cut2KitCodexGenerationError({
        operation: input.operation,
        detail: "OpenCode did not return a session id.",
      });
    }

    const parts: Array<
      | { type: "text"; text: string }
      | { type: "file"; mime: string; filename?: string; url: string }
    > = [
      {
        type: "text",
        text: buildOpenCodeStructuredPrompt(input.prompt, input.outputSchema),
      },
    ];

    for (const imagePath of input.imagePaths ?? []) {
      parts.push({
        type: "file",
        mime: inferMimeTypeFromPath(imagePath),
        filename: fileNameFromPath(imagePath),
        url: pathToFileURL(imagePath).toString(),
      });
    }

    const cleanupSession = Effect.tryPromise({
      try: async () =>
        client.session.delete({
          path: { id: sessionId },
        }),
      catch: () =>
        new Cut2KitCodexGenerationError({
          operation: input.operation,
          detail: "Failed to clean up OpenCode session.",
        }),
    }).pipe(Effect.catch(() => Effect.void));

    const response = yield* Effect.tryPromise({
      try: async () =>
        client.session.prompt({
          path: { id: sessionId },
          body: {
            model: modelRef,
            ...(trimToUndefined(openCodeSettings?.defaultAgent)
              ? { agent: trimToUndefined(openCodeSettings?.defaultAgent)! }
              : {}),
            parts,
          },
        }),
      catch: (cause) =>
        new Cut2KitCodexGenerationError({
          operation: input.operation,
          detail: "OpenCode request failed.",
          cause,
        }),
    }).pipe(
      Effect.timeoutOption(CODEX_TIMEOUT_MS),
      Effect.flatMap(
        Option.match({
          onNone: () =>
            Effect.fail(
              new Cut2KitCodexGenerationError({
                operation: input.operation,
                detail: "OpenCode request timed out.",
              }),
            ),
          onSome: (value) => Effect.succeed(value),
        }),
      ),
      Effect.ensuring(cleanupSession),
    );

    const data = response.data;
    if (!data) {
      return yield* new Cut2KitCodexGenerationError({
        operation: input.operation,
        detail: "OpenCode returned no response payload.",
      });
    }
    if (data.info.error) {
      const detail =
        "data" in data.info.error &&
        data.info.error.data &&
        typeof data.info.error.data.message === "string"
          ? data.info.error.data.message
          : "OpenCode returned an assistant error.";
      return yield* new Cut2KitCodexGenerationError({
        operation: input.operation,
        detail,
      });
    }

    const rawText = data.parts
      .filter(
        (part): part is Extract<(typeof data.parts)[number], { type: "text" }> =>
          part.type === "text",
      )
      .map((part) => part.text)
      .join("\n")
      .trim();
    if (!rawText) {
      return yield* new Cut2KitCodexGenerationError({
        operation: input.operation,
        detail: "OpenCode did not return any text output.",
      });
    }

    return yield* Effect.try({
      try: () => JSON.stringify(stripNullValues(JSON.parse(extractStructuredJsonText(rawText)))),
      catch: (cause) =>
        new Cut2KitCodexGenerationError({
          operation: input.operation,
          detail: "OpenCode returned invalid JSON.",
          cause,
        }),
    }).pipe(
      Effect.flatMap(Schema.decodeEffect(Schema.fromJsonString(input.outputSchema))),
      Effect.catchTag("SchemaError", (cause) =>
        Effect.fail(
          new Cut2KitCodexGenerationError({
            operation: input.operation,
            detail: "OpenCode returned invalid structured output.",
            cause,
          }),
        ),
      ),
    );
  }).pipe(Effect.ensuring(cleanupManagedServer));
});

export const runCut2KitCodexJson = Effect.fn("runCut2KitCodexJson")(function* <
  S extends Schema.Top,
>(input: {
  operation: string;
  cwd: string;
  prompt: string;
  outputSchema: S;
  modelSelection: ModelSelection;
  imagePaths?: ReadonlyArray<string>;
  cleanupPaths?: ReadonlyArray<string>;
}): Effect.fn.Return<S["Type"], Cut2KitCodexGenerationError, S["DecodingServices"]> {
  if (input.modelSelection.provider !== "codex" && input.modelSelection.provider !== "opencode") {
    return yield* new Cut2KitCodexGenerationError({
      operation: input.operation,
      detail: "Cut2Kit wall generation currently supports only Codex or OpenCode runtimes.",
    });
  }

  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const commandSpawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const serverSettingsService = yield* Effect.service(ServerSettingsService);

  for (const imagePath of input.imagePaths ?? []) {
    if (!path.isAbsolute(imagePath)) {
      return yield* new Cut2KitCodexGenerationError({
        operation: input.operation,
        detail: `Image path must be absolute: ${imagePath}`,
      });
    }
    const stat = yield* fileSystem.stat(imagePath).pipe(Effect.catch(() => Effect.succeed(null)));
    if (!stat || stat.type !== "File") {
      return yield* new Cut2KitCodexGenerationError({
        operation: input.operation,
        detail: `Image path does not exist: ${imagePath}`,
      });
    }
  }

  if (input.modelSelection.provider === "opencode") {
    const cleanup = Effect.all(
      (input.cleanupPaths ?? []).map((filePath) => safeUnlink(filePath)),
      {
        concurrency: "unbounded",
      },
    ).pipe(Effect.asVoid);
    return yield* runCut2KitOpenCodeJson({
      operation: input.operation,
      cwd: input.cwd,
      prompt: input.prompt,
      outputSchema: input.outputSchema,
      modelSelection: input.modelSelection,
      ...(input.imagePaths ? { imagePaths: input.imagePaths } : {}),
    }).pipe(Effect.ensuring(cleanup));
  }

  const schemaPath = yield* writeTempFile(
    input.operation,
    "codex-schema",
    JSON.stringify(toOpenAiStructuredOutputSchema(toJsonSchemaObject(input.outputSchema))),
  );
  const outputPath = yield* writeTempFile(input.operation, "codex-output", "");

  const codexSettings = yield* Effect.map(
    serverSettingsService.getSettings,
    (settings) => settings.providers.codex,
  ).pipe(Effect.catch(() => Effect.undefined));

  const normalizedOptions = normalizeCodexModelOptionsWithCapabilities(
    getCodexModelCapabilities(input.modelSelection.model),
    input.modelSelection.options,
  );
  const reasoningEffort = input.modelSelection.options?.reasoningEffort ?? DEFAULT_REASONING_EFFORT;

  const runCodexCommand = Effect.fn("runCut2KitCodexJson.runCodexCommand")(function* () {
    const command = ChildProcess.make(
      codexSettings?.binaryPath || "codex",
      [
        "exec",
        "--ephemeral",
        "--skip-git-repo-check",
        "-s",
        "read-only",
        "--model",
        input.modelSelection.model,
        "--config",
        `model_reasoning_effort="${reasoningEffort}"`,
        ...(normalizedOptions?.fastMode ? ["--config", `service_tier="fast"`] : []),
        "--output-schema",
        schemaPath,
        "--output-last-message",
        outputPath,
        ...(input.imagePaths ?? []).flatMap((imagePath) => ["--image", imagePath]),
        "-",
      ],
      {
        env: {
          ...process.env,
          ...(codexSettings?.homePath ? { CODEX_HOME: codexSettings.homePath } : {}),
        },
        cwd: input.cwd,
        shell: process.platform === "win32",
        stdin: {
          stream: Stream.encodeText(Stream.make(input.prompt)),
        },
      },
    );

    const child = yield* commandSpawner.spawn(command).pipe(
      Effect.mapError(
        (cause) =>
          new Cut2KitCodexGenerationError({
            operation: input.operation,
            detail: "Failed to spawn Codex CLI process.",
            cause,
          }),
      ),
    );

    const [stdout, stderr, exitCode] = yield* Effect.all(
      [
        readStreamAsString(input.operation, child.stdout),
        readStreamAsString(input.operation, child.stderr),
        child.exitCode.pipe(
          Effect.mapError(
            (cause) =>
              new Cut2KitCodexGenerationError({
                operation: input.operation,
                detail: "Failed to read Codex CLI exit code.",
                cause,
              }),
          ),
        ),
      ],
      { concurrency: "unbounded" },
    );

    if (exitCode !== 0) {
      const stderrDetail = stderr.trim();
      const stdoutDetail = stdout.trim();
      const detail = stderrDetail.length > 0 ? stderrDetail : stdoutDetail;
      return yield* new Cut2KitCodexGenerationError({
        operation: input.operation,
        detail:
          detail.length > 0
            ? `Codex CLI command failed: ${detail}`
            : `Codex CLI command failed with code ${exitCode}.`,
      });
    }
  });

  const cleanup = Effect.all(
    [schemaPath, outputPath, ...(input.cleanupPaths ?? [])].map((filePath) => safeUnlink(filePath)),
    { concurrency: "unbounded" },
  ).pipe(Effect.asVoid);

  return yield* Effect.gen(function* () {
    yield* runCodexCommand().pipe(
      Effect.scoped,
      Effect.timeoutOption(CODEX_TIMEOUT_MS),
      Effect.flatMap(
        Option.match({
          onNone: () =>
            Effect.fail(
              new Cut2KitCodexGenerationError({
                operation: input.operation,
                detail: "Codex CLI request timed out.",
              }),
            ),
          onSome: () => Effect.void,
        }),
      ),
    );

    return yield* fileSystem.readFileString(outputPath).pipe(
      Effect.mapError(
        (cause) =>
          new Cut2KitCodexGenerationError({
            operation: input.operation,
            detail: "Failed to read Codex output file.",
            cause,
          }),
      ),
      Effect.flatMap((rawJson) =>
        Effect.try({
          try: () => JSON.stringify(stripNullValues(JSON.parse(rawJson) as unknown)),
          catch: (cause) =>
            new Cut2KitCodexGenerationError({
              operation: input.operation,
              detail: "Codex returned invalid JSON.",
              cause,
            }),
        }),
      ),
      Effect.flatMap(Schema.decodeEffect(Schema.fromJsonString(input.outputSchema))),
      Effect.catchTag("SchemaError", (cause) =>
        Effect.fail(
          new Cut2KitCodexGenerationError({
            operation: input.operation,
            detail: "Codex returned invalid structured output.",
            cause,
          }),
        ),
      ),
    );
  }).pipe(Effect.ensuring(cleanup));
});
