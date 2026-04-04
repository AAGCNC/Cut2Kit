import { Schema } from "effect";

import { Cut2KitSettings, type ProjectReadFileResult } from "@t3tools/contracts";
import {
  CUT2KIT_SETTINGS_FILE_NAME,
  createDefaultCut2KitSettings,
} from "@t3tools/shared/cut2kitSettingsDefaults";
import { formatSchemaError, fromLenientJson } from "@t3tools/shared/schemaJson";

import { decodeProjectFileText } from "./projectFileContents";

export type Cut2KitSettingsEditorPath = ReadonlyArray<string | number>;

export type Cut2KitSettingsValidationState = {
  isValid: boolean;
  errorMessage: string | null;
  typedSettings: Cut2KitSettings | null;
};

export type Cut2KitSettingsEditorState = {
  cwd: string;
  projectId: string;
  projectName: string;
  settingsFilePath: string;
  hasExistingFile: boolean;
  loadedDraft: unknown;
  draft: unknown;
  loadedRawText: string | null;
  parseErrorMessage: string | null;
  validation: Cut2KitSettingsValidationState;
  isDirty: boolean;
};

export type Cut2KitSettingsProjectContext = {
  cwd: string;
  id: string;
  name: string;
  settingsFilePath: string | null;
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

export function validateCut2KitSettingsDraft(draft: unknown): Cut2KitSettingsValidationState {
  const decoded = Schema.decodeUnknownExit(Cut2KitSettings)(draft);
  if (decoded._tag === "Failure") {
    return {
      isValid: false,
      errorMessage: formatSchemaError(decoded.cause),
      typedSettings: null,
    };
  }

  return {
    isValid: true,
    errorMessage: null,
    typedSettings: decoded.value,
  };
}

export function serializeCut2KitSettingsDocument(settings: Cut2KitSettings): string {
  return `${JSON.stringify(settings, null, 2)}\n`;
}

function computeIsDirty(input: {
  draft: unknown;
  loadedDraft: unknown;
  parseErrorMessage: string | null;
}) {
  if (input.parseErrorMessage) {
    return true;
  }
  return JSON.stringify(input.draft) !== JSON.stringify(input.loadedDraft);
}

export function createCut2KitSettingsEditorState(input: {
  project: Cut2KitSettingsProjectContext;
  draft: unknown;
  loadedDraft: unknown;
  loadedRawText: string | null;
  parseErrorMessage: string | null;
  hasExistingFile: boolean;
}): Cut2KitSettingsEditorState {
  const validation = validateCut2KitSettingsDraft(input.draft);
  return {
    cwd: input.project.cwd,
    projectId: input.project.id,
    projectName: input.project.name,
    settingsFilePath: resolveCut2KitSettingsFilePath(input.project),
    hasExistingFile: input.hasExistingFile,
    loadedDraft: deepCloneJsonValue(input.loadedDraft),
    draft: deepCloneJsonValue(input.draft),
    loadedRawText: input.loadedRawText,
    parseErrorMessage: input.parseErrorMessage,
    validation,
    isDirty: computeIsDirty({
      draft: input.draft,
      loadedDraft: input.loadedDraft,
      parseErrorMessage: input.parseErrorMessage,
    }),
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
    },
    draft,
    loadedDraft: state.loadedDraft,
    loadedRawText: state.loadedRawText,
    parseErrorMessage: state.parseErrorMessage,
    hasExistingFile: state.hasExistingFile,
  });
}

export function revertCut2KitSettingsEditorState(
  state: Cut2KitSettingsEditorState,
): Cut2KitSettingsEditorState {
  return replaceCut2KitSettingsEditorDraft(state, state.loadedDraft);
}

export async function reloadCut2KitSettingsEditorState(
  state: Cut2KitSettingsEditorState,
  deps: {
    readFile: (input: ReadFileInput) => Promise<ProjectReadFileResult>;
  },
): Promise<Cut2KitSettingsEditorState> {
  return loadCut2KitSettingsEditorState(
    {
      cwd: state.cwd,
      id: state.projectId,
      name: state.projectName,
      settingsFilePath: state.hasExistingFile ? state.settingsFilePath : null,
    },
    deps,
  );
}

export async function saveCut2KitSettingsEditorState(
  state: Cut2KitSettingsEditorState,
  deps: {
    writeFile: (input: WriteFileInput) => Promise<WriteFileResult>;
    refreshProject: (cwd: string) => Promise<unknown> | unknown;
  },
): Promise<Cut2KitSettingsEditorState> {
  const validation = validateCut2KitSettingsDraft(state.draft);
  if (!validation.isValid || !validation.typedSettings) {
    throw new Error(
      validation.errorMessage
        ? `Cut2Kit settings validation failed: ${validation.errorMessage}`
        : "Cut2Kit settings validation failed.",
    );
  }

  const contents = serializeCut2KitSettingsDocument(validation.typedSettings);
  await deps.writeFile({
    cwd: state.cwd,
    relativePath: state.settingsFilePath,
    contents,
  });
  await deps.refreshProject(state.cwd);

  return createCut2KitSettingsEditorState({
    project: {
      cwd: state.cwd,
      id: state.projectId,
      name: state.projectName,
      settingsFilePath: state.settingsFilePath,
    },
    draft: validation.typedSettings,
    loadedDraft: validation.typedSettings,
    loadedRawText: contents,
    parseErrorMessage: null,
    hasExistingFile: true,
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
