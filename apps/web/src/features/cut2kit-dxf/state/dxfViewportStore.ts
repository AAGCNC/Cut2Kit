import type { ProjectId } from "@t3tools/contracts";
import { create } from "zustand";

export type DxfViewportLoadStatus = "idle" | "loading" | "ready" | "error";

export type DxfViewportBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export type DxfViewportView = {
  centerX: number;
  centerY: number;
  width: number;
};

export type ProjectDxfViewportState = {
  selectedBaseDxfPath: string | null;
  loadStatus: DxfViewportLoadStatus;
  loadedPath: string | null;
  modifiedAt: string | null;
  bounds: DxfViewportBounds | null;
  view: DxfViewportView | null;
  homeView: DxfViewportView | null;
  warnings: ReadonlyArray<string>;
  errorMessage: string | null;
};

type DxfViewportStore = {
  byProjectId: Record<string, ProjectDxfViewportState>;
  syncProjectOptions: (projectId: ProjectId, availablePaths: ReadonlyArray<string>) => void;
  setSelectedBaseDxf: (projectId: ProjectId, relativePath: string | null) => void;
  markLoading: (projectId: ProjectId, relativePath: string, modifiedAt: string | null) => void;
  markReady: (
    projectId: ProjectId,
    relativePath: string,
    payload: {
      bounds: DxfViewportBounds | null;
      view: DxfViewportView | null;
      homeView: DxfViewportView | null;
      warnings: ReadonlyArray<string>;
      modifiedAt: string | null;
    },
  ) => void;
  markError: (projectId: ProjectId, relativePath: string, errorMessage: string) => void;
  setWarnings: (
    projectId: ProjectId,
    relativePath: string,
    warnings: ReadonlyArray<string>,
  ) => void;
  setView: (projectId: ProjectId, relativePath: string, view: DxfViewportView | null) => void;
};

function createInitialProjectState(
  selectedBaseDxfPath: string | null = null,
): ProjectDxfViewportState {
  return {
    selectedBaseDxfPath,
    loadStatus: selectedBaseDxfPath ? "idle" : "idle",
    loadedPath: null,
    modifiedAt: null,
    bounds: null,
    view: null,
    homeView: null,
    warnings: [],
    errorMessage: null,
  };
}

function getProjectState(
  state: DxfViewportStore["byProjectId"],
  projectId: ProjectId,
): ProjectDxfViewportState {
  return state[projectId] ?? createInitialProjectState();
}

function resetDocumentState(
  current: ProjectDxfViewportState,
  selectedBaseDxfPath: string | null,
): ProjectDxfViewportState {
  if (current.selectedBaseDxfPath === selectedBaseDxfPath && current.loadedPath === null) {
    return current;
  }
  return createInitialProjectState(selectedBaseDxfPath);
}

function isCurrentSelection(projectState: ProjectDxfViewportState, relativePath: string): boolean {
  return projectState.selectedBaseDxfPath === relativePath;
}

export const useCut2KitDxfViewportStore = create<DxfViewportStore>((set) => ({
  byProjectId: {},

  syncProjectOptions: (projectId, availablePaths) => {
    set((state) => {
      const current = getProjectState(state.byProjectId, projectId);
      const nextSelected =
        current.selectedBaseDxfPath && availablePaths.includes(current.selectedBaseDxfPath)
          ? current.selectedBaseDxfPath
          : (availablePaths[0] ?? null);

      if (current.selectedBaseDxfPath === nextSelected) {
        return state;
      }

      return {
        byProjectId: {
          ...state.byProjectId,
          [projectId]: resetDocumentState(current, nextSelected),
        },
      };
    });
  },

  setSelectedBaseDxf: (projectId, relativePath) => {
    set((state) => {
      const current = getProjectState(state.byProjectId, projectId);
      if (current.selectedBaseDxfPath === relativePath) {
        return state;
      }

      return {
        byProjectId: {
          ...state.byProjectId,
          [projectId]: resetDocumentState(current, relativePath),
        },
      };
    });
  },

  markLoading: (projectId, relativePath, modifiedAt) => {
    set((state) => {
      const current = getProjectState(state.byProjectId, projectId);
      if (!isCurrentSelection(current, relativePath)) {
        return state;
      }
      return {
        byProjectId: {
          ...state.byProjectId,
          [projectId]: {
            ...current,
            loadStatus: "loading",
            loadedPath: null,
            modifiedAt,
            bounds: null,
            view: null,
            homeView: null,
            warnings: [],
            errorMessage: null,
          },
        },
      };
    });
  },

  markReady: (projectId, relativePath, payload) => {
    set((state) => {
      const current = getProjectState(state.byProjectId, projectId);
      if (!isCurrentSelection(current, relativePath)) {
        return state;
      }
      return {
        byProjectId: {
          ...state.byProjectId,
          [projectId]: {
            ...current,
            loadStatus: "ready",
            loadedPath: relativePath,
            modifiedAt: payload.modifiedAt,
            bounds: payload.bounds,
            view: payload.view,
            homeView: payload.homeView,
            warnings: [...payload.warnings],
            errorMessage: null,
          },
        },
      };
    });
  },

  markError: (projectId, relativePath, errorMessage) => {
    set((state) => {
      const current = getProjectState(state.byProjectId, projectId);
      if (!isCurrentSelection(current, relativePath)) {
        return state;
      }
      return {
        byProjectId: {
          ...state.byProjectId,
          [projectId]: {
            ...current,
            loadStatus: "error",
            loadedPath: null,
            errorMessage,
            warnings: [],
          },
        },
      };
    });
  },

  setWarnings: (projectId, relativePath, warnings) => {
    set((state) => {
      const current = getProjectState(state.byProjectId, projectId);
      if (!isCurrentSelection(current, relativePath)) {
        return state;
      }
      return {
        byProjectId: {
          ...state.byProjectId,
          [projectId]: {
            ...current,
            warnings: [...warnings],
          },
        },
      };
    });
  },

  setView: (projectId, relativePath, view) => {
    set((state) => {
      const current = getProjectState(state.byProjectId, projectId);
      if (!isCurrentSelection(current, relativePath)) {
        return state;
      }
      return {
        byProjectId: {
          ...state.byProjectId,
          [projectId]: {
            ...current,
            view,
          },
        },
      };
    });
  },
}));

export function selectProjectDxfViewportState(
  state: { byProjectId: Record<string, ProjectDxfViewportState> },
  projectId: ProjectId,
): ProjectDxfViewportState {
  return state.byProjectId[projectId] ?? createInitialProjectState();
}
