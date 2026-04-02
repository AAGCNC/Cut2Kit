import { describe, expect, it } from "vitest";

import { getDxfViewportPresentation } from "./dxfViewportPresentation";

const baseViewportState = {
  selectedBaseDxfPath: null,
  loadStatus: "idle" as const,
  loadedPath: null,
  modifiedAt: null,
  bounds: null,
  view: null,
  homeView: null,
  warnings: [],
  errorMessage: null,
};

describe("getDxfViewportPresentation", () => {
  it("returns an empty state when the active project has no DXFs", () => {
    expect(
      getDxfViewportPresentation({
        dxfCount: 0,
        selectedBaseDxfPath: null,
        isFileLoading: false,
        fileErrorMessage: null,
        viewportState: baseViewportState,
      }),
    ).toEqual({
      kind: "empty",
      title: "No DXF files detected",
      description: "Add DXF files to the active project to render a base drawing here.",
    });
  });

  it("returns a loading state while the selected DXF is being prepared", () => {
    expect(
      getDxfViewportPresentation({
        dxfCount: 2,
        selectedBaseDxfPath: "elevations/front-wall.dxf",
        isFileLoading: true,
        fileErrorMessage: null,
        viewportState: baseViewportState,
      }),
    ).toEqual({
      kind: "loading",
      title: "Loading DXF",
      description: "Parsing elevations/front-wall.dxf for viewport rendering.",
    });
  });

  it("returns an error state when file loading fails", () => {
    expect(
      getDxfViewportPresentation({
        dxfCount: 2,
        selectedBaseDxfPath: "elevations/front-wall.dxf",
        isFileLoading: false,
        fileErrorMessage: "permission denied",
        viewportState: baseViewportState,
      }),
    ).toEqual({
      kind: "error",
      title: "Could not load DXF",
      description: "permission denied",
    });
  });

  it("returns ready once the viewport has a rendered document", () => {
    expect(
      getDxfViewportPresentation({
        dxfCount: 2,
        selectedBaseDxfPath: "elevations/front-wall.dxf",
        isFileLoading: false,
        fileErrorMessage: null,
        viewportState: {
          ...baseViewportState,
          selectedBaseDxfPath: "elevations/front-wall.dxf",
          loadStatus: "ready",
        },
      }),
    ).toEqual({ kind: "ready" });
  });
});
