import { Maximize2Icon, RefreshCcwIcon, ZoomInIcon, ZoomOutIcon } from "lucide-react";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";

import type { DxfViewportActions } from "../hooks/useDxfViewport";
import type { ProjectDxfOption } from "../lib/projectDxfFiles";
import { BaseDxfSelector } from "./BaseDxfSelector";

export function DxfViewportToolbar(props: {
  options: ReadonlyArray<ProjectDxfOption>;
  selectedOption: ProjectDxfOption | null;
  selectedPath: string | null;
  canInteract: boolean;
  onChangeSelectedPath: (relativePath: string | null) => void;
  actions: DxfViewportActions;
}) {
  const { actions, canInteract, onChangeSelectedPath, options, selectedOption, selectedPath } =
    props;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <BaseDxfSelector
          options={options}
          selectedPath={selectedPath}
          onChange={onChangeSelectedPath}
        />
        {selectedOption?.classification ? (
          <Badge variant="secondary">{selectedOption.classification}</Badge>
        ) : null}
        {selectedOption?.application ? (
          <Badge variant="outline">{selectedOption.application}</Badge>
        ) : null}
        {selectedOption?.side ? <Badge variant="outline">{selectedOption.side}</Badge> : null}
      </div>
      <div className="flex items-center gap-1">
        <Button
          aria-label="Fit to view"
          disabled={!canInteract}
          onClick={() => actions.fitToView()}
          size="sm"
          type="button"
          variant="outline"
        >
          <Maximize2Icon className="size-4" />
          Fit
        </Button>
        <Button
          aria-label="Reset view"
          disabled={!canInteract}
          onClick={() => actions.resetView()}
          size="sm"
          type="button"
          variant="outline"
        >
          <RefreshCcwIcon className="size-4" />
          Reset
        </Button>
        <Button
          aria-label="Zoom in"
          disabled={!canInteract}
          onClick={() => actions.zoomIn()}
          size="sm"
          type="button"
          variant="outline"
        >
          <ZoomInIcon className="size-4" />
        </Button>
        <Button
          aria-label="Zoom out"
          disabled={!canInteract}
          onClick={() => actions.zoomOut()}
          size="sm"
          type="button"
          variant="outline"
        >
          <ZoomOutIcon className="size-4" />
        </Button>
      </div>
    </div>
  );
}
