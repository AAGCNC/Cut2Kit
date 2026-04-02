import type { Cut2KitProject, ProjectId } from "@t3tools/contracts";
import { useEffect, useMemo } from "react";

import {
  buildProjectDxfOptions,
  findProjectDxfOption,
  type ProjectDxfOption,
} from "../lib/projectDxfFiles";
import {
  selectProjectDxfViewportState,
  useCut2KitDxfViewportStore,
} from "../state/dxfViewportStore";

export function useProjectDxfSelection(projectId: ProjectId, project: Cut2KitProject) {
  const options = useMemo(() => buildProjectDxfOptions(project), [project]);
  const availablePaths = useMemo(() => options.map((option) => option.relativePath), [options]);
  const availablePathsKey = useMemo(() => availablePaths.join("\u0000"), [availablePaths]);
  const syncProjectOptions = useCut2KitDxfViewportStore((state) => state.syncProjectOptions);
  const setSelectedBaseDxf = useCut2KitDxfViewportStore((state) => state.setSelectedBaseDxf);
  const viewportState = useCut2KitDxfViewportStore((state) =>
    selectProjectDxfViewportState(state, projectId),
  );

  useEffect(() => {
    syncProjectOptions(projectId, availablePaths);
  }, [availablePaths, availablePathsKey, projectId, syncProjectOptions]);

  const selectedOption = useMemo<ProjectDxfOption | null>(
    () => findProjectDxfOption(options, viewportState.selectedBaseDxfPath),
    [options, viewportState.selectedBaseDxfPath],
  );

  return {
    options,
    selectedBaseDxfPath: viewportState.selectedBaseDxfPath,
    selectedOption,
    viewportState,
    setSelectedBaseDxf: (relativePath: string | null) =>
      setSelectedBaseDxf(projectId, relativePath),
  };
}
