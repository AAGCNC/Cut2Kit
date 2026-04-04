import {
  Cut2KitSettings,
  type Cut2KitPromptTemplateSource,
  type Cut2KitResolvedPromptTemplates,
  type ProjectReadFileResult,
} from "@t3tools/contracts";
import {
  CUT2KIT_SETTINGS_FILE_NAME,
  createDefaultCut2KitSettings,
} from "@t3tools/shared/cut2kitSettingsDefaults";
import { formatSchemaError, fromLenientJson } from "@t3tools/shared/schemaJson";
import { Schema } from "effect";

import { decodeProjectFileText } from "./projectFileContents";

export type Cut2KitSettingsEditorPath = ReadonlyArray<string | number>;

export const CUT2KIT_PROMPT_TEMPLATE_KEYS = [
  "geometrySystem",
  "geometryUser",
  "framingSystem",
  "framingUser",
  "sheathingSystem",
  "sheathingUser",
  "validationChecklist",
] as const;

export type Cut2KitPromptTemplateKey = (typeof CUT2KIT_PROMPT_TEMPLATE_KEYS)[number];

export type Cut2KitPromptTemplateDraft = {
  loadedConfiguredPath: string;
  loadedContents: string | null;
  resolvedPath: string | null;
  source: Cut2KitPromptTemplateSource | null;
  contents: string;
};

export type Cut2KitPromptTemplateDrafts = Record<
  Cut2KitPromptTemplateKey,
  Cut2KitPromptTemplateDraft
>;

export type Cut2KitSettingsValidationState = {
  isValid: boolean;
  errorMessage: string | null;
  typedSettings: Cut2KitSettings | null;
  settingsErrorMessage: string | null;
  promptTemplateErrors: Partial<Record<Cut2KitPromptTemplateKey, string>>;
};

export type Cut2KitSettingsEditorState = {
  cwd: string;
  projectId: string;
  projectName: string;
  settingsFilePath: string;
  hasExistingFile: boolean;
  resolvedPromptTemplates: Cut2KitResolvedPromptTemplates | null;
  loadedDraft: unknown;
  draft: unknown;
  promptTemplates: Cut2KitPromptTemplateDrafts;
  loadedRawText: string | null;
  parseErrorMessage: string | null;
  validation: Cut2KitSettingsValidationState;
  settingsIsDirty: boolean;
  promptTemplatesAreDirty: boolean;
  isDirty: boolean;
};

export type Cut2KitSettingsProjectContext = {
  cwd: string;
  id: string;
  name: string;
  settingsFilePath: string | null;
  resolvedPromptTemplates: Cut2KitResolvedPromptTemplates | null;
};

type ReadFileInput = {
  cwd: string;
  relativePath: string;
};

type WriteFileInput = ReadFileInput & {
  contents: string;
};

type WriteFileResult = {
  relativePath: string;
};

const LenientUnknownJsonDocument = fromLenientJson(Schema.Unknown);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepCloneJsonValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function resolveDefaultSettingsForProject(project: Cut2KitSettingsProjectContext): Cut2KitSettings {
  return createDefaultCut2KitSettings({
    projectId: project.id,
    jobName: project.name,
  });
}

function isAbsolutePathLike(path: string): boolean {
  return path.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(path);
}

function serializePromptTemplateContents(contents: string): string {
  return contents.endsWith("\n") ? contents : `${contents}\n`;
}

function promptTemplateLabel(key: Cut2KitPromptTemplateKey): string {
  switch (key) {
    case "geometrySystem":
      return "Geometry system prompt";
    case "geometryUser":
      return "Geometry user prompt";
    case "framingSystem":
      return "Framing system prompt";
    case "framingUser":
      return "Framing user prompt";
    case "sheathingSystem":
      return "Sheathing system prompt";
    case "sheathingUser":
      return "Sheathing user prompt";
    case "validationChecklist":
      return "Validation checklist";
  }
}

function resolvePromptTemplateConfiguredPath(
  project: Cut2KitSettingsProjectContext,
  draft: unknown,
  key: Cut2KitPromptTemplateKey,
): string {
  const draftValue = getCut2KitDraftValue(draft, ["ai", "promptTemplatePaths", key]);
  if (typeof draftValue === "string" && draftValue.trim().length > 0) {
    return draftValue;
  }

  const resolvedEntry = project.resolvedPromptTemplates?.[key];
  if (resolvedEntry) {
    return resolvedEntry.configuredPath;
  }

  return resolveDefaultSettingsForProject(project).ai.promptTemplatePaths[key];
}

function createPromptTemplateDrafts(
  project: Cut2KitSettingsProjectContext,
  draft: unknown,
): Cut2KitPromptTemplateDrafts {
  return Object.fromEntries(
    CUT2KIT_PROMPT_TEMPLATE_KEYS.map((key) => {
      const resolvedEntry = project.resolvedPromptTemplates?.[key] ?? null;
      const configuredPath = resolvePromptTemplateConfiguredPath(project, draft, key);
      return [
        key,
        {
          loadedConfiguredPath: resolvedEntry?.configuredPath ?? configuredPath,
          loadedContents: resolvedEntry?.contents ?? null,
          resolvedPath: resolvedEntry?.resolvedPath ?? null,
          source: resolvedEntry?.source ?? null,
          contents: resolvedEntry?.contents ?? "",
        },
      ];
    }),
  ) as Cut2KitPromptTemplateDrafts;
}

function promptTemplateHasUnsavedChanges(template: Cut2KitPromptTemplateDraft) {
  if (template.loadedContents === null) {
    return template.contents.trim().length > 0;
  }
  return template.contents !== template.loadedContents;
}

function computeSettingsIsDirty(input: {
  draft: unknown;
  loadedDraft: unknown;
  parseErrorMessage: string | null;
}) {
  if (input.parseErrorMessage) {
    return true;
  }
  return JSON.stringify(input.draft) !== JSON.stringify(input.loadedDraft);
}

function computePromptTemplatesAreDirty(promptTemplates: Cut2KitPromptTemplateDrafts) {
  return CUT2KIT_PROMPT_TEMPLATE_KEYS.some((key) =>
    promptTemplateHasUnsavedChanges(promptTemplates[key]),
  );
}

function validatePromptTemplateDrafts(
  draft: unknown,
  promptTemplates: Cut2KitPromptTemplateDrafts,
): Partial<Record<Cut2KitPromptTemplateKey, string>> {
  const errors: Partial<Record<Cut2KitPromptTemplateKey, string>> = {};

  for (const key of CUT2KIT_PROMPT_TEMPLATE_KEYS) {
    const promptTemplate = promptTemplates[key];
    const configuredPathValue = getCut2KitDraftValue(draft, ["ai", "promptTemplatePaths", key]);
    const configuredPath =
      typeof configuredPathValue === "string"
        ? configuredPathValue
        : promptTemplate.loadedConfiguredPath;
    const pathChanged = configuredPath !== promptTemplate.loadedConfiguredPath;
    const contentsChanged = promptTemplateHasUnsavedChanges(promptTemplate);

    if (!pathChanged && !contentsChanged) {
      continue;
    }

    if (promptTemplate.contents.trim().length === 0) {
      errors[key] = `${promptTemplateLabel(key)} cannot be blank when saving a project override.`;
      continue;
    }

    if (isAbsolutePathLike(configuredPath)) {
      errors[key] =
        `${promptTemplateLabel(key)} must use a project-relative path to save a local override.`;
    }
  }

  return errors;
}

export function resolveCut2KitSettingsFilePath(
  project: Pick<Cut2KitSettingsProjectContext, "settingsFilePath">,
) {
  return project.settingsFilePath ?? CUT2KIT_SETTINGS_FILE_NAME;
}

export function parseLenientJsonDocument(text: string): {
  document: unknown | null;
  errorMessage: string | null;
} {
  const decoded = Schema.decodeUnknownExit(LenientUnknownJsonDocument)(text);
  if (decoded._tag === "Failure") {
    return {
      document: null,
      errorMessage: formatSchemaError(decoded.cause),
    };
  }

  return {
    document: decoded.value,
    errorMessage: null,
  };
}

export function validateCut2KitSettingsDraft(
  draft: unknown,
  promptTemplates?: Cut2KitPromptTemplateDrafts,
): Cut2KitSettingsValidationState {
  const decoded = Schema.decodeUnknownExit(Cut2KitSettings)(draft);
  const promptTemplateErrors = promptTemplates
    ? validatePromptTemplateDrafts(draft, promptTemplates)
    : {};
  const promptTemplateErrorMessage =
    CUT2KIT_PROMPT_TEMPLATE_KEYS.map((key) => promptTemplateErrors[key]).find(
      (value): value is string => typeof value === "string",
    ) ?? null;

  if (decoded._tag === "Failure") {
    return {
      isValid: false,
      errorMessage: formatSchemaError(decoded.cause),
      typedSettings: null,
      settingsErrorMessage: formatSchemaError(decoded.cause),
      promptTemplateErrors,
    };
  }

  return {
    isValid: promptTemplateErrorMessage === null,
    errorMessage: promptTemplateErrorMessage,
    typedSettings: decoded.value,
    settingsErrorMessage: null,
    promptTemplateErrors,
  };
}

export function serializeCut2KitSettingsDocument(settings: Cut2KitSettings): string {
  return `${JSON.stringify(settings, null, 2)}\n`;
}

export function createCut2KitSettingsEditorState(input: {
  project: Cut2KitSettingsProjectContext;
  draft: unknown;
  loadedDraft: unknown;
  loadedRawText: string | null;
  parseErrorMessage: string | null;
  hasExistingFile: boolean;
  promptTemplates?: Cut2KitPromptTemplateDrafts;
}): Cut2KitSettingsEditorState {
  const promptTemplates = input.promptTemplates
    ? deepCloneJsonValue(input.promptTemplates)
    : createPromptTemplateDrafts(input.project, input.draft);
  const validation = validateCut2KitSettingsDraft(input.draft, promptTemplates);
  const settingsIsDirty = computeSettingsIsDirty({
    draft: input.draft,
    loadedDraft: input.loadedDraft,
    parseErrorMessage: input.parseErrorMessage,
  });
  const promptTemplatesAreDirty = computePromptTemplatesAreDirty(promptTemplates);

  return {
    cwd: input.project.cwd,
    projectId: input.project.id,
    projectName: input.project.name,
    settingsFilePath: resolveCut2KitSettingsFilePath(input.project),
    hasExistingFile: input.hasExistingFile,
    resolvedPromptTemplates: input.project.resolvedPromptTemplates,
    loadedDraft: deepCloneJsonValue(input.loadedDraft),
    draft: deepCloneJsonValue(input.draft),
    promptTemplates,
    loadedRawText: input.loadedRawText,
    parseErrorMessage: input.parseErrorMessage,
    validation,
    settingsIsDirty,
    promptTemplatesAreDirty,
    isDirty: settingsIsDirty || promptTemplatesAreDirty,
  };
}

export async function loadCut2KitSettingsEditorState(
  project: Cut2KitSettingsProjectContext,
  deps: {
    readFile: (input: ReadFileInput) => Promise<ProjectReadFileResult>;
  },
): Promise<Cut2KitSettingsEditorState> {
  if (!project.settingsFilePath) {
    const defaults = resolveDefaultSettingsForProject(project);
    return createCut2KitSettingsEditorState({
      project,
      draft: defaults,
      loadedDraft: defaults,
      loadedRawText: null,
      parseErrorMessage: null,
      hasExistingFile: false,
    });
  }

  const document = await deps.readFile({
    cwd: project.cwd,
    relativePath: project.settingsFilePath,
  });
  const rawText = decodeProjectFileText(document);
  const parsed = parseLenientJsonDocument(rawText);
  const fallbackDraft = resolveDefaultSettingsForProject(project);
  const loadedDraft = parsed.document ?? fallbackDraft;

  return createCut2KitSettingsEditorState({
    project,
    draft: loadedDraft,
    loadedDraft,
    loadedRawText: rawText,
    parseErrorMessage: parsed.errorMessage,
    hasExistingFile: true,
  });
}

export function replaceCut2KitSettingsEditorDraft(
  state: Cut2KitSettingsEditorState,
  draft: unknown,
): Cut2KitSettingsEditorState {
  return createCut2KitSettingsEditorState({
    project: {
      cwd: state.cwd,
      id: state.projectId,
      name: state.projectName,
      settingsFilePath: state.hasExistingFile ? state.settingsFilePath : null,
      resolvedPromptTemplates: state.resolvedPromptTemplates,
    },
    draft,
    loadedDraft: state.loadedDraft,
    loadedRawText: state.loadedRawText,
    parseErrorMessage: state.parseErrorMessage,
    hasExistingFile: state.hasExistingFile,
    promptTemplates: state.promptTemplates,
  });
}

export function replaceCut2KitPromptTemplateDraft(
  state: Cut2KitSettingsEditorState,
  key: Cut2KitPromptTemplateKey,
  contents: string,
): Cut2KitSettingsEditorState {
  return createCut2KitSettingsEditorState({
    project: {
      cwd: state.cwd,
      id: state.projectId,
      name: state.projectName,
      settingsFilePath: state.hasExistingFile ? state.settingsFilePath : null,
      resolvedPromptTemplates: state.resolvedPromptTemplates,
    },
    draft: state.draft,
    loadedDraft: state.loadedDraft,
    loadedRawText: state.loadedRawText,
    parseErrorMessage: state.parseErrorMessage,
    hasExistingFile: state.hasExistingFile,
    promptTemplates: {
      ...state.promptTemplates,
      [key]: {
        ...state.promptTemplates[key],
        contents,
      },
    },
  });
}

export function revertCut2KitSettingsEditorState(
  state: Cut2KitSettingsEditorState,
): Cut2KitSettingsEditorState {
  return createCut2KitSettingsEditorState({
    project: {
      cwd: state.cwd,
      id: state.projectId,
      name: state.projectName,
      settingsFilePath: state.hasExistingFile ? state.settingsFilePath : null,
      resolvedPromptTemplates: state.resolvedPromptTemplates,
    },
    draft: state.loadedDraft,
    loadedDraft: state.loadedDraft,
    loadedRawText: state.loadedRawText,
    parseErrorMessage: state.parseErrorMessage,
    hasExistingFile: state.hasExistingFile,
    promptTemplates: createPromptTemplateDrafts(
      {
        cwd: state.cwd,
        id: state.projectId,
        name: state.projectName,
        settingsFilePath: state.hasExistingFile ? state.settingsFilePath : null,
        resolvedPromptTemplates: state.resolvedPromptTemplates,
      },
      state.loadedDraft,
    ),
  });
}

export async function reloadCut2KitSettingsEditorState(
  state: Cut2KitSettingsEditorState,
  deps: {
    readFile: (input: ReadFileInput) => Promise<ProjectReadFileResult>;
    project?: Cut2KitSettingsProjectContext;
  },
): Promise<Cut2KitSettingsEditorState> {
  return loadCut2KitSettingsEditorState(
    deps.project ?? {
      cwd: state.cwd,
      id: state.projectId,
      name: state.projectName,
      settingsFilePath: state.hasExistingFile ? state.settingsFilePath : null,
      resolvedPromptTemplates: state.resolvedPromptTemplates,
    },
    {
      readFile: deps.readFile,
    },
  );
}

function buildSavedPromptTemplateDrafts(
  state: Cut2KitSettingsEditorState,
  settings: Cut2KitSettings,
): Cut2KitPromptTemplateDrafts {
  return Object.fromEntries(
    CUT2KIT_PROMPT_TEMPLATE_KEYS.map((key) => {
      const currentPath = settings.ai.promptTemplatePaths[key];
      const currentDraft = state.promptTemplates[key];
      const contentsChanged = promptTemplateHasUnsavedChanges(currentDraft);
      const pathChanged = currentPath !== currentDraft.loadedConfiguredPath;

      if (contentsChanged || pathChanged) {
        return [
          key,
          {
            loadedConfiguredPath: currentPath,
            loadedContents: currentDraft.contents,
            resolvedPath: currentPath,
            source: "workspace" as const,
            contents: currentDraft.contents,
          },
        ];
      }

      return [key, currentDraft];
    }),
  ) as Cut2KitPromptTemplateDrafts;
}

export async function saveCut2KitSettingsEditorState(
  state: Cut2KitSettingsEditorState,
  deps: {
    readFile?: (input: ReadFileInput) => Promise<ProjectReadFileResult>;
    writeFile: (input: WriteFileInput) => Promise<WriteFileResult>;
    refreshProject: (cwd: string) => Promise<unknown> | unknown;
  },
): Promise<Cut2KitSettingsEditorState> {
  const validation = validateCut2KitSettingsDraft(state.draft, state.promptTemplates);
  if (!validation.isValid || !validation.typedSettings) {
    throw new Error(
      validation.errorMessage
        ? `Cut2Kit settings validation failed: ${validation.errorMessage}`
        : "Cut2Kit settings validation failed.",
    );
  }

  for (const key of CUT2KIT_PROMPT_TEMPLATE_KEYS) {
    const promptTemplate = state.promptTemplates[key];
    const currentPath = validation.typedSettings.ai.promptTemplatePaths[key];
    const contentsChanged = promptTemplateHasUnsavedChanges(promptTemplate);
    const pathChanged = currentPath !== promptTemplate.loadedConfiguredPath;

    if (!contentsChanged && !pathChanged) {
      continue;
    }

    if (isAbsolutePathLike(currentPath)) {
      throw new Error(
        `${promptTemplateLabel(key)} must use a project-relative path to save a local override.`,
      );
    }

    await deps.writeFile({
      cwd: state.cwd,
      relativePath: currentPath,
      contents: serializePromptTemplateContents(promptTemplate.contents),
    });
  }

  const contents = serializeCut2KitSettingsDocument(validation.typedSettings);
  if (state.settingsIsDirty || state.promptTemplatesAreDirty || !state.hasExistingFile) {
    await deps.writeFile({
      cwd: state.cwd,
      relativePath: state.settingsFilePath,
      contents,
    });
  }
  await deps.refreshProject(state.cwd);

  return createCut2KitSettingsEditorState({
    project: {
      cwd: state.cwd,
      id: state.projectId,
      name: state.projectName,
      settingsFilePath: state.settingsFilePath,
      resolvedPromptTemplates: state.resolvedPromptTemplates,
    },
    draft: validation.typedSettings,
    loadedDraft: validation.typedSettings,
    loadedRawText: contents,
    parseErrorMessage: null,
    hasExistingFile: true,
    promptTemplates: buildSavedPromptTemplateDrafts(state, validation.typedSettings),
  });
}

export function applyCut2KitSettingsAdvancedJson(
  state: Cut2KitSettingsEditorState,
  jsonText: string,
): { nextState: Cut2KitSettingsEditorState | null; errorMessage: string | null } {
  const parsed = parseLenientJsonDocument(jsonText);
  if (parsed.errorMessage) {
    return {
      nextState: null,
      errorMessage: parsed.errorMessage,
    };
  }

  return {
    nextState: replaceCut2KitSettingsEditorDraft(state, parsed.document),
    errorMessage: null,
  };
}

export function getCut2KitDraftValue(root: unknown, path: Cut2KitSettingsEditorPath): unknown {
  let current = root;
  for (const segment of path) {
    if (typeof segment === "number") {
      if (!Array.isArray(current)) {
        return undefined;
      }
      current = current[segment];
      continue;
    }
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[segment];
  }
  return current;
}

export function setCut2KitDraftValue(
  root: unknown,
  path: Cut2KitSettingsEditorPath,
  value: unknown,
): unknown {
  if (path.length === 0) {
    return value;
  }

  const [segment, ...rest] = path;
  if (segment === undefined) {
    return value;
  }
  if (typeof segment === "number") {
    const source = Array.isArray(root) ? [...root] : [];
    source[segment] = setCut2KitDraftValue(source[segment], rest, value);
    return source;
  }

  const source = isRecord(root) ? { ...root } : {};
  if (rest.length === 0) {
    if (value === undefined) {
      delete source[segment];
    } else {
      source[segment] = value;
    }
    return source;
  }
  source[segment] = setCut2KitDraftValue(source[segment], rest, value);
  return source;
}
