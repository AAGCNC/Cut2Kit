import type { Cut2KitProject, ProjectId } from "@t3tools/contracts";
import { AlertTriangleIcon } from "lucide-react";
import { useMemo } from "react";

import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";

import { useDxfDocument } from "../hooks/useDxfDocument";
import { useDxfViewport } from "../hooks/useDxfViewport";
import { useProjectDxfSelection } from "../hooks/useProjectDxfSelection";
import { fallbackProjectDxfFileName } from "../lib/projectDxfFiles";
import { getDxfViewportPresentation } from "../lib/dxfViewportPresentation";
import type { DxfViewportBounds } from "../state/dxfViewportStore";
import { DxfViewport } from "./DxfViewport";
import { DxfViewportState } from "./DxfViewportState";
import { DxfViewportToolbar } from "./DxfViewportToolbar";

function formatBounds(bounds: DxfViewportBounds) {
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  return `${width.toFixed(3)} × ${height.toFixed(3)}`;
}

export function ProjectDxfWorkspace({
  project,
  projectId,
}: {
  project: Cut2KitProject;
  projectId: ProjectId;
}) {
  const { options, selectedBaseDxfPath, selectedOption, setSelectedBaseDxf, viewportState } =
    useProjectDxfSelection(projectId, project);

  const documentQuery = useDxfDocument({
    cwd: project.cwd,
    relativePath: selectedBaseDxfPath,
  });

  const fileErrorMessage = documentQuery.isError
    ? documentQuery.error instanceof Error
      ? documentQuery.error.message
      : "The selected DXF could not be read from the active project."
    : null;

  const { actions, containerRef } = useDxfViewport({
    projectId,
    selectedBaseDxfPath,
    document: documentQuery.data ?? null,
    fileErrorMessage,
  });

  const presentation = getDxfViewportPresentation({
    dxfCount: options.length,
    selectedBaseDxfPath,
    isFileLoading: documentQuery.isLoading || documentQuery.isFetching,
    fileErrorMessage,
    viewportState,
  });

  const subtitle = useMemo(() => {
    if (selectedOption) {
      return selectedOption.relativePath;
    }
    return selectedBaseDxfPath ?? "Choose a project DXF to render";
  }, [selectedBaseDxfPath, selectedOption]);

  const canInteract = presentation.kind === "ready";

  return (
    <Card className="flex min-h-0 flex-1 overflow-hidden">
      <CardHeader className="border-b border-border/70">
        <CardTitle>Base DXF Viewer</CardTitle>
        <CardDescription>
          Select a project DXF, render it in a 2D orthographic viewport, and keep this surface ready
          for future framing and panel overlays.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col p-0">
        <DxfViewportToolbar
          actions={actions}
          canInteract={canInteract}
          onChangeSelectedPath={setSelectedBaseDxf}
          options={options}
          selectedOption={selectedOption}
          selectedPath={selectedBaseDxfPath}
        />
        <div className="relative min-h-0 flex-1">
          <DxfViewport containerRef={containerRef} />
          <DxfViewportState presentation={presentation} />
          {presentation.kind === "ready" && viewportState.warnings.length > 0 ? (
            <div className="absolute right-3 top-3 z-10 max-w-sm rounded-xl border border-amber-500/25 bg-background/92 px-3 py-2 shadow-lg">
              <div className="flex items-start gap-2">
                <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-amber-500" />
                <div>
                  <p className="font-medium text-sm text-foreground">Rendered with warnings</p>
                  <p className="mt-1 text-muted-foreground text-xs leading-5">
                    {viewportState.warnings[0]}
                  </p>
                  {viewportState.warnings.length > 1 ? (
                    <p className="mt-1 text-muted-foreground text-xs">
                      +{viewportState.warnings.length - 1} more viewer messages
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 px-4 py-3 text-muted-foreground text-xs">
          <div className="min-w-0 truncate">{subtitle}</div>
          <div className="flex flex-wrap items-center gap-2">
            {viewportState.bounds ? (
              <Badge variant="outline">Extents {formatBounds(viewportState.bounds)}</Badge>
            ) : null}
            {viewportState.modifiedAt ? (
              <Badge variant="outline">
                Updated {new Date(viewportState.modifiedAt).toLocaleString()}
              </Badge>
            ) : null}
            {selectedBaseDxfPath && !selectedOption ? (
              <Badge variant="outline">{fallbackProjectDxfFileName(selectedBaseDxfPath)}</Badge>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
