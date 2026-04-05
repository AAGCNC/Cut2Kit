import { pathToFileURL } from "node:url";
import { Effect, Layer, Option, Schema } from "effect";

import { OpenCodeModelSelection, TextGenerationError } from "@t3tools/contracts";
import { sanitizeBranchFragment, sanitizeFeatureBranchName } from "@t3tools/shared/git";

import { resolveAttachmentPath } from "../../attachmentStore.ts";
import { ServerConfig } from "../../config.ts";
import { ServerSettingsService } from "../../serverSettings.ts";
import {
  buildBranchNamePrompt,
  buildCommitMessagePrompt,
  buildPrContentPrompt,
  buildThreadTitlePrompt,
} from "../Prompts.ts";
import { type TextGenerationShape, TextGeneration } from "../Services/TextGeneration.ts";
import {
  extractStructuredJsonText,
  normalizeCliError,
  sanitizeCommitSubject,
  sanitizePrTitle,
  sanitizeThreadTitle,
  toJsonSchemaObject,
} from "../Utils.ts";
import {
  createScopedOpenCodeClient,
  openCodeErrorMessage,
  parseOpenCodeModelRef,
  parseOpenCodeServerUrl,
  startManagedOpenCodeServer,
  trimToUndefined,
} from "../../provider/opencodeServer.ts";

interface RunningOpenCodeServer {
  readonly signature: string;
  readonly baseUrl: string;
  readonly authToken: string | undefined;
  readonly close: () => void;
}

const OPENCODE_TIMEOUT_MS = 180_000;

function buildStructuredPrompt(prompt: string, outputSchema: Schema.Top): string {
  return [
    prompt.trim(),
    "",
    "Return only a JSON object that matches this schema.",
    "Do not include Markdown fences or explanatory text.",
    JSON.stringify(toJsonSchemaObject(outputSchema), null, 2),
  ].join("\n");
}

const makeOpenCodeTextGeneration = Effect.gen(function* () {
  const serverConfig = yield* ServerConfig;
  const settingsService = yield* ServerSettingsService;
  let runningServer: RunningOpenCodeServer | null = null;

  const getOpenCodeSettings = (operation: string) =>
    settingsService.getSettings.pipe(
      Effect.map((settings) => settings.providers.opencode),
      Effect.mapError(
        (cause) =>
          new TextGenerationError({
            operation,
            detail: `Failed to load OpenCode settings: ${cause.message}`,
            cause,
          }),
      ),
    );

  const stopRunningServer = (): void => {
    if (!runningServer) {
      return;
    }
    runningServer.close();
    runningServer = null;
  };

  const ensureServer = (operation: string) =>
    Effect.gen(function* () {
      const settings = yield* getOpenCodeSettings(operation);
      const configuredServer = parseOpenCodeServerUrl(settings.serverUrl);
      if (configuredServer && "error" in configuredServer) {
        return yield* new TextGenerationError({
          operation,
          detail: configuredServer.error,
        });
      }

      const signature = [
        configuredServer && "baseUrl" in configuredServer ? configuredServer.baseUrl : "",
        trimToUndefined(settings.authToken) ?? "",
        settings.autoStartServer ? "autostart" : "manual",
        settings.binaryPath,
        settings.configPath,
      ].join("\u0000");
      if (runningServer?.signature === signature) {
        return { server: runningServer, settings };
      }

      stopRunningServer();

      if (configuredServer && "baseUrl" in configuredServer) {
        runningServer = {
          signature,
          baseUrl: configuredServer.baseUrl,
          authToken: trimToUndefined(settings.authToken),
          close: () => {},
        };
        return { server: runningServer, settings };
      }

      if (!settings.autoStartServer) {
        return yield* new TextGenerationError({
          operation,
          detail:
            "Set an OpenCode server URL or enable automatic local OpenCode startup in Settings.",
        });
      }

      const managed = yield* Effect.tryPromise({
        try: async () =>
          startManagedOpenCodeServer({
            binaryPath: settings.binaryPath,
            ...(trimToUndefined(settings.configPath)
              ? { configPath: trimToUndefined(settings.configPath)! }
              : {}),
            cwd: serverConfig.cwd,
            timeoutMs: 8_000,
          }),
        catch: (cause) =>
          normalizeCliError(
            "opencode",
            operation,
            cause,
            `Failed to start OpenCode server: ${openCodeErrorMessage(cause)}`,
          ),
      });

      runningServer = {
        signature,
        baseUrl: managed.baseUrl,
        authToken: trimToUndefined(settings.authToken),
        close: () => managed.close(),
      };
      return { server: runningServer, settings };
    });

  const promptOpenCode = <S extends Schema.Top>(input: {
    readonly operation:
      | "generateCommitMessage"
      | "generatePrContent"
      | "generateBranchName"
      | "generateThreadTitle";
    readonly cwd: string;
    readonly prompt: string;
    readonly outputSchema: S;
    readonly modelSelection: OpenCodeModelSelection;
    readonly attachments?: ReadonlyArray<{
      readonly type: "image";
      readonly id: string;
      readonly name: string;
      readonly mimeType: string;
      readonly sizeBytes: number;
    }>;
  }): Effect.Effect<S["Type"], TextGenerationError, S["DecodingServices"]> =>
    Effect.gen(function* () {
      const { server, settings } = yield* ensureServer(input.operation);
      const modelRef = parseOpenCodeModelRef(input.modelSelection.model);
      if (!modelRef) {
        return yield* new TextGenerationError({
          operation: input.operation,
          detail: `Invalid OpenCode model '${input.modelSelection.model}'. Expected provider/model format.`,
        });
      }

      const client = createScopedOpenCodeClient(server.baseUrl, input.cwd, server.authToken);
      const created = yield* Effect.tryPromise({
        try: async () =>
          client.session.create({
            body: {
              title: `Cut2Kit ${input.operation}`,
            },
          }),
        catch: (cause) =>
          normalizeCliError(
            "opencode",
            input.operation,
            cause,
            "Failed to create OpenCode session",
          ),
      });
      const sessionId = created.data?.id;
      if (!sessionId) {
        return yield* new TextGenerationError({
          operation: input.operation,
          detail: "OpenCode did not return a session id.",
        });
      }

      const parts: Array<
        | { type: "text"; text: string }
        | { type: "file"; mime: string; filename?: string; url: string }
      > = [{ type: "text", text: buildStructuredPrompt(input.prompt, input.outputSchema) }];

      for (const attachment of input.attachments ?? []) {
        const attachmentPath = resolveAttachmentPath({
          attachmentsDir: serverConfig.attachmentsDir,
          attachment,
        });
        if (!attachmentPath) {
          continue;
        }
        parts.push({
          type: "file",
          mime: attachment.mimeType,
          filename: attachment.name,
          url: pathToFileURL(attachmentPath).toString(),
        });
      }

      const cleanup = Effect.tryPromise({
        try: async () =>
          client.session.delete({
            path: { id: sessionId },
          }),
        catch: () =>
          new TextGenerationError({
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
              ...(trimToUndefined(settings.defaultAgent)
                ? { agent: trimToUndefined(settings.defaultAgent)! }
                : {}),
              parts,
            },
          }),
        catch: (cause) =>
          normalizeCliError("opencode", input.operation, cause, "OpenCode request failed"),
      }).pipe(
        Effect.timeoutOption(OPENCODE_TIMEOUT_MS),
        Effect.flatMap(
          Option.match({
            onNone: () =>
              Effect.fail(
                new TextGenerationError({
                  operation: input.operation,
                  detail: "OpenCode request timed out.",
                }),
              ),
            onSome: (value) => Effect.succeed(value),
          }),
        ),
        Effect.ensuring(cleanup),
      );

      const data = response.data;
      if (!data) {
        return yield* new TextGenerationError({
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
        return yield* new TextGenerationError({
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
        return yield* new TextGenerationError({
          operation: input.operation,
          detail: "OpenCode did not return any text output.",
        });
      }

      return yield* Schema.decodeEffect(Schema.fromJsonString(input.outputSchema))(
        extractStructuredJsonText(rawText),
      ).pipe(
        Effect.catchTag("SchemaError", (cause) =>
          Effect.fail(
            new TextGenerationError({
              operation: input.operation,
              detail: "OpenCode returned invalid structured output.",
              cause,
            }),
          ),
        ),
      );
    });

  const generateCommitMessage: TextGenerationShape["generateCommitMessage"] = Effect.fn(
    "OpenCodeTextGeneration.generateCommitMessage",
  )(function* (input) {
    const { prompt, outputSchema } = buildCommitMessagePrompt({
      branch: input.branch,
      stagedSummary: input.stagedSummary,
      stagedPatch: input.stagedPatch,
      includeBranch: input.includeBranch === true,
    });
    if (input.modelSelection.provider !== "opencode") {
      return yield* new TextGenerationError({
        operation: "generateCommitMessage",
        detail: "Invalid model selection.",
      });
    }

    const generated = yield* promptOpenCode({
      operation: "generateCommitMessage",
      cwd: input.cwd,
      prompt,
      outputSchema,
      modelSelection: input.modelSelection,
    });

    return {
      subject: sanitizeCommitSubject(generated.subject),
      body: generated.body.trim(),
      ...("branch" in generated && typeof generated.branch === "string"
        ? { branch: sanitizeFeatureBranchName(generated.branch) }
        : {}),
    };
  });

  const generatePrContent: TextGenerationShape["generatePrContent"] = Effect.fn(
    "OpenCodeTextGeneration.generatePrContent",
  )(function* (input) {
    const { prompt, outputSchema } = buildPrContentPrompt({
      baseBranch: input.baseBranch,
      headBranch: input.headBranch,
      commitSummary: input.commitSummary,
      diffSummary: input.diffSummary,
      diffPatch: input.diffPatch,
    });
    if (input.modelSelection.provider !== "opencode") {
      return yield* new TextGenerationError({
        operation: "generatePrContent",
        detail: "Invalid model selection.",
      });
    }

    const generated = yield* promptOpenCode({
      operation: "generatePrContent",
      cwd: input.cwd,
      prompt,
      outputSchema,
      modelSelection: input.modelSelection,
    });

    return {
      title: sanitizePrTitle(generated.title),
      body: generated.body.trim(),
    };
  });

  const generateBranchName: TextGenerationShape["generateBranchName"] = Effect.fn(
    "OpenCodeTextGeneration.generateBranchName",
  )(function* (input) {
    const { prompt, outputSchema } = buildBranchNamePrompt({
      message: input.message,
      attachments: input.attachments,
    });
    if (input.modelSelection.provider !== "opencode") {
      return yield* new TextGenerationError({
        operation: "generateBranchName",
        detail: "Invalid model selection.",
      });
    }

    const generated = yield* promptOpenCode({
      operation: "generateBranchName",
      cwd: input.cwd,
      prompt,
      outputSchema,
      modelSelection: input.modelSelection,
      ...(input.attachments ? { attachments: input.attachments } : {}),
    });

    return {
      branch: sanitizeBranchFragment(generated.branch),
    };
  });

  const generateThreadTitle: TextGenerationShape["generateThreadTitle"] = Effect.fn(
    "OpenCodeTextGeneration.generateThreadTitle",
  )(function* (input) {
    const { prompt, outputSchema } = buildThreadTitlePrompt({
      message: input.message,
      attachments: input.attachments,
    });
    if (input.modelSelection.provider !== "opencode") {
      return yield* new TextGenerationError({
        operation: "generateThreadTitle",
        detail: "Invalid model selection.",
      });
    }

    const generated = yield* promptOpenCode({
      operation: "generateThreadTitle",
      cwd: input.cwd,
      prompt,
      outputSchema,
      modelSelection: input.modelSelection,
      ...(input.attachments ? { attachments: input.attachments } : {}),
    });

    return {
      title: sanitizeThreadTitle(generated.title),
    };
  });

  yield* Effect.addFinalizer(() =>
    Effect.sync(() => {
      stopRunningServer();
    }),
  );

  return {
    generateCommitMessage,
    generatePrContent,
    generateBranchName,
    generateThreadTitle,
  } satisfies TextGenerationShape;
});

export const OpenCodeTextGenerationLive = Layer.effect(TextGeneration, makeOpenCodeTextGeneration);
