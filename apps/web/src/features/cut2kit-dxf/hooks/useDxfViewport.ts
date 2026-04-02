import type { ProjectId, ProjectReadFileResult } from "@t3tools/contracts";
import { useEffect, useMemo, useRef } from "react";

import { DxfViewerAdapter } from "../lib/dxfViewerAdapter";
import { useCut2KitDxfViewportStore } from "../state/dxfViewportStore";

export type DxfViewportActions = {
  fitToView: () => void;
  resetView: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
};

export function useDxfViewport(input: {
  projectId: ProjectId;
  selectedBaseDxfPath: string | null;
  document: ProjectReadFileResult | null;
  fileErrorMessage: string | null;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const adapterRef = useRef<DxfViewerAdapter | null>(null);
  const activePathRef = useRef<string | null>(input.selectedBaseDxfPath);
  const loadSequenceRef = useRef(0);
  const setView = useCut2KitDxfViewportStore((state) => state.setView);
  const markLoading = useCut2KitDxfViewportStore((state) => state.markLoading);
  const markReady = useCut2KitDxfViewportStore((state) => state.markReady);
  const markError = useCut2KitDxfViewportStore((state) => state.markError);

  activePathRef.current = input.selectedBaseDxfPath;

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    try {
      adapterRef.current = new DxfViewerAdapter(containerRef.current, {
        onViewChange: (view) => {
          const activePath = activePathRef.current;
          if (!activePath) {
            return;
          }
          setView(input.projectId, activePath, view);
        },
      });
    } catch (error) {
      const activePath = activePathRef.current;
      if (activePath) {
        markError(
          input.projectId,
          activePath,
          error instanceof Error ? error.message : "Unable to initialize the DXF renderer.",
        );
      }
    }

    return () => {
      adapterRef.current?.destroy();
      adapterRef.current = null;
    };
  }, [input.projectId, markError, setView]);

  useEffect(() => {
    const adapter = adapterRef.current;
    const selectedBaseDxfPath = input.selectedBaseDxfPath;
    const document = input.document;

    if (!adapter) {
      return;
    }

    if (!selectedBaseDxfPath) {
      adapter.clear();
      return;
    }

    if (input.fileErrorMessage) {
      adapter.clear();
      markError(input.projectId, selectedBaseDxfPath, input.fileErrorMessage);
      return;
    }

    if (!document) {
      return;
    }

    const loadSequence = loadSequenceRef.current + 1;
    loadSequenceRef.current = loadSequence;
    markLoading(input.projectId, selectedBaseDxfPath, document.modifiedAt);

    void adapter
      .load(document)
      .then((result) => {
        if (loadSequenceRef.current !== loadSequence) {
          return;
        }
        markReady(input.projectId, selectedBaseDxfPath, {
          bounds: result.bounds,
          view: result.view,
          homeView: result.homeView,
          warnings: result.warnings,
          modifiedAt: document.modifiedAt,
        });
      })
      .catch((error) => {
        if (loadSequenceRef.current !== loadSequence) {
          return;
        }
        markError(
          input.projectId,
          selectedBaseDxfPath,
          error instanceof Error ? error.message : "The DXF file could not be rendered.",
        );
      });
  }, [
    input.document,
    input.fileErrorMessage,
    input.projectId,
    input.selectedBaseDxfPath,
    markError,
    markLoading,
    markReady,
  ]);

  const actions = useMemo<DxfViewportActions>(
    () => ({
      fitToView: () => adapterRef.current?.fitToView(),
      resetView: () => adapterRef.current?.resetView(),
      zoomIn: () => adapterRef.current?.zoomIn(),
      zoomOut: () => adapterRef.current?.zoomOut(),
    }),
    [],
  );

  return { actions, containerRef };
}
