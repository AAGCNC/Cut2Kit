import type { ProjectDxfViewportState } from "../state/dxfViewportStore";

export type DxfViewportPresentation =
  | {
      kind: "empty";
      title: string;
      description: string;
    }
  | {
      kind: "loading";
      title: string;
      description: string;
    }
  | {
      kind: "error";
      title: string;
      description: string;
    }
  | {
      kind: "ready";
    };

export function getDxfViewportPresentation(input: {
  dxfCount: number;
  selectedBaseDxfPath: string | null;
  isFileLoading: boolean;
  fileErrorMessage: string | null;
  viewportState: ProjectDxfViewportState;
}): DxfViewportPresentation {
  if (input.dxfCount === 0) {
    return {
      kind: "empty",
      title: "No DXF files detected",
      description: "Add DXF files to the active project to render a base drawing here.",
    };
  }

  if (!input.selectedBaseDxfPath) {
    return {
      kind: "empty",
      title: "Choose a base DXF",
      description: "Select one of the active project DXFs to load it into the viewport.",
    };
  }

  if (input.fileErrorMessage) {
    return {
      kind: "error",
      title: "Could not load DXF",
      description: input.fileErrorMessage,
    };
  }

  if (input.isFileLoading || input.viewportState.loadStatus === "loading") {
    return {
      kind: "loading",
      title: "Loading DXF",
      description: `Parsing ${input.selectedBaseDxfPath} for viewport rendering.`,
    };
  }

  if (input.viewportState.loadStatus === "error") {
    return {
      kind: "error",
      title: "DXF render failed",
      description:
        input.viewportState.errorMessage ??
        `The selected DXF could not be rendered: ${input.selectedBaseDxfPath}.`,
    };
  }

  return { kind: "ready" };
}
