import type { Cut2KitProject, ModelSelection } from "@t3tools/contracts";
import { DEFAULT_MODEL_BY_PROVIDER } from "@t3tools/contracts";

const DEFAULT_REPORTS_DIR = "output/reports";
const FRAMING_LAYOUT_OUTPUT_DIR = "framing-layouts";

function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .replace(/\.pdf$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/g, "")
    .replace(/-+$/g, "");
  return slug.length > 0 ? slug : "wall";
}

function fileStem(relativePath: string): string {
  const fileName = relativePath.split("/").at(-1) ?? relativePath;
  return fileName.replace(/\.[^.]+$/u, "");
}

function normalizeReportsDir(project: Pick<Cut2KitProject, "settings">): string {
  return project.settings?.output.reportsDir ?? DEFAULT_REPORTS_DIR;
}

export function buildFramingLayoutArtifactStem(sourcePdfPath: string): string {
  return slugify(sourcePdfPath);
}

export function buildFramingLayoutArtifactPaths(
  project: Pick<Cut2KitProject, "settings">,
  sourcePdfPath: string,
) {
  const reportsDir = normalizeReportsDir(project);
  const stem = buildFramingLayoutArtifactStem(sourcePdfPath);
  const relativeDir = `${reportsDir}/${FRAMING_LAYOUT_OUTPUT_DIR}`;
  return {
    stem,
    relativeDir,
    jsonPath: `${relativeDir}/${stem}.framing-layout.json`,
    pdfPath: `${relativeDir}/${stem}.framing-layout.pdf`,
  };
}

export function buildFramingLayoutThreadTitle(sourcePdfPath: string): string {
  return `Framing layout · ${fileStem(sourcePdfPath)}`;
}

export function resolveCut2KitAutomationModelSelection(
  project: Pick<Cut2KitProject, "settings">,
  fallbackModelSelection: ModelSelection | null | undefined,
): ModelSelection {
  const ai = project.settings?.ai ?? null;
  const provider = ai?.provider === "claudeAgent" ? "claudeAgent" : "codex";
  const model = ai?.model ?? fallbackModelSelection?.model ?? DEFAULT_MODEL_BY_PROVIDER[provider];

  if (provider === "claudeAgent") {
    const options =
      ai?.reasoningEffort || ai?.preferFastServiceTierWhenAvailable
        ? {
            ...(ai?.reasoningEffort ? { effort: ai.reasoningEffort as never } : {}),
            ...(ai?.preferFastServiceTierWhenAvailable ? { fastMode: true } : {}),
          }
        : fallbackModelSelection?.provider === "claudeAgent"
          ? fallbackModelSelection.options
          : undefined;
    return {
      provider,
      model,
      ...(options ? { options } : {}),
    };
  }

  const options =
    ai?.reasoningEffort || ai?.preferFastServiceTierWhenAvailable
      ? {
          ...(ai?.reasoningEffort ? { reasoningEffort: ai.reasoningEffort as never } : {}),
          ...(ai?.preferFastServiceTierWhenAvailable ? { fastMode: true } : {}),
        }
      : fallbackModelSelection?.provider === "codex"
        ? fallbackModelSelection.options
        : undefined;
  return {
    provider,
    model,
    ...(options ? { options } : {}),
  };
}

export function summarizeCut2KitProjectHealth(project: Cut2KitProject): string {
  const statusLabel =
    project.status === "error"
      ? "blocked"
      : project.status === "warning"
        ? "attention needed"
        : "ready";
  return `${statusLabel}: ${project.summary.pdfCount} PDFs, ${project.summary.warningCount} warnings, ${project.summary.errorCount} errors`;
}

export function buildCut2KitAgentPrompt(project: Cut2KitProject): string {
  const snapshot = {
    cwd: project.cwd,
    name: project.name,
    status: project.status,
    settingsFilePath: project.settingsFilePath,
    manufacturingPlanFilePath: project.manufacturingPlanFilePath,
    summary: project.summary,
    issues: project.issues,
    sourceDocuments: project.sourceDocuments,
    framingRules: project.framingRules,
    panelManifest: project.panelManifest,
    nestManifest: project.nestManifest,
    queueManifest: project.queueManifest,
    manufacturingPlan:
      project.manufacturingPlan === null
        ? null
        : {
            targetController: project.manufacturingPlan.targetController,
            units: project.manufacturingPlan.units,
            defaultWorkOffset: project.manufacturingPlan.defaultWorkOffset,
            safeZ: project.manufacturingPlan.safeZ,
            parkPosition: project.manufacturingPlan.parkPosition,
            jobs: project.manufacturingPlan.jobs.map((job) => ({
              jobId: job.jobId,
              sourcePath: job.sourcePath,
              workOffset: job.workOffset ?? null,
              safeZ: job.safeZ ?? null,
              parkPosition: job.parkPosition ?? null,
              operations: job.operations,
            })),
          },
    ncJobs: project.ncJobs.map((job) => ({
      jobId: job.jobId,
      sourcePath: job.sourcePath,
      planSourcePath: job.planSourcePath,
      relativeOutputPath: job.relativeOutputPath,
      queueMode: job.queueMode,
      queueGroup: job.queueGroup,
      application: job.application,
      targetController: job.targetController,
      operationCount: job.operationCount,
    })),
  };

  return [
    "You are the Cut to Kit Agent for AXYZ Cut2Kit.",
    "Use the explicit project snapshot below as the source of truth.",
    "The deterministic app path for machine output is cut2kit.manufacturing.json -> A2MC post generation -> output/nc/*.nc.",
    "Target controller behavior is defined by .docs/a2mc-nc-processing-spec.md and must not be replaced with generic CNC assumptions.",
    "If CAM output needs to change, propose edits to cut2kit.manufacturing.json instead of hand-writing NC.",
    "A2MC rules that must be preserved: uppercase output, explicit startup state, explicit work offset, M6 Tn ordering, M3/M4 before S ordering as requested by the product, no G53, no G92, G4 P<seconds>, structured M272/M273 payloads, standalone M30.",
    "Explain project readiness, identify blocking issues, and suggest settings or manufacturing-plan improvements when useful.",
    "Do not assume hidden state. Do not silently mutate production files. Any file edits must go through explicit approval.",
    "If you recommend changes, present them as a reviewable JSON patch or replacement block and explain why each change helps kitting-first production and A2MC-safe output.",
    "Project snapshot:",
    JSON.stringify(snapshot, null, 2),
  ].join("\n\n");
}

export function buildCut2KitFramingLayoutPrompt(input: {
  project: Cut2KitProject;
  sourcePdfPath: string;
}): string {
  const artifactPaths = buildFramingLayoutArtifactPaths(input.project, input.sourcePdfPath);
  const settingsFilePath = input.project.settingsFilePath ?? "cut2kit.settings.json";

  const jsonTemplate = {
    schemaVersion: "0.1.0",
    sourcePdfPath: input.sourcePdfPath,
    settingsFilePath,
    units: "inch",
    wall: {
      width: 264,
      height: 96,
      memberThickness: 1.5,
      studNominalSize: "2x6",
      material: "SPF",
      topMemberOrientation: "flat",
      bottomMemberOrientation: "flat",
    },
    studLayout: {
      originEdge: "left",
      spacing: 16,
      commonStudCenterlines: [16, 32, 48],
    },
    openings: [
      {
        id: "window-1",
        kind: "window",
        left: 36,
        right: 60,
        bottom: 46,
        top: 82,
        width: 24,
        height: 36,
        clearOpening: true,
      },
    ],
    members: [
      {
        id: "bottom-plate",
        kind: "bottom-plate",
        x: 0,
        y: 0,
        width: 264,
        height: 1.5,
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
      notes: [],
    },
    notes: [],
  };

  return [
    "You are running inside Cut2Kit. Your job is to transform an architectural wall elevation PDF into a framing-layout drawing for a framing crew.",
    `Selected elevation PDF: ${input.sourcePdfPath}`,
    `Cut2Kit settings JSON: ${settingsFilePath}`,
    `Write the structured framing layout JSON to: ${artifactPaths.jsonPath}`,
    `Cut2Kit will deterministically render the framing-layout PDF to: ${artifactPaths.pdfPath}`,
    "Work from the files in the workspace, not from memory. First, discover and inspect the available inputs, especially the selected elevation PDF and the Cut2Kit settings JSON.",
    "The settings JSON is the source of truth for framing rules, spacing logic, stud size, plate behavior, output preferences, and any configurable conventions. Read it carefully, infer its schema from the actual file, and obey it exactly. Do not hardcode rule values if they are present in settings.",
    "Treat the elevation PDF as a front-elevation view of a single wall. Extract the wall geometry primarily from the dimension text shown on the drawing, not by scaling pixels. If the PDF contains both vector text and drawn geometry, use the dimension text as authoritative and use the drawing only to confirm interpretation.",
    "If there are multiple elevation PDFs or later corrections, use the most recent corrected information over earlier conflicting values. In the example established in this project, corrected vertical values are wall height 8'-0\", top of door and windows 6'-10\", and bottom of windows 3'-10\". Horizontal opening positions remained 3'-0\", 5'-0\", 7'-0\", 10'-0\", 13'-0\", 17'-0\", 22'-0\".",
    "Convert the architectural elevation into a framing elevation. Preserve the architectural opening sizes and wall extents while applying framing rules from settings. If settings are silent on plate orientation, use the corrected convention from the prototype: top and bottom horizontal members are shown flat, with the same visible orientation as the studs in elevation.",
    "Interpret openings as clear architectural openings unless settings say otherwise. For the established example: left edge to 3'-0\" is solid wall, 3'-0\" to 5'-0\" is Window 1, 5'-0\" to 7'-0\" is solid wall, 7'-0\" to 10'-0\" is the door, 10'-0\" to 13'-0\" is solid wall, 13'-0\" to 17'-0\" is Window 2, and 17'-0\" to 22'-0\" is solid wall.",
    "Apply framing rules from settings exactly, including stud spacing, edge conditions, member counts, jamb behavior, and how openings interrupt common studs. The default interpretation when settings are incomplete is: one continuous bottom member across the full wall, one continuous top member across the full wall, double studs at each wall end, jamb/load-bearing studs at both sides of every door and window, common studs laid out on configured on-center spacing measured from the left wall edge as origin, no common stud through a door or window void, window common studs split into lower and upper cripples, door common studs split into upper cripples only, windows receive head and sill pieces, doors receive head pieces only, and the left jamb at each opening shifts 1.5 inches left so the clear opening remains the architectural width.",
    "Rule precedence is strict: later corrections override earlier drawings, settings override defaults, dimension text overrides drawn scale.",
    "Produce the framing layout deterministically without asking unnecessary questions.",
    "Author only the machine-readable JSON artifact. Cut2Kit will render the PDF from that JSON after generation, so the JSON must contain the full framing geometry and validation results.",
    "The JSON must match this shape exactly and use inch units with numeric coordinates:",
    JSON.stringify(jsonTemplate, null, 2),
    "Before finishing, validate that overall wall dimensions, opening widths/heights, head/sill heights, doubled end studs, jamb studs, stud spacing, void interruptions, and plate orientation all match the corrected interpretation or the explicit settings file if it overrides any default.",
  ].join("\n\n");
}
