import fsPromises from "node:fs/promises";
import nodePath from "node:path";
import { fileURLToPath } from "node:url";

import { Effect, Schema } from "effect";

import type { Cut2KitPromptTemplatePaths } from "@t3tools/contracts";

const repoRootPath = fileURLToPath(new URL("../../../../../", import.meta.url));

export class Cut2KitPromptTemplateError extends Schema.TaggedErrorClass<Cut2KitPromptTemplateError>()(
  "Cut2KitPromptTemplateError",
  {
    operation: Schema.String,
    detail: Schema.String,
    cause: Schema.optional(Schema.Defect),
  },
) {}

async function pathExists(absolutePath: string): Promise<boolean> {
  try {
    await fsPromises.access(absolutePath);
    return true;
  } catch {
    return false;
  }
}

async function resolvePromptTemplatePath(cwd: string, configuredPath: string): Promise<string> {
  if (nodePath.isAbsolute(configuredPath)) {
    return configuredPath;
  }

  const projectRelativePath = nodePath.join(cwd, configuredPath);
  if (await pathExists(projectRelativePath)) {
    return projectRelativePath;
  }

  return nodePath.join(repoRootPath, configuredPath);
}

async function readPromptFile(cwd: string, configuredPath: string): Promise<string> {
  const resolvedPath = await resolvePromptTemplatePath(cwd, configuredPath);
  return fsPromises.readFile(resolvedPath, "utf8");
}

export interface Cut2KitPromptTemplateBundle {
  readonly geometrySystem: string;
  readonly geometryUser: string;
  readonly framingSystem: string;
  readonly framingUser: string;
  readonly sheathingSystem: string;
  readonly sheathingUser: string;
  readonly validationChecklist: string;
}

export const loadCut2KitPromptTemplateBundle = Effect.fn(
  "loadCut2KitPromptTemplateBundle",
)(function* (input: {
  cwd: string;
  paths: Cut2KitPromptTemplatePaths;
}): Effect.fn.Return<Cut2KitPromptTemplateBundle, Cut2KitPromptTemplateError> {
  return yield* Effect.tryPromise({
    try: async () => ({
      geometrySystem: await readPromptFile(input.cwd, input.paths.geometrySystem),
      geometryUser: await readPromptFile(input.cwd, input.paths.geometryUser),
      framingSystem: await readPromptFile(input.cwd, input.paths.framingSystem),
      framingUser: await readPromptFile(input.cwd, input.paths.framingUser),
      sheathingSystem: await readPromptFile(input.cwd, input.paths.sheathingSystem),
      sheathingUser: await readPromptFile(input.cwd, input.paths.sheathingUser),
      validationChecklist: await readPromptFile(input.cwd, input.paths.validationChecklist),
    }),
    catch: (error) =>
      new Cut2KitPromptTemplateError({
        operation: "loadCut2KitPromptTemplateBundle.readPromptFile",
        detail: error instanceof Error ? error.message : String(error),
      }),
  });
});
