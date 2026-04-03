import fsPromises from "node:fs/promises";

import * as NodeServices from "@effect/platform-node/NodeServices";
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
const exampleSettingsPath = new URL("../../../../../.docs/cut2kit.settings.example.json", import.meta.url);
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
    try: () =>
      fsPromises.copyFile(exampleSettingsPath, `${destination}/cut2kit.settings.json`),
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
      wallBoundsFit: true,
      openingPairsResolved: true,
      openingTypesResolved: true,
      headHeightResolved: true,
      sillHeightResolved: true,
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
      { id: "stud-16", kind: "common-stud" as const, x: 15.25, y: 1.5, width: 1.5, height: 93, centerlineX: 16 },
      { id: "stud-64", kind: "common-stud" as const, x: 63.25, y: 1.5, width: 1.5, height: 93, centerlineX: 64 },
      { id: "stud-208", kind: "common-stud" as const, x: 207.25, y: 1.5, width: 1.5, height: 93, centerlineX: 208 },
      { id: "w1-jamb-l", kind: "jamb-stud" as const, x: 34.5, y: 1.5, width: 1.5, height: 93, sourceOpeningId: "window-1" },
      { id: "w1-jamb-r", kind: "jamb-stud" as const, x: 60, y: 1.5, width: 1.5, height: 93, sourceOpeningId: "window-1" },
      { id: "door-jamb-l", kind: "jamb-stud" as const, x: 82.5, y: 1.5, width: 1.5, height: 93, sourceOpeningId: "door-1" },
      { id: "door-jamb-r", kind: "jamb-stud" as const, x: 120, y: 1.5, width: 1.5, height: 93, sourceOpeningId: "door-1" },
      { id: "w2-jamb-l", kind: "jamb-stud" as const, x: 154.5, y: 1.5, width: 1.5, height: 93, sourceOpeningId: "window-2" },
      { id: "w2-jamb-r", kind: "jamb-stud" as const, x: 204, y: 1.5, width: 1.5, height: 93, sourceOpeningId: "window-2" },
      { id: "w3-jamb-l", kind: "jamb-stud" as const, x: 238.5, y: 1.5, width: 1.5, height: 93, sourceOpeningId: "window-3" },
      { id: "w3-jamb-r", kind: "jamb-stud" as const, x: 288, y: 1.5, width: 1.5, height: 93, sourceOpeningId: "window-3" },
      { id: "w4-jamb-l", kind: "jamb-stud" as const, x: 334.5, y: 1.5, width: 1.5, height: 93, sourceOpeningId: "window-4" },
      { id: "w4-jamb-r", kind: "jamb-stud" as const, x: 360, y: 1.5, width: 1.5, height: 93, sourceOpeningId: "window-4" },
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
        expect(project.summary.pdfCount).toBe(4);
        expect(project.panelManifest.panels).toHaveLength(4);
        expect(project.nestManifest.nests.length).toBeGreaterThan(0);
        expect(project.queueManifest.entries).toHaveLength(4);
        expect(project.ncJobs).toHaveLength(4);
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

    it.effect("maps 0.2.0 framingRules into the project snapshot", () =>
      Effect.gen(function* () {
        const cut2kitProjects = yield* Cut2KitProjects;
        const projectDir = yield* makeTempDir("cut2kit-ai-settings-project-");
        yield* copyExampleSettings(projectDir);
        yield* copyExampleElevation(projectDir);

        const project = yield* cut2kitProjects.inspectProject({ cwd: projectDir });

        expect(project.settings?.schemaVersion).toBe("0.2.0");
        expect(project.framingRules?.studs.onCenter).toBe(16);
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
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const projectDir = yield* makeTempDir("cut2kit-no-plan-project-");

        yield* fileSystem.writeFileString(
          path.join(projectDir, "cut2kit.settings.json"),
          JSON.stringify(
            {
              schemaVersion: "0.1.0",
              project: {
                projectId: "demo-prefab-kit-001",
                jobName: "Prefab Demo House 001",
                customer: "AXYZ Demo Homes",
                site: "shop-floor",
                units: "imperial",
              },
              production: {
                primaryMode: "kitting",
                allowLineSideQueue: true,
                applications: ["siding"],
              },
              machineProfile: {
                profileId: "AXYZ-DEMO",
                postProcessorId: "axyz-a2mc",
                stockCatalogId: "demo-sheet-stock",
              },
              discovery: {
                searchRecursively: true,
                preferredFolders: ["elevations"],
                knownSettingsFileNames: ["cut2kit.settings.json"],
              },
              pdf: {
                autoClassify: true,
                fileAssignments: [
                  {
                    pathPattern: "elevations/front*.pdf",
                    classification: "elevation",
                    side: "front",
                    application: "siding",
                  },
                ],
              },
              framing: {
                studs: {
                  enabled: true,
                  onCenter: 16,
                  originReference: "east",
                  continuityPolicy: "stop_at_openings",
                  openingEdgePolicy: "double_stud_at_openings",
                  allowMidBreakPanelSeam: false,
                  drywallAlignmentPreference: true,
                  endCondition: "customer_defined",
                },
                joists: {
                  enabled: true,
                  direction: "east_west",
                  onCenter: 16,
                  originReference: "north",
                  continuityPolicy: "stop_at_openings",
                },
                headersAndTrimmers: {
                  autoGenerateWhenOpeningsExist: true,
                  openingEdgeClearance: 0.125,
                },
              },
              openings: {
                windowPolicy: {
                  requiresExplicitOpeningGeometry: true,
                  doubleStudDefault: true,
                  panelBreakPreference: "avoid_break_through_opening",
                },
                doorPolicy: {
                  requiresExplicitOpeningGeometry: true,
                  doubleStudDefault: true,
                  panelBreakPreference: "avoid_break_through_opening",
                },
              },
              panelization: {
                strategy: "rule_driven",
                targetPanelWidth: 48,
                maxPanelWidth: 60,
                maxPanelHeight: 144,
                minPanelWidth: 8,
                minPanelHeight: 8,
                edgeTrimAllowance: 0.125,
                kerfAllowance: 0,
                seamPriority: ["align_to_structural_members"],
                perApplication: {
                  siding: {
                    grainOrOrientation: "vertical",
                    preferredBreakDirection: "vertical",
                  },
                  flooring: {
                    grainOrOrientation: "customer_defined",
                    preferredBreakDirection: "joist_aligned",
                  },
                  roofing: {
                    grainOrOrientation: "slope_defined",
                    preferredBreakDirection: "rafter_or_joist_aligned",
                  },
                },
              },
              nesting: {
                strategy: "deterministic",
                sortPriority: ["application"],
                optimizeFor: "yield_then_sequence",
                allowRotation: true,
                groupByHouseSide: true,
                maxConcurrentNests: 1,
              },
              queueing: {
                kitting: {
                  enabled: true,
                  groupBy: "assembly_zone",
                  sequence: ["front"],
                  outputPrefix: "KIT",
                },
                lineSide: {
                  enabled: true,
                  groupBy: "production_flow",
                  sequence: ["walls"],
                  outputPrefix: "LINE",
                },
              },
              output: {
                root: "output",
                manifestsDir: "output/manifests",
                ncDir: "output/nc",
                reportsDir: "output/reports",
                overwritePolicy: "overwrite",
              },
              ai: {
                enabled: true,
                agentName: "Cut to Kit Agent",
                provider: "codex",
                model: "gpt-5.4",
                reasoningEffort: "high",
                preferFastServiceTierWhenAvailable: true,
                approvalRequiredForRuleEdits: true,
                approvalRequiredForQueueGeneration: true,
                allowedTasks: ["author_a2mc_manufacturing_plan"],
              },
            },
            null,
            2,
          ),
        );
        yield* fileSystem.makeDirectory(path.join(projectDir, "elevations"), { recursive: true });
        yield* fileSystem.writeFileString(
          path.join(projectDir, "elevations", "front.pdf"),
          "%PDF-1.7\n",
        );

        const project = yield* cut2kitProjects.inspectProject({ cwd: projectDir });

        expect(project.status).toBe("error");
        expect(project.issues.some((issue) => issue.code === "manufacturing_plan.missing")).toBe(
          true,
        );
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
  });

  describe("generateWallLayout", () => {
    it.effect("runs the AI-first geometry -> framing -> sheathing workflow and writes packaged artifacts", () =>
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
          "AI-first: interpret the elevation PDF and emit structured wall geometry",
        );
        expect(runCut2KitCodexJsonMock.mock.calls[1]?.[0]?.prompt).toContain(
          "This is the framing phase of the reusable summary workflow",
        );
        expect(runCut2KitCodexJsonMock.mock.calls[2]?.[0]?.prompt).toContain(
          "This is the second AI-first conversion phase",
        );

        expect(result.artifacts.geometryJsonPath).toBe(
          "output/reports/wall-layouts/examples-elevation3.wall-geometry.json",
        );
        expect(result.artifacts.framingPdfPath).toBe(
          "output/reports/framing-layouts/examples-elevation3.framing-layout.pdf",
        );
        expect(result.artifacts.sheathingPdfPath).toBe(
          "output/reports/sheathing-layouts/examples-elevation3.sheathing-layout.pdf",
        );
        expect(result.framingLayout.validation.endStudsDoubled).toBe(true);
        expect(result.sheathingLayout.summary.sheetCount).toBe(8);
        expect(result.sheathingLayout.validation.firstPageFitsMargins).toBe(true);
        expect(result.writtenPaths).toHaveLength(5);

        const framingPdf = yield* fileSystem.readFile(
          path.join(projectDir, result.artifacts.framingPdfPath),
        );
        const sheathingPdf = yield* fileSystem.readFile(
          path.join(projectDir, result.artifacts.sheathingPdfPath),
        );
        expect(framingPdf.byteLength).toBeGreaterThan(1000);
        expect(sheathingPdf.byteLength).toBeGreaterThan(1000);
      }),
    );
  });
});
