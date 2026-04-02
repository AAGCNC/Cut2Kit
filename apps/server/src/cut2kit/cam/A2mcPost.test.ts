import { describe, expect, it } from "vitest";

import type { Cut2KitManufacturingJob, Cut2KitManufacturingPlan } from "@t3tools/contracts";

import { renderA2mcProgram } from "./A2mcPost.ts";

function makePlan(job: Cut2KitManufacturingJob): Cut2KitManufacturingPlan {
  return {
    schemaVersion: "0.1.0",
    targetController: "axyz-a2mc",
    units: "inch",
    defaultWorkOffset: "G54",
    safeZ: 0.5,
    parkPosition: {
      x: 0,
      y: 0,
      z: 0.5,
    },
    jobs: [job],
  };
}

function renderJob(job: Cut2KitManufacturingJob): string {
  return renderA2mcProgram({
    projectName: "Prefab Demo House 001",
    planSourcePath: "cut2kit.manufacturing.json",
    plan: makePlan(job),
    job,
  });
}

describe("renderA2mcProgram", () => {
  it("renders a controller-safe startup, contour, and shutdown block", () => {
    const program = renderJob({
      jobId: "front-wall-contour",
      sourcePath: "elevations/front-wall.pdf",
      operations: [
        { type: "tool_change", toolNumber: 1 },
        { type: "spindle_on", direction: "cw", rpm: 18000 },
        { type: "rapid_move", x: 1, y: 1 },
        { type: "linear_move", z: -0.25, feed: 150 },
        { type: "linear_move", x: 5, y: 1, feed: 250 },
        { type: "linear_move", x: 5, y: 3 },
        { type: "linear_move", x: 1, y: 3 },
        { type: "linear_move", x: 1, y: 1 },
        { type: "spindle_stop" },
      ],
    });

    expect(program).toContain("(CUT2KIT -> A2MC)");
    expect(program).toContain("G90");
    expect(program).toContain("G20");
    expect(program).toContain("G54");
    expect(program).toContain("M6 T1");
    expect(program).toContain("M3 S18000");
    expect(program).toContain("G0 Z0.500");
    expect(program).toContain("G0 X1.000 Y1.000");
    expect(program).toContain("G1 Z-0.250 F150.0");
    expect(program).toContain("G1 X5.000 Y1.000 F250.0");
    expect(program).toContain("M5");
    expect(program).toContain("G0 X0.000 Y0.000");
    expect(program.trimEnd().endsWith("M30")).toBe(true);
    expect(program).toBe(program.toUpperCase());
    expect(program).not.toContain("G53");
    expect(program).not.toContain("G92");
  });

  it("renders dwell with G4 before P", () => {
    const program = renderJob({
      jobId: "dwell-test",
      sourcePath: "elevations/front-wall.pdf",
      operations: [
        { type: "tool_change", toolNumber: 1 },
        { type: "spindle_on", direction: "cw", rpm: 18000 },
        { type: "dwell", seconds: 0.5 },
      ],
    });

    expect(program).toContain("G4 P0.5");
    expect(program).not.toContain("P0.5 G4");
  });

  it("renders M272 with the exact structured payload order", () => {
    const program = renderJob({
      jobId: "label-template-test",
      sourcePath: "elevations/front-wall.pdf",
      operations: [
        {
          type: "label_template",
          toolNumber: 50,
          x: 12.7,
          y: 25.4,
          template: "basic",
          panelName: "panel_a",
          panelNumber: "1",
          barcode: "bc123",
          header1: "lot",
          data1: "42",
          header2: "job",
          data2: "cut2kit",
          header3: "rev",
          data3: "a",
        },
      ],
    });

    expect(program).toContain("M6 T50");
    expect(program).toContain("M272(12.700;25.400;BASIC;PANEL_A;1;BC123;LOT;42;JOB;CUT2KIT;REV;A)");
  });

  it("renders M273 as an image-label command and normalizes the file name", () => {
    const program = renderJob({
      jobId: "label-image-test",
      sourcePath: "elevations/front-wall.pdf",
      operations: [
        {
          type: "label_image",
          toolNumber: 50,
          x: 12.7,
          y: 25.4,
          imageName: "panel_a_label",
        },
      ],
    });

    expect(program).toContain("M6 T50");
    expect(program).toContain("M273(12.700;25.400;PANEL_A_LABEL.BMP)");
  });

  it("rejects arcs over 180 degrees", () => {
    expect(() =>
      renderJob({
        jobId: "oversize-arc",
        sourcePath: "elevations/front-wall.pdf",
        operations: [
          { type: "tool_change", toolNumber: 1 },
          { type: "spindle_on", direction: "cw", rpm: 18000 },
          { type: "rapid_move", x: 1, y: 0 },
          { type: "linear_move", z: -0.25, feed: 100 },
          {
            type: "arc_move",
            direction: "cw",
            x: 0,
            y: 1,
            i: -1,
            j: 0,
            feed: 100,
          },
        ],
      }),
    ).toThrow(/180 degrees/);
  });

  it("rejects malformed label payload fields", () => {
    expect(() =>
      renderJob({
        jobId: "bad-label",
        sourcePath: "elevations/front-wall.pdf",
        operations: [
          {
            type: "label_template",
            toolNumber: 50,
            x: 12.7,
            y: 25.4,
            template: "BASIC",
            panelName: "PANEL;A",
            panelNumber: "1",
            barcode: "BC123",
            header1: "LOT",
            data1: "42",
            header2: "JOB",
            data2: "CUT2KIT",
            header3: "REV",
            data3: "A",
          },
        ],
      }),
    ).toThrow(/payload parsing/);
  });
});
