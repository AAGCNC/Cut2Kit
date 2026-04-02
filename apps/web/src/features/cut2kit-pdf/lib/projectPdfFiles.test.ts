import { describe, expect, it } from "vitest";

import {
  buildProjectPdfOptions,
  describeProjectPdfOption,
  resolveSelectedProjectPdf,
} from "./projectPdfFiles";

const project = {
  sourceDocuments: [
    {
      sourcePath: "elevations/front-wall.pdf",
      fileName: "front-wall.pdf",
      classification: "elevation",
      application: "siding",
      side: "front",
      assignmentSource: "settings",
    },
    {
      sourcePath: "floor/main-floor.pdf",
      fileName: "main-floor.pdf",
      classification: "floor",
      application: "flooring",
      side: null,
      assignmentSource: "settings",
    },
  ],
  files: [
    {
      relativePath: "elevations/front-wall.pdf",
      name: "front-wall.pdf",
      kind: "file",
      classification: "pdf",
      role: "source-pdf",
      depth: 1,
      sizeBytes: 42,
    },
    {
      relativePath: "roof/main-roof.pdf",
      name: "main-roof.pdf",
      kind: "file",
      classification: "pdf",
      role: "source-pdf",
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

describe("projectPdfFiles", () => {
  it("builds active-project PDF options from source documents plus fallback PDF files", () => {
    const options = buildProjectPdfOptions(project);

    expect(options.map((option) => option.relativePath)).toEqual([
      "elevations/front-wall.pdf",
      "floor/main-floor.pdf",
      "roof/main-roof.pdf",
    ]);
    expect(options[0]?.source).toBe("source-document");
    expect(options[2]?.source).toBe("project-file");
  });

  it("keeps an explicit PDF selection only when it is still available", () => {
    const options = buildProjectPdfOptions(project);

    expect(resolveSelectedProjectPdf(options, "roof/main-roof.pdf")).toBe("roof/main-roof.pdf");
    expect(resolveSelectedProjectPdf(options, "missing.pdf")).toBe("elevations/front-wall.pdf");
    expect(resolveSelectedProjectPdf([], "missing.pdf")).toBeNull();
  });

  it("describes PDF options with project-specific metadata", () => {
    const [front] = buildProjectPdfOptions(project);

    expect(describeProjectPdfOption(front!)).toContain("elevation");
    expect(describeProjectPdfOption(front!)).toContain("front");
    expect(describeProjectPdfOption(front!)).toContain("elevations/front-wall.pdf");
  });
});
