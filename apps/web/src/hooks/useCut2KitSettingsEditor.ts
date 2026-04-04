import { CUT2KIT_SETTINGS_FILE_NAME } from "@t3tools/shared/cut2kitSettingsDefaults";
import { useQueryClient } from "@tanstack/react-query";
import { useBlocker } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  applyCut2KitSettingsAdvancedJson,
  type Cut2KitSettingsEditorPath,
  type Cut2KitSettingsProjectContext,
  type Cut2KitSettingsEditorState,
  loadCut2KitSettingsEditorState,
  reloadCut2KitSettingsEditorState,
  replaceCut2KitSettingsEditorDraft,
  resolveCut2KitSettingsFilePath,
  saveCut2KitSettingsEditorState,
  setCut2KitDraftValue,
} from "~/lib/cut2kitSettingsEditor";
import { refreshCut2KitProjectQuery } from "~/lib/cut2kitReactQuery";
import { readNativeApi } from "~/nativeApi";
import { toastManager } from "~/components/ui/toast";

const DISCARD_CHANGES_MESSAGE =
  "Discard unsaved Cut2Kit settings changes? Any edits in the current draft will be lost.";

function formatErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function serializeDraftForAdvancedJson(draft: unknown): string {
  const serialized = JSON.stringify(draft, null, 2);
  return serialized ? `${serialized}\n` : "";
}

async function confirmDiscardChanges() {
  const api = readNativeApi();
  if (api) {
    return api.dialogs.confirm(DISCARD_CHANGES_MESSAGE);
  }

  if (typeof window === "undefined") {
    return true;
  }

  return window.confirm(DISCARD_CHANGES_MESSAGE);
}

export type UseCut2KitSettingsEditorResult = {
  state: Cut2KitSettingsEditorState | null;
  settingsFilePath: string;
  isLoading: boolean;
  isSaving: boolean;
  loadErrorMessage: string | null;
  advancedJsonText: string;
  advancedJsonErrorMessage: string | null;
  isAdvancedJsonDirty: boolean;
  hasUnsavedChanges: boolean;
  updateDraftAtPath: (path: Cut2KitSettingsEditorPath, value: unknown) => void;
  setAdvancedJsonText: (value: string) => void;
  applyAdvancedJson: () => void;
  resetAdvancedJsonToDraft: () => void;
  revertDraft: () => Promise<void>;
  reloadFromDisk: () => Promise<void>;
  saveDraft: () => Promise<void>;
  requestClose: () => Promise<boolean>;
};

export function useCut2KitSettingsEditor(input: {
  open: boolean;
  project: Cut2KitSettingsProjectContext | null;
}): UseCut2KitSettingsEditorResult {
  const queryClient = useQueryClient();
  const [state, setState] = useState<Cut2KitSettingsEditorState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null);
  const [advancedJsonText, setAdvancedJsonTextState] = useState("");
  const [advancedJsonErrorMessage, setAdvancedJsonErrorMessage] = useState<string | null>(null);
  const [isAdvancedJsonDirty, setIsAdvancedJsonDirty] = useState(false);
  const projectId = input.project?.id ?? null;
  const projectCwd = input.project?.cwd ?? null;
  const projectName = input.project?.name ?? null;
  const projectSettingsFilePath = input.project?.settingsFilePath ?? null;
  const project = useMemo(
    () =>
      projectId && projectCwd && projectName
        ? {
            cwd: projectCwd,
            id: projectId,
            name: projectName,
            settingsFilePath: projectSettingsFilePath,
          }
        : null,
    [projectCwd, projectId, projectName, projectSettingsFilePath],
  );

  const settingsFilePath = useMemo(() => {
    if (state) {
      return state.settingsFilePath;
    }
    if (project) {
      return resolveCut2KitSettingsFilePath(project);
    }
    return CUT2KIT_SETTINGS_FILE_NAME;
  }, [project, state]);

  const syncAdvancedJsonToDraft = useCallback((draft: unknown) => {
    setAdvancedJsonTextState(serializeDraftForAdvancedJson(draft));
    setAdvancedJsonErrorMessage(null);
    setIsAdvancedJsonDirty(false);
  }, []);

  useEffect(() => {
    if (!input.open || !project) {
      return;
    }

    let cancelled = false;
    const api = readNativeApi();
    if (!api) {
      setLoadErrorMessage("Cut2Kit settings are unavailable because the native API is not ready.");
      setState(null);
      return;
    }

    void (async () => {
      setIsLoading(true);
      setLoadErrorMessage(null);
      try {
        const nextState = await loadCut2KitSettingsEditorState(project, {
          readFile: api.projects.readFile,
        });
        if (cancelled) {
          return;
        }
        setState(nextState);
        syncAdvancedJsonToDraft(nextState.draft);
      } catch (error) {
        if (cancelled) {
          return;
        }
        setState(null);
        setAdvancedJsonTextState("");
        setAdvancedJsonErrorMessage(null);
        setIsAdvancedJsonDirty(false);
        setLoadErrorMessage(
          formatErrorMessage(error, "Could not load the Cut2Kit settings file from disk."),
        );
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [input.open, project, syncAdvancedJsonToDraft]);

  const hasUnsavedChanges = Boolean(state?.isDirty);

  useBlocker({
    disabled: !input.open || !hasUnsavedChanges,
    enableBeforeUnload: input.open && hasUnsavedChanges,
    shouldBlockFn: async () => !(await confirmDiscardChanges()),
  });

  const requestClose = useCallback(async () => {
    if (isSaving) {
      return false;
    }
    if (!hasUnsavedChanges) {
      return true;
    }
    return confirmDiscardChanges();
  }, [hasUnsavedChanges, isSaving]);

  const updateDraftAtPath = useCallback(
    (path: Cut2KitSettingsEditorPath, value: unknown) => {
      if (!state) {
        return;
      }

      const updatedState = replaceCut2KitSettingsEditorDraft(
        state,
        setCut2KitDraftValue(state.draft, path, value),
      );
      setState(updatedState);

      if (!isAdvancedJsonDirty) {
        syncAdvancedJsonToDraft(updatedState.draft);
      } else {
        setAdvancedJsonErrorMessage(null);
      }
    },
    [isAdvancedJsonDirty, state, syncAdvancedJsonToDraft],
  );

  const setAdvancedJsonText = useCallback((value: string) => {
    setAdvancedJsonTextState(value);
    setAdvancedJsonErrorMessage(null);
    setIsAdvancedJsonDirty(true);
  }, []);

  const applyAdvancedJson = useCallback(() => {
    if (!state) {
      return;
    }

    const result = applyCut2KitSettingsAdvancedJson(state, advancedJsonText);
    if (!result.nextState) {
      setAdvancedJsonErrorMessage(result.errorMessage);
      return;
    }

    setState(result.nextState);
    syncAdvancedJsonToDraft(result.nextState.draft);
  }, [advancedJsonText, state, syncAdvancedJsonToDraft]);

  const resetAdvancedJsonToDraft = useCallback(() => {
    if (!state) {
      return;
    }
    syncAdvancedJsonToDraft(state.draft);
  }, [state, syncAdvancedJsonToDraft]);

  const revertDraft = useCallback(async () => {
    if (!state) {
      return;
    }
    if (state.isDirty && !(await confirmDiscardChanges())) {
      return;
    }
    setState(replaceCut2KitSettingsEditorDraft(state, state.loadedDraft));
    syncAdvancedJsonToDraft(state.loadedDraft);
  }, [state, syncAdvancedJsonToDraft]);

  const reloadFromDisk = useCallback(async () => {
    if (!state) {
      return;
    }

    if (state.isDirty && !(await confirmDiscardChanges())) {
      return;
    }

    const api = readNativeApi();
    if (!api) {
      toastManager.add({
        type: "error",
        title: "Could not reload settings",
        description: "The native API is not ready.",
      });
      return;
    }

    setIsLoading(true);
    setLoadErrorMessage(null);
    try {
      const nextState = await reloadCut2KitSettingsEditorState(state, {
        readFile: api.projects.readFile,
      });
      setState(nextState);
      syncAdvancedJsonToDraft(nextState.draft);
      toastManager.add({
        type: "success",
        title: "Settings reloaded",
        description: `Reloaded ${nextState.settingsFilePath} from disk.`,
      });
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Could not reload settings",
        description: formatErrorMessage(error, "An unexpected error occurred."),
      });
    } finally {
      setIsLoading(false);
    }
  }, [state, syncAdvancedJsonToDraft]);

  const saveDraft = useCallback(async () => {
    if (!state) {
      return;
    }

    const api = readNativeApi();
    if (!api) {
      toastManager.add({
        type: "error",
        title: "Could not save settings",
        description: "The native API is not ready.",
      });
      return;
    }

    setIsSaving(true);
    try {
      const hadExistingFile = state.hasExistingFile;
      const nextState = await saveCut2KitSettingsEditorState(state, {
        writeFile: api.projects.writeFile,
        refreshProject: (cwd) => refreshCut2KitProjectQuery(queryClient, cwd),
      });
      setState(nextState);
      syncAdvancedJsonToDraft(nextState.draft);
      toastManager.add({
        type: "success",
        title: hadExistingFile ? "Settings saved" : "Settings file created",
        description: `Saved ${nextState.settingsFilePath}.`,
      });
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Could not save settings",
        description: formatErrorMessage(error, "An unexpected error occurred."),
      });
    } finally {
      setIsSaving(false);
    }
  }, [queryClient, state, syncAdvancedJsonToDraft]);

  return {
    state,
    settingsFilePath,
    isLoading,
    isSaving,
    loadErrorMessage,
    advancedJsonText,
    advancedJsonErrorMessage,
    isAdvancedJsonDirty,
    hasUnsavedChanges,
    updateDraftAtPath,
    setAdvancedJsonText,
    applyAdvancedJson,
    resetAdvancedJsonToDraft,
    revertDraft,
    reloadFromDisk,
    saveDraft,
    requestClose,
  };
}
