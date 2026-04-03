import * as NodeServices from "@effect/platform-node/NodeServices";
import { it } from "@effect/vitest";
import { Effect, FileSystem, Layer, Path, Schema } from "effect";
import { expect } from "vitest";

import { ServerConfig } from "../../config.ts";
import { ServerSettingsService } from "../../serverSettings.ts";
import { runCut2KitCodexJson } from "./codexStructuredGeneration.ts";

const Cut2KitCodexGenerationTestLayer = Layer.empty.pipe(
  Layer.provideMerge(ServerSettingsService.layerTest()),
  Layer.provideMerge(
    ServerConfig.layerTest(process.cwd(), {
      prefix: "cut2kit-codex-structured-generation-test-",
    }),
  ),
  Layer.provideMerge(NodeServices.layer),
);

const TestOutputSchema = Schema.Struct({
  ok: Schema.Boolean,
});

const OptionalFieldSchema = Schema.Struct({
  requiredValue: Schema.Number,
  optionalValue: Schema.optional(Schema.Number),
});

function makeFakeCodexBinary(
  dir: string,
  input: {
    output: string;
    requireSkipGitRepoCheck?: boolean;
    requireReasoningEffort?: string;
    stdinMustContain?: string;
    schemaMustContain?: string;
  },
) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const binDir = path.join(dir, "bin");
    const codexPath = path.join(binDir, "codex");
    yield* fs.makeDirectory(binDir, { recursive: true });

    yield* fs.writeFileString(
      codexPath,
      [
        "#!/bin/sh",
        'output_path=""',
        'schema_path=""',
        'seen_skip_git_repo_check="0"',
        'seen_reasoning_effort=""',
        "while [ $# -gt 0 ]; do",
        '  if [ \"$1\" = \"--skip-git-repo-check\" ]; then',
        '    seen_skip_git_repo_check=\"1\"',
        "    shift",
        "    continue",
        "  fi",
        '  if [ \"$1\" = \"--config\" ]; then',
        "    shift",
        '    case \"$1\" in',
        "      model_reasoning_effort=*)",
        '        seen_reasoning_effort=\"$1\"',
        "        ;;",
        "    esac",
        "    shift",
        "    continue",
        "  fi",
        '  if [ \"$1\" = \"--output-last-message\" ]; then',
        "    shift",
        '    output_path=\"$1\"',
        "    shift",
        "    continue",
        "  fi",
        '  if [ \"$1\" = \"--output-schema\" ]; then',
        "    shift",
        '    schema_path=\"$1\"',
        "    shift",
        "    continue",
        "  fi",
        "  shift",
        "done",
        'stdin_content=\"$(cat)\"',
        ...(input.requireSkipGitRepoCheck
          ? [
              'if [ \"$seen_skip_git_repo_check\" != \"1\" ]; then',
              '  printf \"%s\\n\" \"missing --skip-git-repo-check\" >&2',
              "  exit 11",
              "fi",
            ]
          : []),
        ...(input.requireReasoningEffort !== undefined
          ? [
              `if [ \"$seen_reasoning_effort\" != \"model_reasoning_effort=\\\"${input.requireReasoningEffort}\\\"\" ]; then`,
              '  printf \"%s\\n\" \"unexpected reasoning effort config: $seen_reasoning_effort\" >&2',
              "  exit 12",
              "fi",
            ]
          : []),
        ...(input.stdinMustContain !== undefined
          ? [
              `if ! printf \"%s\" \"$stdin_content\" | grep -F -- ${JSON.stringify(input.stdinMustContain)} >/dev/null; then`,
              '  printf \"%s\\n\" \"stdin missing expected content\" >&2',
              "  exit 13",
              "fi",
            ]
          : []),
        ...(input.schemaMustContain !== undefined
          ? [
              `if ! grep -F -- ${JSON.stringify(input.schemaMustContain)} \"$schema_path\" >/dev/null; then`,
              '  printf "%s\\n" "schema missing expected content" >&2',
              "  exit 14",
              "fi",
            ]
          : []),
        'if [ -n \"$output_path\" ]; then',
        "  cat > \"$output_path\" <<'__CUT2KIT_FAKE_CODEX_OUTPUT__'",
        input.output,
        "__CUT2KIT_FAKE_CODEX_OUTPUT__",
        "fi",
        "exit 0",
        "",
      ].join("\n"),
    );
    yield* fs.chmod(codexPath, 0o755);
    return codexPath;
  });
}

function withFakeCodexEnv<A, E, R>(
  input: Parameters<typeof makeFakeCodexBinary>[1],
  effect: Effect.Effect<A, E, R>,
) {
  return Effect.acquireUseRelease(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const tempDir = yield* fs.makeTempDirectoryScoped({
        prefix: "cut2kit-codex-structured-generation-",
      });
      const codexPath = yield* makeFakeCodexBinary(tempDir, input);
      const serverSettings = yield* ServerSettingsService;
      const previousSettings = yield* serverSettings.getSettings;
      yield* serverSettings.updateSettings({
        providers: {
          codex: {
            binaryPath: codexPath,
          },
        },
      });
      return { previousBinaryPath: previousSettings.providers.codex.binaryPath, serverSettings };
    }),
    () => effect,
    ({ previousBinaryPath, serverSettings }) =>
      serverSettings
        .updateSettings({
          providers: {
            codex: {
              binaryPath: previousBinaryPath,
            },
          },
        })
        .pipe(Effect.asVoid),
  );
}

it.layer(Cut2KitCodexGenerationTestLayer)("runCut2KitCodexJson", (it) => {
  it.effect("passes --skip-git-repo-check so Cut2Kit wall runs can execute in non-repo project folders", () =>
    withFakeCodexEnv(
      {
        output: JSON.stringify({ ok: true }),
        requireSkipGitRepoCheck: true,
        requireReasoningEffort: "xhigh",
        stdinMustContain: "Return a JSON object with ok=true.",
      },
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const projectDir = yield* fs.makeTempDirectoryScoped({
          prefix: "cut2kit-non-repo-project-",
        });

        const result = yield* runCut2KitCodexJson({
          operation: "cut2kit.testStructuredGeneration",
          cwd: projectDir,
          prompt: "Return a JSON object with ok=true.",
          outputSchema: TestOutputSchema,
          modelSelection: {
            provider: "codex",
            model: "gpt-5.4",
            options: {
              reasoningEffort: "xhigh",
            },
          },
        });

        expect(result).toEqual({ ok: true });
      }),
    ),
  );

  it.effect("normalizes optional fields into an OpenAI-compatible required+nullable schema and strips nulls before decode", () =>
    withFakeCodexEnv(
      {
        output: JSON.stringify({
          requiredValue: 7,
          optionalValue: null,
        }),
        schemaMustContain: '"required":["requiredValue","optionalValue"]',
      },
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const projectDir = yield* fs.makeTempDirectoryScoped({
          prefix: "cut2kit-optional-schema-project-",
        });

        const result = yield* runCut2KitCodexJson({
          operation: "cut2kit.testOptionalSchema",
          cwd: projectDir,
          prompt: "Return requiredValue=7 and optionalValue=null.",
          outputSchema: OptionalFieldSchema,
          modelSelection: {
            provider: "codex",
            model: "gpt-5.4",
            options: {
              reasoningEffort: "xhigh",
            },
          },
        });

        expect(result).toEqual({ requiredValue: 7 });
      }),
    ),
  );
});
