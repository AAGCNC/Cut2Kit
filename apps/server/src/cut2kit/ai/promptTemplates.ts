import fsPromises from "node:fs/promises";
import nodePath from "node:path";
import { fileURLToPath } from "node:url";

import { Effect, Schema } from "effect";

import type {
  Cut2KitPromptTemplatePaths,
  Cut2KitResolvedPromptTemplate,
  Cut2KitResolvedPromptTemplates,
} from "@t3tools/contracts";

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

async function resolvePromptTemplatePath(
  cwd: string,
  configuredPath: string,
): Promise<{
  resolvedPath: string;
  source: Cut2KitResolvedPromptTemplate["source"];
}> {
  if (nodePath.isAbsolute(configuredPath)) {
    return {
      resolvedPath: configuredPath,
      source: "external",
    };
  }

  const projectRelativePath = nodePath.join(cwd, configuredPath);
  if (await pathExists(projectRelativePath)) {
    return {
      resolvedPath: projectRelativePath,
      source: "workspace",
    };
  }

  return {
    resolvedPath: nodePath.join(repoRootPath, configuredPath),
    source: "repo_default",
  };
}

async function readPromptFile(
  cwd: string,
  configuredPath: string,
): Promise<Cut2KitResolvedPromptTemplate> {
  const resolved = await resolvePromptTemplatePath(cwd, configuredPath);
  return {
    configuredPath,
    resolvedPath: resolved.resolvedPath,
    source: resolved.source,
    contents: await fsPromises.readFile(resolved.resolvedPath, "utf8"),
  };
}

export interface Cut2KitPromptTemplateBundle {
  readonly geometrySystem: string;
  readonly geometryUser: string;
  readonly framingSystem: string;
  readonly framingUser: string;
  readonly sheathingSystem: string;
  readonly sheathingUser: string;
  readonly manufacturingSystem: string;
  readonly manufacturingUser: string;
  readonly validationChecklist: string;
}

function toPromptTemplateBundle(
  resolvedPromptTemplates: Cut2KitResolvedPromptTemplates,
): Cut2KitPromptTemplateBundle {
  return {
    geometrySystem: resolvedPromptTemplates.geometrySystem.contents,
    geometryUser: resolvedPromptTemplates.geometryUser.contents,
    framingSystem: resolvedPromptTemplates.framingSystem.contents,
    framingUser: resolvedPromptTemplates.framingUser.contents,
    sheathingSystem: resolvedPromptTemplates.sheathingSystem.contents,
    sheathingUser: resolvedPromptTemplates.sheathingUser.contents,
    manufacturingSystem: resolvedPromptTemplates.manufacturingSystem.contents,
    manufacturingUser: resolvedPromptTemplates.manufacturingUser.contents,
    validationChecklist: resolvedPromptTemplates.validationChecklist.contents,
  };
}

export const loadCut2KitResolvedPromptTemplates = Effect.fn("loadCut2KitResolvedPromptTemplates")(
  function* (input: {
    cwd: string;
    paths: Cut2KitPromptTemplatePaths;
  }): Effect.fn.Return<Cut2KitResolvedPromptTemplates, Cut2KitPromptTemplateError> {
    return yield* Effect.tryPromise({
      try: async () => ({
        geometrySystem: await readPromptFile(input.cwd, input.paths.geometrySystem),
        geometryUser: await readPromptFile(input.cwd, input.paths.geometryUser),
        framingSystem: await readPromptFile(input.cwd, input.paths.framingSystem),
        framingUser: await readPromptFile(input.cwd, input.paths.framingUser),
        sheathingSystem: await readPromptFile(input.cwd, input.paths.sheathingSystem),
        sheathingUser: await readPromptFile(input.cwd, input.paths.sheathingUser),
        manufacturingSystem: await readPromptFile(input.cwd, input.paths.manufacturingSystem),
        manufacturingUser: await readPromptFile(input.cwd, input.paths.manufacturingUser),
        validationChecklist: await readPromptFile(input.cwd, input.paths.validationChecklist),
      }),
      catch: (error) =>
        new Cut2KitPromptTemplateError({
          operation: "loadCut2KitResolvedPromptTemplates.readPromptFile",
          detail: error instanceof Error ? error.message : String(error),
        }),
    });
  },
);

export const loadCut2KitPromptTemplateBundle = Effect.fn("loadCut2KitPromptTemplateBundle")(
  function* (input: {
    cwd: string;
    paths: Cut2KitPromptTemplatePaths;
  }): Effect.fn.Return<Cut2KitPromptTemplateBundle, Cut2KitPromptTemplateError> {
    const resolvedPromptTemplates = yield* loadCut2KitResolvedPromptTemplates(input);
    return toPromptTemplateBundle(resolvedPromptTemplates);
  },
);
