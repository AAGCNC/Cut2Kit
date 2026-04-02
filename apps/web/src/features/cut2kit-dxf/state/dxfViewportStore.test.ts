import { beforeEach, describe, expect, it } from "vitest";
import { ProjectId } from "@t3tools/contracts";

import { selectProjectDxfViewportState, useCut2KitDxfViewportStore } from "./dxfViewportStore";

const projectId = ProjectId.makeUnsafe("project-dxf");

describe("dxfViewportStore", () => {
  beforeEach(() => {
    useCut2KitDxfViewportStore.setState({ byProjectId: {} });
  });

  it("tracks an explicit base DXF selection per project", () => {
    useCut2KitDxfViewportStore
      .getState()
      .syncProjectOptions(projectId, ["elevations/front-wall.dxf", "roof/main-roof.dxf"]);

    expect(
      selectProjectDxfViewportState(useCut2KitDxfViewportStore.getState(), projectId)
        .selectedBaseDxfPath,
    ).toBe("elevations/front-wall.dxf");

    useCut2KitDxfViewportStore.getState().setSelectedBaseDxf(projectId, "roof/main-roof.dxf");

    expect(
      selectProjectDxfViewportState(useCut2KitDxfViewportStore.getState(), projectId)
        .selectedBaseDxfPath,
    ).toBe("roof/main-roof.dxf");
  });

  it("ignores stale load completion for a DXF that is no longer selected", () => {
    const store = useCut2KitDxfViewportStore.getState();
    store.syncProjectOptions(projectId, ["elevations/front-wall.dxf", "roof/main-roof.dxf"]);
    store.markLoading(projectId, "elevations/front-wall.dxf", "2026-04-02T00:00:00.000Z");
    store.setSelectedBaseDxf(projectId, "roof/main-roof.dxf");
    store.markReady(projectId, "elevations/front-wall.dxf", {
      bounds: { minX: 0, minY: 0, maxX: 10, maxY: 5 },
      view: { centerX: 5, centerY: 2.5, width: 12 },
      homeView: { centerX: 5, centerY: 2.5, width: 12 },
      warnings: [],
      modifiedAt: "2026-04-02T00:00:00.000Z",
    });

    const state = selectProjectDxfViewportState(useCut2KitDxfViewportStore.getState(), projectId);
    expect(state.selectedBaseDxfPath).toBe("roof/main-roof.dxf");
    expect(state.loadStatus).toBe("idle");
    expect(state.loadedPath).toBeNull();
  });
});
