import fsPromises from "node:fs/promises";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { Cut2KitProject as Cut2KitProjectSchema } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import { Effect, FileSystem, Layer, Path, Schema } from "effect";
import { afterEach, vi } from "vitest";

const { runCut2KitCodexJsonMock } = vi.hoisted(() => ({
  runCut2KitCodexJsonMock: vi.fn(),
}));

vi.mock("../ai/codexStructuredGeneration.ts", () => ({
  runCut2KitCodexJson: runCut2KitCodexJsonMock,
}));

afterEach(() => {
  runCut2KitCodexJsonMock.mockReset();
});

import { ServerConfig } from "../../config.ts";
import { WorkspaceEntriesLive } from "../../workspace/Layers/WorkspaceEntries.ts";
import { WorkspacePathsLive } from "../../workspace/Layers/WorkspacePaths.ts";
import { Cut2KitProjects } from "../Services/Cut2KitProjects.ts";
import { Cut2KitProjectsLive } from "./Cut2KitProjects.ts";

const TestLayer = Layer.empty.pipe(
  Layer.provideMerge(
    Cut2KitProjectsLive.pipe(
      Layer.provide(WorkspacePathsLive),
      Layer.provide(WorkspaceEntriesLive.pipe(Layer.provide(WorkspacePathsLive))),
    ),
  ),
  Layer.provideMerge(WorkspaceEntriesLive.pipe(Layer.provide(WorkspacePathsLive))),
  Layer.provideMerge(WorkspacePathsLive),
  Layer.provide(
    ServerConfig.layerTest(process.cwd(), {
      prefix: "cut2kit-projects-test-",
    }),
  ),
  Layer.provideMerge(NodeServices.layer),
);

const sampleProjectPath = new URL("../../../../../examples/prefab-demo-project", import.meta.url);
const exampleSettingsPath = new URL(
  "../../../../../docs/cut2kit.settings.example.json",
  import.meta.url,
);
const exampleElevationPath = new URL("../../../../../examples/elevation3.pdf", import.meta.url);

class FixtureCopyError extends Schema.TaggedErrorClass<FixtureCopyError>()("FixtureCopyError", {
  message: Schema.String,
}) {}

const makeTempDir = Effect.fn(function* (prefix = "cut2kit-project-") {
  const fileSystem = yield* FileSystem.FileSystem;
  return yield* fileSystem.makeTempDirectoryScoped({ prefix });
});

const copyFixtureProject = (destination: string) =>
  Effect.tryPromise({
    try: () => fsPromises.cp(sampleProjectPath, destination, { recursive: true }),
    catch: (error) =>
      new FixtureCopyError({
        message: `Failed to copy Cut2Kit fixture project: ${
          error instanceof Error ? error.message : String(error)
        }`,
      }),
  });

const copyExampleSettings = (destination: string) =>
  Effect.tryPromise({
    try: () => fsPromises.copyFile(exampleSettingsPath, `${destination}/cut2kit.settings.json`),
    catch: (error) =>
      new FixtureCopyError({
        message: `Failed to copy Cut2Kit example settings: ${
          error instanceof Error ? error.message : String(error)
        }`,
      }),
  });

const copyExampleElevation = (destination: string) =>
  Effect.tryPromise({
    try: async () => {
      await fsPromises.mkdir(`${destination}/examples`, { recursive: true });
      await fsPromises.copyFile(exampleElevationPath, `${destination}/examples/elevation3.pdf`);
    },
    catch: (error) =>
      new FixtureCopyError({
        message: `Failed to copy Cut2Kit example elevation: ${
          error instanceof Error ? error.message : String(error)
        }`,
      }),
  });

function makeGeometryDraft() {
  return {
    schemaVersion: "0.2.0" as const,
    sourcePdfPath: "examples/elevation3.pdf",
    settingsFilePath: "cut2kit.settings.json",
    units: "inch" as const,
    wall: {
      width: 360,
      height: 96,
      pageLeft: 0,
      pageRight: 360,
      pageTop: 96,
      pageBottom: 0,
    },
    commonHeights: {
      head: 82,
      windowSill: 46,
    },
    dimensionText: {
      horizontalMarks: [36, 60, 84, 120, 156, 204, 240, 288, 336, 360],
      verticalMarks: [0, 46, 82, 96],
      pairingStrategy: "consecutive_pairs" as const,
      openingTypeInference: "sill_line_detection" as const,
    },
    openings: [
      {
        id: "window-1",
        kind: "window" as const,
        left: 36,
        right: 60,
        bottom: 46,
        top: 82,
        width: 24,
        height: 36,
        clearOpening: true,
      },
      {
        id: "door-1",
        kind: "door" as const,
        left: 84,
        right: 120,
        bottom: 0,
        top: 82,
        width: 36,
        height: 82,
        clearOpening: true,
      },
      {
        id: "window-2",
        kind: "window" as const,
        left: 156,
        right: 204,
        bottom: 46,
        top: 82,
        width: 48,
        height: 36,
        clearOpening: true,
      },
      {
        id: "window-3",
        kind: "window" as const,
        left: 240,
        right: 288,
        bottom: 46,
        top: 82,
        width: 48,
        height: 36,
        clearOpening: true,
      },
      {
        id: "window-4",
        kind: "window" as const,
        left: 336,
        right: 360,
        bottom: 46,
        top: 82,
        width: 24,
        height: 36,
        clearOpening: true,
      },
    ],
    validation: {
      dimensionTextFound: true,
      wallDimensionsResolved: true,
      openingDimensionsResolved: true,
      wallBoundsFit: true,
      openingPairsResolved: true,
      openingTypesResolved: true,
      headHeightResolved: true,
      sillHeightResolved: true,
      conflictsDetected: false,
      ambiguityDetected: false,
      requiresUserConfirmation: false,
      notes: [],
    },
    notes: [],
  };
}

function makeFramingDraft(geometry = makeGeometryDraft()) {
  return {
    schemaVersion: "0.2.0" as const,
    sourcePdfPath: "examples/elevation3.pdf",
    settingsFilePath: "cut2kit.settings.json",
    units: "inch" as const,
    geometry,
    wall: {
      width: 360,
      height: 96,
      memberThickness: 1.5,
      studNominalSize: "2x6",
      material: "SPF",
      topMemberOrientation: "flat" as const,
      bottomMemberOrientation: "flat" as const,
    },
    studLayout: {
      originEdge: "left" as const,
      spacing: 16,
      commonStudCenterlines: [16, 64, 208],
    },
    openings: geometry.openings,
    members: [
      { id: "bottom-plate", kind: "bottom-plate" as const, x: 0, y: 0, width: 360, height: 1.5 },
      { id: "top-plate", kind: "top-plate" as const, x: 0, y: 94.5, width: 360, height: 1.5 },
      { id: "end-left-1", kind: "end-stud" as const, x: 0, y: 1.5, width: 1.5, height: 93 },
      { id: "end-left-2", kind: "end-stud" as const, x: 1.5, y: 1.5, width: 1.5, height: 93 },
      { id: "end-right-1", kind: "end-stud" as const, x: 357, y: 1.5, width: 1.5, height: 93 },
      { id: "end-right-2", kind: "end-stud" as const, x: 358.5, y: 1.5, width: 1.5, height: 93 },
      {
        id: "stud-16",
        kind: "common-stud" as const,
        x: 15.25,
        y: 1.5,
        width: 1.5,
        height: 93,
        centerlineX: 16,
      },
      {
        id: "stud-64",
        kind: "common-stud" as const,
        x: 63.25,
        y: 1.5,
        width: 1.5,
        height: 93,
        centerlineX: 64,
      },
      {
        id: "stud-208",
        kind: "common-stud" as const,
        x: 207.25,
        y: 1.5,
        width: 1.5,
        height: 93,
        centerlineX: 208,
      },
      {
        id: "w1-jamb-l",
        kind: "jamb-stud" as const,
        x: 34.5,
        y: 1.5,
        width: 1.5,
        height: 93,
        sourceOpeningId: "window-1",
      },
      {
        id: "w1-jamb-r",
        kind: "jamb-stud" as const,
        x: 60,
        y: 1.5,
        width: 1.5,
        height: 93,
        sourceOpeningId: "window-1",
      },
      {
        id: "door-jamb-l",
        kind: "jamb-stud" as const,
        x: 82.5,
        y: 1.5,
        width: 1.5,
        height: 93,
        sourceOpeningId: "door-1",
      },
      {
        id: "door-jamb-r",
        kind: "jamb-stud" as const,
        x: 120,
        y: 1.5,
        width: 1.5,
        height: 93,
        sourceOpeningId: "door-1",
      },
      {
        id: "w2-jamb-l",
        kind: "jamb-stud" as const,
        x: 154.5,
        y: 1.5,
        width: 1.5,
        height: 93,
        sourceOpeningId: "window-2",
      },
      {
        id: "w2-jamb-r",
        kind: "jamb-stud" as const,
        x: 204,
        y: 1.5,
        width: 1.5,
        height: 93,
        sourceOpeningId: "window-2",
      },
      {
        id: "w3-jamb-l",
        kind: "jamb-stud" as const,
        x: 238.5,
        y: 1.5,
        width: 1.5,
        height: 93,
        sourceOpeningId: "window-3",
      },
      {
        id: "w3-jamb-r",
        kind: "jamb-stud" as const,
        x: 288,
        y: 1.5,
        width: 1.5,
        height: 93,
        sourceOpeningId: "window-3",
      },
      {
        id: "w4-jamb-l",
        kind: "jamb-stud" as const,
        x: 334.5,
        y: 1.5,
        width: 1.5,
        height: 93,
        sourceOpeningId: "window-4",
      },
      {
        id: "w4-jamb-r",
        kind: "jamb-stud" as const,
        x: 360,
        y: 1.5,
        width: 1.5,
        height: 93,
        sourceOpeningId: "window-4",
      },
    ],
    memberSchedule: [],
    validation: {
      wallWidthMatchesElevation: true,
      wallHeightMatchesElevation: true,
      openingSizesMatchElevation: true,
      headHeightMatchesElevation: true,
      sillHeightMatchesElevation: true,
      endStudsDoubled: true,
      jambStudsPresent: true,
      commonStudSpacingApplied: true,
      noCommonStudThroughVoid: true,
      plateOrientationMatchesExpectation: true,
      notes: [],
    },
    notes: [],
  };
}

function makeThreadStyleFramingDraft(geometry = makeGeometryDraft()) {
  const geometryWithPromptStyleMarks = {
    ...geometry,
    dimensionText: {
      ...geometry.dimensionText,
      horizontalMarks: geometry.dimensionText.horizontalMarks.map((value, index) => ({
        label: `${value}"`,
        value,
        axis: "x" as const,
        reference: "left_edge" as const,
        role:
          index === geometry.dimensionText.horizontalMarks.length - 1
            ? ("wall-right" as const)
            : ("opening-mark" as const),
      })),
      verticalMarks: geometry.dimensionText.verticalMarks.map((value, index) => ({
        label: `${value}"`,
        value,
        axis: "y" as const,
        reference: "bottom_edge" as const,
        role:
          index === geometry.dimensionText.verticalMarks.length - 1
            ? ("wall-height" as const)
            : ("height-mark" as const),
      })),
    },
    openings: geometry.openings.map((opening) => ({
      id: opening.id,
      type: opening.kind,
      x: opening.left,
      y: opening.bottom,
      width: opening.width,
      height: opening.height,
      headHeight: opening.top,
      sillHeight: opening.bottom,
    })),
  };

  return {
    schemaVersion: "0.2.0" as const,
    sourcePdfPath: geometry.sourcePdfPath,
    settingsFilePath: geometry.settingsFilePath,
    units: "inch" as const,
    geometry: geometryWithPromptStyleMarks,
    wall: {
      width: geometry.wall.width,
      height: geometry.wall.height,
      memberThickness: 1.5,
      studNominalSize: "2x6",
      material: "SPF",
      topMemberOrientation: "flat" as const,
      bottomMemberOrientation: "flat" as const,
    },
    studLayout: {
      originEdge: "left" as const,
      spacing: 16,
      commonStudCenterlines: [16, 48, 64, 96, 112, 160, 176, 192, 208, 240, 256, 304, 320],
    },
    openings: geometry.openings.map((opening) => ({
      id: opening.id,
      type: opening.kind,
      x: opening.left,
      y: opening.bottom,
      width: opening.width,
      height: opening.height,
      headHeight: opening.top,
      sillHeight: opening.bottom,
      headMemberId: `${opening.id}-head`,
      sillMemberId: opening.kind === "window" ? `${opening.id}-sill` : null,
      gridStudCenterlinesInside: [opening.left + opening.width / 2],
    })),
    members: [
      {
        id: "bottom-plate",
        kind: "bottom-plate",
        x: 0,
        y: 0,
        width: geometry.wall.width,
        height: 1.5,
      },
      {
        id: "top-plate",
        kind: "top-plate",
        x: 0,
        y: geometry.wall.height - 1.5,
        width: geometry.wall.width,
        height: 1.5,
      },
      {
        id: "end-left-1",
        kind: "end-stud",
        x: 0,
        y: 1.5,
        width: 1.5,
        height: geometry.wall.height - 3,
      },
      {
        id: "end-left-2",
        kind: "end-stud",
        x: 1.5,
        y: 1.5,
        width: 1.5,
        height: geometry.wall.height - 3,
      },
      {
        id: "end-right-1",
        kind: "end-stud",
        x: geometry.wall.width - 3,
        y: 1.5,
        width: 1.5,
        height: geometry.wall.height - 3,
      },
      {
        id: "end-right-2",
        kind: "end-stud",
        x: geometry.wall.width - 1.5,
        y: 1.5,
        width: 1.5,
        height: geometry.wall.height - 3,
      },
      {
        id: "stud-cl-16",
        kind: "common-stud",
        x: 15.25,
        y: 1.5,
        width: 1.5,
        height: geometry.wall.height - 3,
        centerline: 16,
      },
      {
        id: "stud-cl-64",
        kind: "common-stud",
        x: 63.25,
        y: 1.5,
        width: 1.5,
        height: geometry.wall.height - 3,
        centerline: 64,
      },
      {
        id: "window-1-jamb-left",
        kind: "jamb-stud",
        x: 34.5,
        y: 1.5,
        width: 1.5,
        height: geometry.wall.height - 3,
        openingId: "window-1",
      },
      {
        id: "window-1-jamb-right",
        kind: "jamb-stud",
        x: 60,
        y: 1.5,
        width: 1.5,
        height: geometry.wall.height - 3,
        openingId: "window-1",
      },
      {
        id: "window-1-head",
        kind: "head-member",
        x: 34.5,
        y: 80.5,
        width: 27,
        height: 1.5,
        openingId: "window-1",
      },
      {
        id: "window-1-sill",
        kind: "sill-member",
        x: 34.5,
        y: 46,
        width: 27,
        height: 1.5,
        openingId: "window-1",
      },
      {
        id: "window-1-cripple-above",
        kind: "cripple-stud-above-head",
        x: 47.25,
        y: 82,
        width: 1.5,
        height: 12.5,
        centerline: 48,
        openingId: "window-1",
      },
      {
        id: "window-1-cripple-below",
        kind: "cripple-stud-below-sill",
        x: 47.25,
        y: 1.5,
        width: 1.5,
        height: 44.5,
        centerline: 48,
        openingId: "window-1",
      },
    ],
    memberSchedule: [
      {
        id: "bottom-plate-360",
        label: "Bottom plate",
        memberKind: "bottom-plate",
        count: 1,
        length: geometry.wall.width,
      },
      {
        id: "end-stud-93",
        label: "End stud",
        memberKind: "end-stud",
        count: 4,
        length: geometry.wall.height - 3,
      },
      { id: "header-27", label: "Header", memberKind: "head-member", count: 1, length: 27 },
      { id: "sill-27", label: "Sill", memberKind: "sill-member", count: 1, length: 27 },
      {
        id: "cripple-12-5",
        label: "Cripple stud",
        memberKind: "cripple-stud-above-head",
        count: 1,
        length: 12.5,
      },
    ],
    validation: {
      wallWidthMatchesElevation: true,
      wallHeightMatchesElevation: true,
      openingSizesMatchElevation: true,
      headHeightMatchesElevation: true,
      sillHeightMatchesElevation: true,
      endStudsDoubled: true,
      jambStudsPresent: true,
      commonStudSpacingApplied: true,
      noCommonStudThroughVoid: true,
      plateOrientationMatchesExpectation: true,
      notes: [
        "Thread-style framing JSON uses x/y openings, centerline studs, and aliased member kinds.",
      ],
    },
    notes: [
      "This draft emulates the richer framing JSON shape written by the framing-thread prompt path.",
    ],
  };
}

function makeSheathingDraft(geometry = makeGeometryDraft()) {
  return {
    schemaVersion: "0.2.0" as const,
    sourcePdfPath: "examples/elevation3.pdf",
    settingsFilePath: "cut2kit.settings.json",
    units: "inch" as const,
    geometry,
    wall: {
      width: 360,
      height: 96,
      materialLabel: "7/16 in OSB",
      panelThickness: 0.4375,
      sheetNominalWidth: 48,
      sheetNominalHeight: 96,
      installedOrientation: "vertical" as const,
      runDirection: "left_to_right" as const,
    },
    sheets: [
      {
        id: "sheet-1",
        index: 1,
        left: 0,
        right: 48,
        bottom: 0,
        top: 96,
        width: 48,
        height: 96,
        isTerminalRip: false,
        cutouts: [
          {
            id: "cutout-w1-left",
            sourceOpeningId: "window-1",
            left: 36,
            right: 48,
            bottom: 46,
            top: 82,
            width: 12,
            height: 36,
          },
        ],
        notes: [],
      },
      {
        id: "sheet-2",
        index: 2,
        left: 48,
        right: 96,
        bottom: 0,
        top: 96,
        width: 48,
        height: 96,
        isTerminalRip: false,
        cutouts: [
          {
            id: "cutout-w1-right",
            sourceOpeningId: "window-1",
            left: 48,
            right: 60,
            bottom: 46,
            top: 82,
            width: 12,
            height: 36,
          },
          {
            id: "cutout-door-left",
            sourceOpeningId: "door-1",
            left: 84,
            right: 96,
            bottom: 0,
            top: 82,
            width: 12,
            height: 82,
          },
        ],
        notes: [],
      },
      {
        id: "sheet-3",
        index: 3,
        left: 96,
        right: 144,
        bottom: 0,
        top: 96,
        width: 48,
        height: 96,
        isTerminalRip: false,
        cutouts: [
          {
            id: "cutout-door-right",
            sourceOpeningId: "door-1",
            left: 96,
            right: 120,
            bottom: 0,
            top: 82,
            width: 24,
            height: 82,
          },
        ],
        notes: [],
      },
      {
        id: "sheet-4",
        index: 4,
        left: 144,
        right: 192,
        bottom: 0,
        top: 96,
        width: 48,
        height: 96,
        isTerminalRip: false,
        cutouts: [
          {
            id: "cutout-w2-left",
            sourceOpeningId: "window-2",
            left: 156,
            right: 192,
            bottom: 46,
            top: 82,
            width: 36,
            height: 36,
          },
        ],
        notes: [],
      },
      {
        id: "sheet-5",
        index: 5,
        left: 192,
        right: 240,
        bottom: 0,
        top: 96,
        width: 48,
        height: 96,
        isTerminalRip: false,
        cutouts: [
          {
            id: "cutout-w2-right",
            sourceOpeningId: "window-2",
            left: 192,
            right: 204,
            bottom: 46,
            top: 82,
            width: 12,
            height: 36,
          },
        ],
        notes: [],
      },
      {
        id: "sheet-6",
        index: 6,
        left: 240,
        right: 288,
        bottom: 0,
        top: 96,
        width: 48,
        height: 96,
        isTerminalRip: false,
        cutouts: [
          {
            id: "cutout-w3",
            sourceOpeningId: "window-3",
            left: 240,
            right: 288,
            bottom: 46,
            top: 82,
            width: 48,
            height: 36,
          },
        ],
        notes: [],
      },
      {
        id: "sheet-7",
        index: 7,
        left: 288,
        right: 336,
        bottom: 0,
        top: 96,
        width: 48,
        height: 96,
        isTerminalRip: false,
        cutouts: [],
        notes: [],
      },
      {
        id: "sheet-8",
        index: 8,
        left: 336,
        right: 360,
        bottom: 0,
        top: 96,
        width: 24,
        height: 96,
        isTerminalRip: true,
        cutouts: [
          {
            id: "cutout-w4",
            sourceOpeningId: "window-4",
            left: 336,
            right: 360,
            bottom: 46,
            top: 82,
            width: 24,
            height: 36,
          },
        ],
        notes: [],
      },
    ],
    summary: {
      sheetCount: 8,
      fullSheetCount: 7,
      terminalRipWidth: 24,
    },
    fastening: {
      supportedEdgeSpacing: 6,
      fieldSpacing: 12,
      edgeDistance: 0.375,
      typicalReferenceOnly: true,
      noteLines: [
        "Use the stud framing layout for support lines.",
        "Keep panel edges over framing members or provide blocking where required.",
      ],
      disclaimerText:
        "Confirm final fastening schedule and edge support requirements with code, engineering, and manufacturer instructions.",
    },
    validation: {
      openingCoverageRemoved: true,
      sheetCountMatchesLayout: true,
      terminalRipComputed: true,
      cutoutsWithinSheets: true,
      firstPageFitsMargins: true,
      notes: [],
    },
    notes: [],
  };
}

function makeCompatibleSheathingDraft(geometry = makeGeometryDraft()) {
  const strictDraft = makeSheathingDraft(geometry);
  const draftWithoutFastening = { ...strictDraft };
  delete (draftWithoutFastening as { fastening?: unknown }).fastening;
  const sheets = [];

  for (const sheet of strictDraft.sheets) {
    const cutouts = [];
    for (const cutout of sheet.cutouts) {
      cutouts.push({
        id: cutout.id,
        openingId: cutout.sourceOpeningId,
        left: cutout.left,
        right: cutout.right,
        bottom: cutout.bottom,
        top: cutout.top,
        width: cutout.width,
        height: cutout.height,
      });
    }

    sheets.push({
      ...sheet,
      cutouts,
    });
  }

  return {
    ...draftWithoutFastening,
    sheets,
  };
}

it.layer(TestLayer)("Cut2KitProjectsLive", (it) => {
  describe("inspectProject", () => {
    it.effect("loads a valid Cut2Kit sample project and derives manifests", () =>
      Effect.gen(function* () {
        const cut2kitProjects = yield* Cut2KitProjects;
        const projectDir = yield* makeTempDir();
        yield* copyFixtureProject(projectDir);

        const project = yield* cut2kitProjects.inspectProject({ cwd: projectDir });

        expect(project.status).toBe("ready");
        expect(project.settingsFilePath).toBe("cut2kit.settings.json");
        expect(project.manufacturingPlanFilePath).toBe("cut2kit.manufacturing.json");
        expect(project.manufacturingPlan?.targetController).toBe("axyz-a2mc");
        expect(project.summary.pdfCount).toBe(1);
        expect(project.panelManifest.panels).toHaveLength(1);
        expect(project.nestManifest.nests.length).toBeGreaterThan(0);
        expect(project.queueManifest.entries).toHaveLength(1);
        expect(project.ncJobs).toHaveLength(1);
        expect(project.ncJobs[0]?.program.endsWith("\n")).toBe(true);
        expect(() => Schema.decodeUnknownSync(Cut2KitProjectSchema)(project)).not.toThrow();
        expect(project.outputStatus.generated).toBe(false);
        expect(
          project.files.some(
            (file) =>
              file.relativePath ===
                "output/reports/framing-layouts/elevations-front-wall.framing-layout.pdf" &&
              file.role === "generated-report",
          ),
        ).toBe(true);
      }),
    );

    it.effect("reports invalid settings as blocking errors", () =>
      Effect.gen(function* () {
        const cut2kitProjects = yield* Cut2KitProjects;
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const projectDir = yield* makeTempDir("cut2kit-invalid-project-");

        yield* fileSystem.writeFileString(path.join(projectDir, "cut2kit.settings.json"), "{");
        yield* fileSystem.makeDirectory(path.join(projectDir, "elevations"), { recursive: true });
        yield* fileSystem.writeFileString(
          path.join(projectDir, "elevations", "front.pdf"),
          "%PDF-1.7\n",
        );

        const project = yield* cut2kitProjects.inspectProject({ cwd: projectDir });

        expect(project.status).toBe("error");
        expect(project.issues.some((issue) => issue.code === "settings.invalid")).toBe(true);
      }),
    );

    it.effect("classifies a root-level elevation PDF as an elevation source document", () =>
      Effect.gen(function* () {
        const cut2kitProjects = yield* Cut2KitProjects;
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const projectDir = yield* makeTempDir("cut2kit-root-elevation-project-");

        yield* fileSystem.writeFileString(path.join(projectDir, "elevation2.pdf"), "%PDF-1.7\n");

        const project = yield* cut2kitProjects.inspectProject({ cwd: projectDir });

        expect(project.summary.pdfCount).toBe(1);
        expect(project.sourceDocuments).toHaveLength(1);
        expect(project.sourceDocuments[0]?.sourcePath).toBe("elevation2.pdf");
        expect(project.sourceDocuments[0]?.classification).toBe("elevation");
        expect(project.issues.some((issue) => issue.code === "pdf.unclassified")).toBe(false);
      }),
    );

    it.effect("loads the canonical 0.3.0 wall-workflow settings into the project snapshot", () =>
      Effect.gen(function* () {
        const cut2kitProjects = yield* Cut2KitProjects;
        const projectDir = yield* makeTempDir("cut2kit-ai-settings-project-");
        yield* copyExampleSettings(projectDir);
        yield* copyExampleElevation(projectDir);

        const project = yield* cut2kitProjects.inspectProject({ cwd: projectDir });

        expect(project.settings?.schemaVersion).toBe("0.3.0");
        expect(project.settings?.ai.model).toBe("gpt-5.4");
        expect(project.settings?.ai.reasoningEffort).toBe("xhigh");
        expect(project.settings?.input.elevationIntake.explicitDimensionsAreAuthoritative).toBe(
          true,
        );
        expect(project.settings?.framing.crippleStuds.splitGridStudsInsideOpenings).toBe(true);
        expect(project.resolvedPromptTemplates?.geometrySystem.source).toBe("repo_default");
        expect(project.resolvedPromptTemplates?.geometrySystem.contents.length).toBeGreaterThan(0);
      }),
    );

    it.effect("prefers a project-local prompt markdown override when one exists", () =>
      Effect.gen(function* () {
        const cut2kitProjects = yield* Cut2KitProjects;
        const projectDir = yield* makeTempDir("cut2kit-ai-prompt-override-project-");
        yield* copyExampleSettings(projectDir);
        yield* copyExampleElevation(projectDir);

        yield* Effect.tryPromise({
          try: async () => {
            await fsPromises.mkdir(`${projectDir}/.docs`, { recursive: true });
            await fsPromises.writeFile(
              `${projectDir}/.docs/system-geometry.md`,
              "You are the overridden geometry agent for this project.\n",
              "utf8",
            );
          },
          catch: (error) =>
            new FixtureCopyError({
              message: `Failed to seed project-local prompt override: ${
                error instanceof Error ? error.message : String(error)
              }`,
            }),
        });

        const project = yield* cut2kitProjects.inspectProject({ cwd: projectDir });

        expect(project.resolvedPromptTemplates?.geometrySystem.source).toBe("workspace");
        expect(project.resolvedPromptTemplates?.geometrySystem.contents).toContain(
          "overridden geometry agent",
        );
      }),
    );
  });

  describe("generateOutputs", () => {
    it.effect("writes A2MC manifests and NC files for the sample project", () =>
      Effect.gen(function* () {
        const cut2kitProjects = yield* Cut2KitProjects;
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const projectDir = yield* makeTempDir("cut2kit-generate-project-");
        yield* copyFixtureProject(projectDir);

        const result = yield* cut2kitProjects.generateOutputs({ cwd: projectDir });

        expect(result.writtenPaths).toContain("output/manifests/panel-manifest.json");
        expect(result.writtenPaths).toContain("output/manifests/nest-manifest.json");
        expect(result.writtenPaths).toContain("output/manifests/queue-manifest.json");
        expect(result.project.outputStatus.generated).toBe(true);

        const queueManifest = yield* fileSystem.readFileString(
          path.join(projectDir, "output/manifests/queue-manifest.json"),
        );
        const ncFile = yield* fileSystem.readFileString(
          path.join(projectDir, result.project.ncJobs[0]!.relativeOutputPath),
        );

        expect(queueManifest).toContain('"primaryMode": "kitting"');
        expect(ncFile).toContain("(CUT2KIT -> A2MC)");
        expect(ncFile).toContain("G90");
        expect(ncFile).toContain("G20");
        expect(ncFile).toContain("G54");
        expect(ncFile).toContain("M6 T1");
        expect(ncFile).toContain("M3 S18000");
        expect(ncFile.trimEnd().endsWith("M30")).toBe(true);
        expect(ncFile).toBe(ncFile.toUpperCase());
      }),
    );

    it.effect("rejects generation when project validation is still failing", () =>
      Effect.gen(function* () {
        const cut2kitProjects = yield* Cut2KitProjects;
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const projectDir = yield* makeTempDir("cut2kit-blocked-project-");

        yield* fileSystem.makeDirectory(path.join(projectDir, "elevations"), { recursive: true });
        yield* fileSystem.writeFileString(
          path.join(projectDir, "elevations", "front.pdf"),
          "%PDF-1.7\n",
        );

        const error = yield* cut2kitProjects.generateOutputs({ cwd: projectDir }).pipe(Effect.flip);

        expect(error.detail).toContain("validation errors");
      }),
    );

    it.effect("blocks generation when the manufacturing plan is missing", () =>
      Effect.gen(function* () {
        const cut2kitProjects = yield* Cut2KitProjects;
        const projectDir = yield* makeTempDir("cut2kit-no-plan-project-");
        yield* copyExampleSettings(projectDir);
        yield* copyExampleElevation(projectDir);

        const error = yield* cut2kitProjects.generateOutputs({ cwd: projectDir }).pipe(Effect.flip);

        expect(error.detail).toContain("manufacturing jobs");
      }),
    );
  });

  describe("renderFramingLayout", () => {
    it.effect("renders a framing-layout PDF from the structured JSON artifact", () =>
      Effect.gen(function* () {
        const cut2kitProjects = yield* Cut2KitProjects;
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const projectDir = yield* makeTempDir("cut2kit-framing-layout-project-");
        yield* copyFixtureProject(projectDir);

        yield* Effect.tryPromise({
          try: async () => {
            const draft = makeFramingDraft();
            await fsPromises.writeFile(
              `${projectDir}/output/reports/framing-layouts/elevations-front-wall.framing-layout.json`,
              JSON.stringify(
                {
                  ...draft,
                  sourcePdfPath: "elevations/front-wall.pdf",
                  geometry: {
                    ...draft.geometry,
                    sourcePdfPath: "elevations/front-wall.pdf",
                  },
                },
                null,
                2,
              ),
              "utf8",
            );
          },
          catch: (error) =>
            new FixtureCopyError({
              message: `Failed to seed framing-layout JSON artifact: ${
                error instanceof Error ? error.message : String(error)
              }`,
            }),
        });

        yield* fileSystem.remove(
          path.join(
            projectDir,
            "output/reports/framing-layouts/elevations-front-wall.framing-layout.pdf",
          ),
        );

        const result = yield* cut2kitProjects.renderFramingLayout({
          cwd: projectDir,
          relativePath: "output/reports/framing-layouts/elevations-front-wall.framing-layout.json",
        });

        expect(result.pdfPath).toBe(
          "output/reports/framing-layouts/elevations-front-wall.framing-layout.pdf",
        );
        expect(result.project.files.some((file) => file.relativePath === result.pdfPath)).toBe(
          true,
        );

        const renderedPdf = yield* fileSystem.readFile(path.join(projectDir, result.pdfPath));
        expect(renderedPdf.byteLength).toBeGreaterThan(1000);
      }),
    );

    it.effect(
      "renders a framing-layout PDF from thread-style framing JSON with richer openings and member aliases",
      () =>
        Effect.gen(function* () {
          const cut2kitProjects = yield* Cut2KitProjects;
          const fileSystem = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const projectDir = yield* makeTempDir("cut2kit-framing-layout-thread-json-");
          yield* copyExampleSettings(projectDir);
          yield* Effect.tryPromise({
            try: async () => {
              await fsPromises.writeFile(`${projectDir}/elevation2.pdf`, "%PDF-1.7\n", "utf8");
              await fsPromises.mkdir(`${projectDir}/output/reports/framing-layouts`, {
                recursive: true,
              });
              await fsPromises.writeFile(
                `${projectDir}/output/reports/framing-layouts/elevation2.framing-layout.json`,
                JSON.stringify(makeThreadStyleFramingDraft(), null, 2),
                "utf8",
              );
            },
            catch: (error) =>
              new FixtureCopyError({
                message: `Failed to seed thread-style framing JSON artifact: ${
                  error instanceof Error ? error.message : String(error)
                }`,
              }),
          });

          const result = yield* cut2kitProjects.renderFramingLayout({
            cwd: projectDir,
            relativePath: "output/reports/framing-layouts/elevation2.framing-layout.json",
          });

          expect(result.pdfPath).toBe(
            "output/reports/framing-layouts/elevation2.framing-layout.pdf",
          );

          const renderedPdf = yield* fileSystem.readFile(path.join(projectDir, result.pdfPath));
          expect(renderedPdf.byteLength).toBeGreaterThan(1000);
        }),
    );
  });

  describe("renderSheathingLayout", () => {
    it.effect(
      "renders a wall-package PDF and validation report from the sheathing JSON artifact",
      () =>
        Effect.gen(function* () {
          const cut2kitProjects = yield* Cut2KitProjects;
          const fileSystem = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const projectDir = yield* makeTempDir("cut2kit-sheathing-layout-project-");
          yield* copyExampleSettings(projectDir);
          yield* copyExampleElevation(projectDir);

          yield* Effect.tryPromise({
            try: async () => {
              await fsPromises.mkdir(`${projectDir}/output/reports/framing-layouts`, {
                recursive: true,
              });
              await fsPromises.mkdir(`${projectDir}/output/reports/sheathing-layouts`, {
                recursive: true,
              });
              await fsPromises.writeFile(
                `${projectDir}/output/reports/framing-layouts/examples-elevation3.framing-layout.json`,
                JSON.stringify(makeFramingDraft(), null, 2),
                "utf8",
              );
              await fsPromises.writeFile(
                `${projectDir}/output/reports/sheathing-layouts/examples-elevation3.sheathing-layout.json`,
                JSON.stringify(makeSheathingDraft(), null, 2),
                "utf8",
              );
            },
            catch: (error) =>
              new FixtureCopyError({
                message: `Failed to seed sheathing-layout test artifacts: ${
                  error instanceof Error ? error.message : String(error)
                }`,
              }),
          });

          const result = yield* cut2kitProjects.renderSheathingLayout({
            cwd: projectDir,
            relativePath:
              "output/reports/sheathing-layouts/examples-elevation3.sheathing-layout.json",
          });

          expect(result.status).toBe("completed");
          expect(result.pdfPath).toBe(
            "output/reports/sheathing-layouts/examples-elevation3.sheathing-layout.pdf",
          );
          expect(result.validationReportJsonPath).toBe(
            "output/reports/wall-layouts/examples-elevation3.validation-report.json",
          );
          expect(result.project.files.some((file) => file.relativePath === result.pdfPath)).toBe(
            true,
          );

          const renderedPdf = yield* fileSystem.readFile(path.join(projectDir, result.pdfPath));
          const validationReport = yield* fileSystem.readFileString(
            path.join(projectDir, result.validationReportJsonPath),
          );
          expect(renderedPdf.byteLength).toBeGreaterThan(1000);
          expect(validationReport).toContain('"readyForPackaging": true');
        }),
    );

    it.effect(
      "writes the validation report and blocks PDF rendering when deterministic checks fail",
      () =>
        Effect.gen(function* () {
          const cut2kitProjects = yield* Cut2KitProjects;
          const fileSystem = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const projectDir = yield* makeTempDir("cut2kit-sheathing-layout-blocked-");
          yield* copyExampleSettings(projectDir);
          yield* copyExampleElevation(projectDir);

          const invalidSheathingDraft = {
            ...makeSheathingDraft(),
            sheets: makeSheathingDraft().sheets.map((sheet, index) =>
              index === 0
                ? {
                    ...sheet,
                    cutouts: [
                      {
                        ...sheet.cutouts[0]!,
                        right: 60,
                      },
                    ],
                  }
                : sheet,
            ),
          };

          yield* Effect.tryPromise({
            try: async () => {
              await fsPromises.mkdir(`${projectDir}/output/reports/framing-layouts`, {
                recursive: true,
              });
              await fsPromises.mkdir(`${projectDir}/output/reports/sheathing-layouts`, {
                recursive: true,
              });
              await fsPromises.writeFile(
                `${projectDir}/output/reports/framing-layouts/examples-elevation3.framing-layout.json`,
                JSON.stringify(makeFramingDraft(), null, 2),
                "utf8",
              );
              await fsPromises.writeFile(
                `${projectDir}/output/reports/sheathing-layouts/examples-elevation3.sheathing-layout.json`,
                JSON.stringify(invalidSheathingDraft, null, 2),
                "utf8",
              );
            },
            catch: (error) =>
              new FixtureCopyError({
                message: `Failed to seed blocked sheathing-layout artifacts: ${
                  error instanceof Error ? error.message : String(error)
                }`,
              }),
          });

          const result = yield* cut2kitProjects.renderSheathingLayout({
            cwd: projectDir,
            relativePath:
              "output/reports/sheathing-layouts/examples-elevation3.sheathing-layout.json",
          });

          expect(result.status).toBe("validation_blocked");
          expect(result.writtenPaths).toContain(result.validationReportJsonPath);
          expect(result.writtenPaths).not.toContain(result.pdfPath);

          const validationReport = yield* fileSystem.readFileString(
            path.join(projectDir, result.validationReportJsonPath),
          );
          expect(validationReport).toContain('"readyForPackaging": false');
        }),
    );

    it.effect(
      "accepts agent-authored sheathing JSON that aliases cutout openingId to sourceOpeningId",
      () =>
        Effect.gen(function* () {
          const cut2kitProjects = yield* Cut2KitProjects;
          const fileSystem = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const projectDir = yield* makeTempDir("cut2kit-sheathing-layout-compatible-");
          yield* copyExampleSettings(projectDir);
          yield* copyExampleElevation(projectDir);

          yield* Effect.tryPromise({
            try: async () => {
              await fsPromises.mkdir(`${projectDir}/output/reports/framing-layouts`, {
                recursive: true,
              });
              await fsPromises.mkdir(`${projectDir}/output/reports/sheathing-layouts`, {
                recursive: true,
              });
              await fsPromises.writeFile(
                `${projectDir}/output/reports/framing-layouts/examples-elevation3.framing-layout.json`,
                JSON.stringify(makeFramingDraft(), null, 2),
                "utf8",
              );
              await fsPromises.writeFile(
                `${projectDir}/output/reports/sheathing-layouts/examples-elevation3.sheathing-layout.json`,
                JSON.stringify(makeCompatibleSheathingDraft(), null, 2),
                "utf8",
              );
            },
            catch: (error) =>
              new FixtureCopyError({
                message: `Failed to seed compatible sheathing-layout artifacts: ${
                  error instanceof Error ? error.message : String(error)
                }`,
              }),
          });

          const result = yield* cut2kitProjects.renderSheathingLayout({
            cwd: projectDir,
            relativePath:
              "output/reports/sheathing-layouts/examples-elevation3.sheathing-layout.json",
          });

          expect(result.status).toBe("completed");

          const renderedPdf = yield* fileSystem.readFile(path.join(projectDir, result.pdfPath));
          expect(renderedPdf.byteLength).toBeGreaterThan(1000);
        }),
    );
  });

  describe("compileFramingPrompt", () => {
    it.effect(
      "compiles the framing-thread prompt on the server from loaded templates and staged geometry",
      () =>
        Effect.gen(function* () {
          const cut2kitProjects = yield* Cut2KitProjects;
          const projectDir = yield* makeTempDir("cut2kit-compile-framing-prompt-");
          yield* copyExampleSettings(projectDir);
          yield* copyExampleElevation(projectDir);

          yield* Effect.tryPromise({
            try: async () => {
              await fsPromises.mkdir(`${projectDir}/output/reports/wall-layouts`, {
                recursive: true,
              });
              await fsPromises.writeFile(
                `${projectDir}/output/reports/wall-layouts/examples-elevation3.extracted-elevation.json`,
                JSON.stringify(makeGeometryDraft(), null, 2),
                "utf8",
              );
            },
            catch: (error) =>
              new FixtureCopyError({
                message: `Failed to seed extracted geometry artifact: ${
                  error instanceof Error ? error.message : String(error)
                }`,
              }),
          });

          const result = yield* cut2kitProjects.compileFramingPrompt({
            cwd: projectDir,
            sourcePdfPath: "examples/elevation3.pdf",
          });

          expect(result.geometryJsonPath).toBe(
            "output/reports/wall-layouts/examples-elevation3.extracted-elevation.json",
          );
          expect(result.geometryLoaded).toBe(true);
          expect(result.prompt).toContain("You are the framing-planning agent for Cut2Kit.");
          expect(result.prompt).not.toContain(
            "Load and follow these prompt files before solving the wall layout:",
          );
          expect(result.prompt).toContain('"sourcePdfPath": "examples/elevation3.pdf"');
        }),
    );
  });

  describe("compileSheathingPrompt", () => {
    it.effect(
      "compiles the wall-package prompt on the server from loaded templates and staged framing",
      () =>
        Effect.gen(function* () {
          const cut2kitProjects = yield* Cut2KitProjects;
          const projectDir = yield* makeTempDir("cut2kit-compile-sheathing-prompt-");
          yield* copyExampleSettings(projectDir);
          yield* copyExampleElevation(projectDir);

          yield* Effect.tryPromise({
            try: async () => {
              await fsPromises.mkdir(`${projectDir}/output/reports/framing-layouts`, {
                recursive: true,
              });
              await fsPromises.writeFile(
                `${projectDir}/output/reports/framing-layouts/examples-elevation3.framing-layout.json`,
                JSON.stringify(makeFramingDraft(), null, 2),
                "utf8",
              );
            },
            catch: (error) =>
              new FixtureCopyError({
                message: `Failed to seed staged framing artifact: ${
                  error instanceof Error ? error.message : String(error)
                }`,
              }),
          });

          const result = yield* cut2kitProjects.compileSheathingPrompt({
            cwd: projectDir,
            sourcePdfPath: "examples/elevation3.pdf",
          });

          expect(result.framingJsonPath).toBe(
            "output/reports/framing-layouts/examples-elevation3.framing-layout.json",
          );
          expect(result.sheathingJsonPath).toBe(
            "output/reports/sheathing-layouts/examples-elevation3.sheathing-layout.json",
          );
          expect(result.prompt).toContain("You are the sheathing-planning agent for Cut2Kit.");
          expect(result.prompt).toContain('"sourcePdfPath": "examples/elevation3.pdf"');
        }),
    );
  });

  describe("compileManufacturingPrompt", () => {
    it.effect(
      "compiles the manufacturing-plan prompt from the staged sheathing layout artifact",
      () =>
        Effect.gen(function* () {
          const cut2kitProjects = yield* Cut2KitProjects;
          const projectDir = yield* makeTempDir("cut2kit-compile-manufacturing-prompt-");
          yield* copyExampleSettings(projectDir);
          yield* copyExampleElevation(projectDir);

          yield* Effect.tryPromise({
            try: async () => {
              await fsPromises.mkdir(`${projectDir}/output/reports/sheathing-layouts`, {
                recursive: true,
              });
              await fsPromises.writeFile(
                `${projectDir}/output/reports/sheathing-layouts/examples-elevation3.sheathing-layout.json`,
                JSON.stringify(makeCompatibleSheathingDraft(), null, 2),
                "utf8",
              );
            },
            catch: (error) =>
              new FixtureCopyError({
                message: `Failed to seed staged sheathing artifact: ${
                  error instanceof Error ? error.message : String(error)
                }`,
              }),
          });

          const result = yield* cut2kitProjects.compileManufacturingPrompt({
            cwd: projectDir,
            sourcePdfPath: "examples/elevation3.pdf",
          });

          expect(result.sheathingJsonPath).toBe(
            "output/reports/sheathing-layouts/examples-elevation3.sheathing-layout.json",
          );
          expect(result.manufacturingPlanPath).toBe("cut2kit.manufacturing.json");
          expect(result.prompt).toContain(
            "Your job is to transform a validated single-wall sheathing layout into a machine-ready manufacturing plan for the AXYZ A2MC post.",
          );
          expect(result.prompt).toContain("Sheathing layout JSON input:");
          expect(result.prompt).toContain('"sourcePdfPath": "examples/elevation3.pdf"');
        }),
    );

    it.effect("blocks prompt compilation when the sheathing layout artifact is missing", () =>
      Effect.gen(function* () {
        const cut2kitProjects = yield* Cut2KitProjects;
        const projectDir = yield* makeTempDir("cut2kit-missing-manufacturing-sheathing-");
        yield* copyExampleSettings(projectDir);
        yield* copyExampleElevation(projectDir);

        const error = yield* cut2kitProjects
          .compileManufacturingPrompt({
            cwd: projectDir,
            sourcePdfPath: "examples/elevation3.pdf",
          })
          .pipe(Effect.flip);

        expect(error.operation).toBe("compileManufacturingPrompt.decodeSheathingArtifact");
        expect(error.detail).toContain("examples-elevation3.sheathing-layout.json");
      }),
    );
  });

  describe("generateWallLayout", () => {
    it.effect(
      "runs the AI-first geometry -> framing -> sheathing workflow and writes packaged artifacts",
      () =>
        Effect.gen(function* () {
          const cut2kitProjects = yield* Cut2KitProjects;
          const fileSystem = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const projectDir = yield* makeTempDir("cut2kit-ai-wall-project-");
          yield* copyExampleSettings(projectDir);
          yield* copyExampleElevation(projectDir);

          const geometryDraft = makeGeometryDraft();
          const framingDraft = makeFramingDraft(geometryDraft);
          const sheathingDraft = makeSheathingDraft(geometryDraft);

          runCut2KitCodexJsonMock
            .mockReturnValueOnce(Effect.succeed(geometryDraft))
            .mockReturnValueOnce(Effect.succeed(framingDraft))
            .mockReturnValueOnce(Effect.succeed(sheathingDraft));

          const result = yield* cut2kitProjects.generateWallLayout({
            cwd: projectDir,
            sourcePdfPath: "examples/elevation3.pdf",
          });

          expect(runCut2KitCodexJsonMock).toHaveBeenCalledTimes(3);
          expect(runCut2KitCodexJsonMock.mock.calls[0]?.[0]?.prompt).toContain(
            "You are the elevation-intake agent for Cut2Kit.",
          );
          expect(runCut2KitCodexJsonMock.mock.calls[0]?.[0]?.prompt).not.toContain(
            "Load and follow these prompt files before solving the wall layout:",
          );
          expect(runCut2KitCodexJsonMock.mock.calls[1]?.[0]?.prompt).toContain(
            "You are the framing-planning agent for Cut2Kit.",
          );
          expect(runCut2KitCodexJsonMock.mock.calls[1]?.[0]?.prompt).not.toContain(
            "Load and follow these prompt files before solving the wall layout:",
          );
          expect(runCut2KitCodexJsonMock.mock.calls[2]?.[0]?.prompt).toContain(
            "You are the sheathing-planning agent for Cut2Kit.",
          );
          expect(runCut2KitCodexJsonMock.mock.calls[2]?.[0]?.prompt).not.toContain(
            "Load and follow these prompt files before solving the wall layout:",
          );

          expect(result.status).toBe("completed");
          expect(result.artifacts.geometryJsonPath).toBe(
            "output/reports/wall-layouts/examples-elevation3.extracted-elevation.json",
          );
          expect(result.artifacts.validationReportJsonPath).toBe(
            "output/reports/wall-layouts/examples-elevation3.validation-report.json",
          );
          expect(result.artifacts.framingPdfPath).toBe(
            "output/reports/framing-layouts/examples-elevation3.framing-layout.pdf",
          );
          expect(result.artifacts.sheathingPdfPath).toBe(
            "output/reports/sheathing-layouts/examples-elevation3.sheathing-layout.pdf",
          );
          expect(result.validationReport.readyForPackaging).toBe(true);
          expect(result.framingLayout?.validation.endStudsDoubled).toBe(true);
          expect(result.sheathingLayout?.summary.sheetCount).toBe(8);
          expect(result.sheathingLayout?.validation.firstPageFitsMargins).toBe(true);
          expect(result.writtenPaths).toHaveLength(6);

          const framingPdf = yield* fileSystem.readFile(
            path.join(projectDir, result.artifacts.framingPdfPath),
          );
          const sheathingPdf = yield* fileSystem.readFile(
            path.join(projectDir, result.artifacts.sheathingPdfPath),
          );
          const validationReport = yield* fileSystem.readFileString(
            path.join(projectDir, result.artifacts.validationReportJsonPath),
          );
          expect(framingPdf.byteLength).toBeGreaterThan(1000);
          expect(sheathingPdf.byteLength).toBeGreaterThan(1000);
          expect(validationReport).toContain('"readyForPackaging": true');
        }),
    );

    it.effect("uses OpenCode vLLM model selection from project settings when configured", () =>
      Effect.gen(function* () {
        const cut2kitProjects = yield* Cut2KitProjects;
        const projectDir = yield* makeTempDir("cut2kit-ai-wall-opencode-project-");
        yield* copyExampleSettings(projectDir);
        yield* copyExampleElevation(projectDir);

        yield* Effect.tryPromise({
          try: async () => {
            const settingsPath = `${projectDir}/cut2kit.settings.json`;
            const settings = JSON.parse(await fsPromises.readFile(settingsPath, "utf8")) as {
              ai?: Record<string, unknown>;
            };
            if (!settings.ai || typeof settings.ai !== "object") {
              throw new Error("Missing ai settings section.");
            }
            settings.ai.provider = "opencode";
            settings.ai.model = "vllm/qwen3-coder-next";
            delete settings.ai.reasoningEffort;
            await fsPromises.writeFile(
              settingsPath,
              `${JSON.stringify(settings, null, 2)}\n`,
              "utf8",
            );
          },
          catch: (error) =>
            new FixtureCopyError({
              message: `Failed to set OpenCode model selection in project settings: ${
                error instanceof Error ? error.message : String(error)
              }`,
            }),
        });

        const geometryDraft = makeGeometryDraft();
        const framingDraft = makeFramingDraft(geometryDraft);
        const sheathingDraft = makeSheathingDraft(geometryDraft);
        runCut2KitCodexJsonMock
          .mockReturnValueOnce(Effect.succeed(geometryDraft))
          .mockReturnValueOnce(Effect.succeed(framingDraft))
          .mockReturnValueOnce(Effect.succeed(sheathingDraft));

        yield* cut2kitProjects.generateWallLayout({
          cwd: projectDir,
          sourcePdfPath: "examples/elevation3.pdf",
        });

        expect(runCut2KitCodexJsonMock).toHaveBeenCalledTimes(3);
        expect(runCut2KitCodexJsonMock.mock.calls[0]?.[0]?.modelSelection).toEqual({
          provider: "opencode",
          model: "vllm/qwen3-coder-next",
        });
      }),
    );

    it.effect("defaults Codex wall generation to xhigh reasoning when the setting is omitted", () =>
      Effect.gen(function* () {
        const cut2kitProjects = yield* Cut2KitProjects;
        const projectDir = yield* makeTempDir("cut2kit-ai-wall-codex-default-effort-");
        yield* copyExampleSettings(projectDir);
        yield* copyExampleElevation(projectDir);

        yield* Effect.tryPromise({
          try: async () => {
            const settingsPath = `${projectDir}/cut2kit.settings.json`;
            const settings = JSON.parse(await fsPromises.readFile(settingsPath, "utf8")) as {
              ai?: Record<string, unknown>;
            };
            if (!settings.ai || typeof settings.ai !== "object") {
              throw new Error("Missing ai settings section.");
            }
            delete settings.ai.reasoningEffort;
            await fsPromises.writeFile(
              settingsPath,
              `${JSON.stringify(settings, null, 2)}\n`,
              "utf8",
            );
          },
          catch: (error) =>
            new FixtureCopyError({
              message: `Failed to clear Cut2Kit Codex reasoning effort in project settings: ${
                error instanceof Error ? error.message : String(error)
              }`,
            }),
        });

        const geometryDraft = makeGeometryDraft();
        const framingDraft = makeFramingDraft(geometryDraft);
        const sheathingDraft = makeSheathingDraft(geometryDraft);
        runCut2KitCodexJsonMock
          .mockReturnValueOnce(Effect.succeed(geometryDraft))
          .mockReturnValueOnce(Effect.succeed(framingDraft))
          .mockReturnValueOnce(Effect.succeed(sheathingDraft));

        yield* cut2kitProjects.generateWallLayout({
          cwd: projectDir,
          sourcePdfPath: "examples/elevation3.pdf",
        });

        expect(runCut2KitCodexJsonMock.mock.calls[0]?.[0]?.modelSelection).toEqual({
          provider: "codex",
          model: "gpt-5.4",
          options: {
            reasoningEffort: "xhigh",
          },
        });
      }),
    );

    it.effect("rejects OpenCode model selections that are not vLLM models", () =>
      Effect.gen(function* () {
        const cut2kitProjects = yield* Cut2KitProjects;
        const projectDir = yield* makeTempDir("cut2kit-ai-wall-opencode-invalid-model-");
        yield* copyExampleSettings(projectDir);
        yield* copyExampleElevation(projectDir);

        yield* Effect.tryPromise({
          try: async () => {
            const settingsPath = `${projectDir}/cut2kit.settings.json`;
            const settings = JSON.parse(await fsPromises.readFile(settingsPath, "utf8")) as {
              ai?: Record<string, unknown>;
            };
            if (!settings.ai || typeof settings.ai !== "object") {
              throw new Error("Missing ai settings section.");
            }
            settings.ai.provider = "opencode";
            settings.ai.model = "openai/gpt-5.4";
            await fsPromises.writeFile(
              settingsPath,
              `${JSON.stringify(settings, null, 2)}\n`,
              "utf8",
            );
          },
          catch: (error) =>
            new FixtureCopyError({
              message: `Failed to set invalid OpenCode model selection in project settings: ${
                error instanceof Error ? error.message : String(error)
              }`,
            }),
        });

        const error = yield* cut2kitProjects
          .generateWallLayout({
            cwd: projectDir,
            sourcePdfPath: "examples/elevation3.pdf",
          })
          .pipe(Effect.flip);

        expect(error.operation).toBe("generateWallLayout.validateModel");
        expect(error.detail).toContain("vLLM model");
        expect(runCut2KitCodexJsonMock).not.toHaveBeenCalled();
      }),
    );

    it.effect("uses the project-local prompt markdown override during wall generation", () =>
      Effect.gen(function* () {
        const cut2kitProjects = yield* Cut2KitProjects;
        const projectDir = yield* makeTempDir("cut2kit-ai-wall-prompt-override-");
        yield* copyExampleSettings(projectDir);
        yield* copyExampleElevation(projectDir);

        yield* Effect.tryPromise({
          try: async () => {
            await fsPromises.mkdir(`${projectDir}/.docs`, { recursive: true });
            await fsPromises.writeFile(
              `${projectDir}/.docs/system-geometry.md`,
              "You are the overridden geometry agent for this project.\n",
              "utf8",
            );
          },
          catch: (error) =>
            new FixtureCopyError({
              message: `Failed to seed project-local prompt override: ${
                error instanceof Error ? error.message : String(error)
              }`,
            }),
        });

        const geometryDraft = makeGeometryDraft();
        const framingDraft = makeFramingDraft(geometryDraft);
        const sheathingDraft = makeSheathingDraft(geometryDraft);

        runCut2KitCodexJsonMock
          .mockReturnValueOnce(Effect.succeed(geometryDraft))
          .mockReturnValueOnce(Effect.succeed(framingDraft))
          .mockReturnValueOnce(Effect.succeed(sheathingDraft));

        yield* cut2kitProjects.generateWallLayout({
          cwd: projectDir,
          sourcePdfPath: "examples/elevation3.pdf",
        });

        expect(runCut2KitCodexJsonMock.mock.calls[0]?.[0]?.prompt).toContain(
          "overridden geometry agent for this project",
        );
      }),
    );

    it.effect("stops after extracted geometry when ambiguity requires confirmation", () =>
      Effect.gen(function* () {
        const cut2kitProjects = yield* Cut2KitProjects;
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const projectDir = yield* makeTempDir("cut2kit-ai-ambiguity-project-");
        yield* copyExampleSettings(projectDir);
        yield* copyExampleElevation(projectDir);

        const ambiguousGeometryDraft = {
          ...makeGeometryDraft(),
          wall: {
            ...makeGeometryDraft().wall,
            width: 0,
          },
        };

        runCut2KitCodexJsonMock.mockReturnValueOnce(Effect.succeed(ambiguousGeometryDraft));

        const result = yield* cut2kitProjects.generateWallLayout({
          cwd: projectDir,
          sourcePdfPath: "examples/elevation3.pdf",
        });

        expect(result.status).toBe("needs_confirmation");
        expect(result.framingLayout).toBeNull();
        expect(result.sheathingLayout).toBeNull();
        expect(result.writtenPaths).toContain(
          "output/reports/wall-layouts/examples-elevation3.extracted-elevation.json",
        );
        expect(result.writtenPaths).toContain(
          "output/reports/wall-layouts/examples-elevation3.validation-report.json",
        );

        const validationReport = yield* fileSystem.readFileString(
          path.join(projectDir, result.artifacts.validationReportJsonPath),
        );
        expect(validationReport).toContain('"requiresConfirmation": true');
      }),
    );

    it.effect("returns validation_blocked when staged layouts fail deterministic checks", () =>
      Effect.gen(function* () {
        const cut2kitProjects = yield* Cut2KitProjects;
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const projectDir = yield* makeTempDir("cut2kit-ai-validation-project-");
        yield* copyExampleSettings(projectDir);
        yield* copyExampleElevation(projectDir);

        const geometryDraft = makeGeometryDraft();
        const framingDraft = makeFramingDraft(geometryDraft);
        const sheathingDraft = {
          ...makeSheathingDraft(geometryDraft),
          sheets: makeSheathingDraft(geometryDraft).sheets.map((sheet, index) =>
            index === 0
              ? {
                  ...sheet,
                  cutouts: [
                    {
                      ...sheet.cutouts[0]!,
                      right: 60,
                    },
                  ],
                }
              : sheet,
          ),
        };

        runCut2KitCodexJsonMock
          .mockReturnValueOnce(Effect.succeed(geometryDraft))
          .mockReturnValueOnce(Effect.succeed(framingDraft))
          .mockReturnValueOnce(Effect.succeed(sheathingDraft));

        const result = yield* cut2kitProjects.generateWallLayout({
          cwd: projectDir,
          sourcePdfPath: "examples/elevation3.pdf",
        });

        expect(result.status).toBe("validation_blocked");
        expect(result.writtenPaths).toContain(result.artifacts.validationReportJsonPath);
        expect(result.writtenPaths).not.toContain(result.artifacts.framingPdfPath);
        expect(result.writtenPaths).not.toContain(result.artifacts.sheathingPdfPath);

        const validationReport = yield* fileSystem.readFileString(
          path.join(projectDir, result.artifacts.validationReportJsonPath),
        );
        expect(validationReport).toContain('"readyForPackaging": false');
      }),
    );
  });
});
