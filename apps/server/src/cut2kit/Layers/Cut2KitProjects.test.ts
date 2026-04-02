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
        expect(project.summary.dxfCount).toBe(4);
        expect(project.panelManifest.panels).toHaveLength(4);
        expect(project.nestManifest.nests.length).toBeGreaterThan(0);
        expect(project.queueManifest.entries).toHaveLength(4);
        expect(project.ncJobs).toHaveLength(4);
        expect(project.outputStatus.generated).toBe(false);
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
          path.join(projectDir, "elevations", "front.dxf"),
          "0\nEOF\n",
        );

        const project = yield* cut2kitProjects.inspectProject({ cwd: projectDir });

        expect(project.status).toBe("error");
        expect(project.issues.some((issue) => issue.code === "settings.invalid")).toBe(true);
      }),
    );
  });

  describe("generateOutputs", () => {
    it.effect("writes placeholder manifests and NC files for the sample project", () =>
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
        expect(ncFile).toContain("; Cut2Kit placeholder NC");
        expect(ncFile).toContain("M00 (Cut2Kit placeholder - geometry and post-processor pending)");
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
          path.join(projectDir, "elevations", "front.dxf"),
          "0\nEOF\n",
        );

        const error = yield* cut2kitProjects.generateOutputs({ cwd: projectDir }).pipe(Effect.flip);

        expect(error.detail).toContain("validation errors");
      }),
    );
  });
});
