import { randomUUID } from "node:crypto";

import { Effect, FileSystem, Option, Path, Schema, Scope, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import type { CodexModelSelection } from "@t3tools/contracts";
import { normalizeCodexModelOptionsWithCapabilities } from "@t3tools/shared/model";

import { toJsonSchemaObject } from "../../git/Utils.ts";
import { getCodexModelCapabilities } from "../../provider/Layers/CodexProvider.ts";
import { ServerSettingsService } from "../../serverSettings.ts";

const CODEX_TIMEOUT_MS = 240_000;
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
  return ["anyOf", "oneOf"].some((key) =>
    Array.isArray(schema[key]) &&
    schema[key].some(
      (entry) => isRecord(entry) && (entry.type === "null" || (Array.isArray(entry.type) && entry.type.includes("null"))),
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

export const runCut2KitCodexJson = Effect.fn("runCut2KitCodexJson")(function* <S extends Schema.Top>(input: {
  operation: string;
  cwd: string;
  prompt: string;
  outputSchema: S;
  modelSelection: CodexModelSelection;
  imagePaths?: ReadonlyArray<string>;
  cleanupPaths?: ReadonlyArray<string>;
}): Effect.fn.Return<S["Type"], Cut2KitCodexGenerationError, S["DecodingServices"]> {
  if (input.modelSelection.provider !== "codex") {
    return yield* new Cut2KitCodexGenerationError({
      operation: input.operation,
      detail: "Cut2Kit wall generation currently requires the Codex/OpenAI runtime.",
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
  const reasoningEffort =
    input.modelSelection.options?.reasoningEffort ?? DEFAULT_REASONING_EFFORT;

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
