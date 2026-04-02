import fsPromises from "node:fs/promises";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { Effect, FileSystem, Layer, Path, Schema } from "effect";

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
});
