import { describe, expect, it } from "vitest";

import {
  buildProjectDxfOptions,
  describeProjectDxfOption,
  resolveSelectedProjectDxf,
} from "./projectDxfFiles";

const project = {
  sourceDocuments: [
    {
      sourcePath: "elevations/front-wall.dxf",
      fileName: "front-wall.dxf",
      classification: "elevation",
      application: "siding",
      side: "front",
      assignmentSource: "settings",
    },
    {
      sourcePath: "floor/main-floor.dxf",
      fileName: "main-floor.dxf",
      classification: "floor",
      application: "flooring",
      side: null,
      assignmentSource: "settings",
    },
  ],
  files: [
    {
      relativePath: "elevations/front-wall.dxf",
      name: "front-wall.dxf",
      kind: "file",
      classification: "dxf",
      role: "source-dxf",
      depth: 1,
      sizeBytes: 42,
    },
    {
      relativePath: "roof/main-roof.dxf",
      name: "main-roof.dxf",
      kind: "file",
      classification: "dxf",
      role: "source-dxf",
      depth: 1,
      sizeBytes: 42,
    },
    {
      relativePath: "output/nc/front.nc",
      name: "front.nc",
      kind: "file",
      classification: "nc",
      role: "generated-nc",
      depth: 2,
      sizeBytes: 42,
    },
  ],
} satisfies Pick<import("@t3tools/contracts").Cut2KitProject, "files" | "sourceDocuments">;

describe("projectDxfFiles", () => {
  it("builds active-project DXF options from source documents plus fallback DXF files", () => {
    const options = buildProjectDxfOptions(project);

    expect(options.map((option) => option.relativePath)).toEqual([
      "elevations/front-wall.dxf",
      "floor/main-floor.dxf",
      "roof/main-roof.dxf",
    ]);
    expect(options[0]?.source).toBe("source-document");
    expect(options[2]?.source).toBe("project-file");
  });

  it("keeps an explicit DXF selection only when it is still available", () => {
    const options = buildProjectDxfOptions(project);

    expect(resolveSelectedProjectDxf(options, "roof/main-roof.dxf")).toBe("roof/main-roof.dxf");
    expect(resolveSelectedProjectDxf(options, "missing.dxf")).toBe("elevations/front-wall.dxf");
    expect(resolveSelectedProjectDxf([], "missing.dxf")).toBeNull();
  });

  it("describes DXF options with project-specific metadata", () => {
    const [front] = buildProjectDxfOptions(project);

    expect(describeProjectDxfOption(front!)).toContain("elevation");
    expect(describeProjectDxfOption(front!)).toContain("front");
    expect(describeProjectDxfOption(front!)).toContain("elevations/front-wall.dxf");
  });
});
