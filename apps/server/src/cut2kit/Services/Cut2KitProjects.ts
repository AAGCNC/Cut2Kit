/**
 * Cut2KitProjects - Effect service contract for deterministic project intake,
 * validation, and placeholder output generation.
 *
 * Owns filesystem scanning, settings validation, manifest derivation, and
 * stable placeholder NC output generation for Cut2Kit workspaces.
 *
 * @module Cut2KitProjects
 */
import { Schema, ServiceMap } from "effect";
import type { Effect } from "effect";

import type {
  Cut2KitGenerateOutputsInput,
  Cut2KitGenerateOutputsResult,
  Cut2KitInspectProjectInput,
  Cut2KitProject,
} from "@t3tools/contracts";

export class Cut2KitProjectsError extends Schema.TaggedErrorClass<Cut2KitProjectsError>()(
  "Cut2KitProjectsError",
  {
    cwd: Schema.String,
    operation: Schema.String,
    detail: Schema.String,
    cause: Schema.optional(Schema.Defect),
  },
) {}

export interface Cut2KitProjectsShape {
  readonly inspectProject: (
    input: Cut2KitInspectProjectInput,
  ) => Effect.Effect<Cut2KitProject, Cut2KitProjectsError>;
  readonly generateOutputs: (
    input: Cut2KitGenerateOutputsInput,
  ) => Effect.Effect<Cut2KitGenerateOutputsResult, Cut2KitProjectsError>;
}

export class Cut2KitProjects extends ServiceMap.Service<Cut2KitProjects, Cut2KitProjectsShape>()(
  "t3/cut2kit/Services/Cut2KitProjects",
) {}
