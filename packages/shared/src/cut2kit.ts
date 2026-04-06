import type {
  Cut2KitFramingLayoutV0_2_0,
  Cut2KitProject,
  Cut2KitSheathingLayout,
  Cut2KitWallGeometry,
  ModelSelection,
} from "@t3tools/contracts";
import { DEFAULT_MODEL_BY_PROVIDER } from "@t3tools/contracts";

const DEFAULT_REPORTS_DIR = "output/reports";
const WALL_LAYOUT_OUTPUT_DIR = "wall-layouts";
const FRAMING_LAYOUT_OUTPUT_DIR = "framing-layouts";
const SHEATHING_LAYOUT_OUTPUT_DIR = "sheathing-layouts";
const DEFAULT_PROMPT_REFERENCE_PATHS = {
  reusableSummaryPdf: ".docs/reusable_prompt_summary_framing_osb.pdf",
  framingExamplePdf: "examples/elevation3_framing_layout.pdf",
  sheathingExamplePdf: "examples/elevation3_osb_sheet_layout_with_fastening.pdf",
} as const;
const DEFAULT_PROMPT_TEMPLATE_PATHS = {
  geometrySystem: ".docs/system-geometry.md",
  geometryUser: ".docs/user-geometry.md",
  framingSystem: ".docs/system-framing.md",
  framingUser: ".docs/user-framing.md",
  sheathingSystem: ".docs/system-sheathing.md",
  sheathingUser: ".docs/user-sheathing.md",
  validationChecklist: ".docs/validation-checklist.md",
} as const;

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

function normalizeArtifactDir(
  project: Pick<Cut2KitProject, "settings">,
  key: "wallLayoutsDir" | "framingLayoutsDir" | "sheathingLayoutsDir",
  fallback: string,
): string {
  return project.settings?.artifacts[key] ?? fallback;
}

function jsonBlock(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function buildPromptTemplateSections(input: {
  promptTemplates: {
    systemPrompt: string;
    userPrompt: string;
    validationChecklist: string;
  };
}): string[] {
  return [
    "Cut2Kit loaded the configured prompt templates before this run.",
    "System instructions:",
    input.promptTemplates.systemPrompt.trim(),
    "Task prompt:",
    input.promptTemplates.userPrompt.trim(),
    "Validation checklist:",
    input.promptTemplates.validationChecklist.trim(),
  ];
}

export function resolveCut2KitPromptReferencePaths(_project: Pick<Cut2KitProject, "settings">) {
  return DEFAULT_PROMPT_REFERENCE_PATHS;
}

export function resolveCut2KitPromptTemplatePaths(project: Pick<Cut2KitProject, "settings">) {
  return {
    ...DEFAULT_PROMPT_TEMPLATE_PATHS,
    ...project.settings?.ai?.promptTemplatePaths,
  };
}

export function buildFramingLayoutArtifactStem(sourcePdfPath: string): string {
  return slugify(sourcePdfPath);
}

export function buildWallLayoutArtifactPaths(
  project: Pick<Cut2KitProject, "settings">,
  sourcePdfPath: string,
) {
  const reportsDir = normalizeReportsDir(project);
  const wallLayoutsDir = normalizeArtifactDir(project, "wallLayoutsDir", WALL_LAYOUT_OUTPUT_DIR);
  const framingLayoutsDir = normalizeArtifactDir(
    project,
    "framingLayoutsDir",
    FRAMING_LAYOUT_OUTPUT_DIR,
  );
  const sheathingLayoutsDir = normalizeArtifactDir(
    project,
    "sheathingLayoutsDir",
    SHEATHING_LAYOUT_OUTPUT_DIR,
  );
  const stem = buildFramingLayoutArtifactStem(sourcePdfPath);
  return {
    stem,
    geometryRelativeDir: `${reportsDir}/${wallLayoutsDir}`,
    framingRelativeDir: `${reportsDir}/${framingLayoutsDir}`,
    sheathingRelativeDir: `${reportsDir}/${sheathingLayoutsDir}`,
    geometryJsonPath: `${reportsDir}/${wallLayoutsDir}/${stem}.extracted-elevation.json`,
    validationReportJsonPath: `${reportsDir}/${wallLayoutsDir}/${stem}.validation-report.json`,
    framingJsonPath: `${reportsDir}/${framingLayoutsDir}/${stem}.framing-layout.json`,
    framingPdfPath: `${reportsDir}/${framingLayoutsDir}/${stem}.framing-layout.pdf`,
    sheathingJsonPath: `${reportsDir}/${sheathingLayoutsDir}/${stem}.sheathing-layout.json`,
    sheathingPdfPath: `${reportsDir}/${sheathingLayoutsDir}/${stem}.sheathing-layout.pdf`,
  };
}

export function buildFramingLayoutArtifactPaths(
  project: Pick<Cut2KitProject, "settings">,
  sourcePdfPath: string,
) {
  const artifacts = buildWallLayoutArtifactPaths(project, sourcePdfPath);
  return {
    stem: artifacts.stem,
    relativeDir: artifacts.framingRelativeDir,
    jsonPath: artifacts.framingJsonPath,
    pdfPath: artifacts.framingPdfPath,
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
  const provider = "codex";
  const model = ai?.model ?? fallbackModelSelection?.model ?? DEFAULT_MODEL_BY_PROVIDER[provider];

  const options = ai?.reasoningEffort
    ? {
        reasoningEffort: ai.reasoningEffort as never,
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
    jsonBlock(snapshot),
  ].join("\n\n");
}

export function buildCut2KitWallGeometryPrompt(input: {
  project: Cut2KitProject;
  sourcePdfPath: string;
  extractedText: string;
  promptTemplates: {
    systemPrompt: string;
    userPrompt: string;
    validationChecklist: string;
  };
}): string {
  const artifactPaths = buildWallLayoutArtifactPaths(input.project, input.sourcePdfPath);
  const settingsFilePath = input.project.settingsFilePath ?? "cut2kit.settings.json";
  const promptReferencePaths = resolveCut2KitPromptReferencePaths(input.project);

  const jsonTemplate: Cut2KitWallGeometry = {
    schemaVersion: "0.2.0",
    sourcePdfPath: input.sourcePdfPath,
    settingsFilePath,
    units: "inch",
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
      horizontalMarks: [36, 60, 84, 120],
      verticalMarks: [0, 46, 82, 96],
      pairingStrategy: "consecutive_pairs",
      openingTypeInference: "sill_line_detection",
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

  return [
    ...buildPromptTemplateSections({
      promptTemplates: input.promptTemplates,
    }),
    `Selected elevation PDF: ${input.sourcePdfPath}`,
    `Cut2Kit settings JSON: ${settingsFilePath}`,
    `Write the structured extracted-elevation JSON to: ${artifactPaths.geometryJsonPath}`,
    `Canonical framing example: ${promptReferencePaths.framingExamplePdf}`,
    `Canonical sheathing example: ${promptReferencePaths.sheathingExamplePdf}`,
    "Use the elevation image as the visual source of truth and use the extracted text below as supporting OCR/dimension context. Do not estimate dimensions from pixel scale when dimension text is available.",
    "Output only valid JSON matching the provided schema template. Do not include markdown fences.",
    "Dimension/OCR text extracted from the elevation PDF:",
    input.extractedText.trim().length > 0 ? input.extractedText.trim() : "(no text extracted)",
    "Emit JSON with this exact shape:",
    jsonBlock(jsonTemplate),
  ].join("\n\n");
}

export function buildCut2KitFramingLayoutPrompt(input: {
  project: Cut2KitProject;
  sourcePdfPath: string;
  geometry?: Cut2KitWallGeometry | undefined;
  promptTemplates: {
    systemPrompt: string;
    userPrompt: string;
    validationChecklist: string;
  };
}): string {
  const artifactPaths = buildWallLayoutArtifactPaths(input.project, input.sourcePdfPath);
  const settingsFilePath = input.project.settingsFilePath ?? "cut2kit.settings.json";
  const promptReferencePaths = resolveCut2KitPromptReferencePaths(input.project);
  const geometry = input.geometry;

  const jsonTemplate: Cut2KitFramingLayoutV0_2_0 = {
    schemaVersion: "0.2.0",
    sourcePdfPath: input.sourcePdfPath,
    settingsFilePath,
    units: "inch",
    geometry:
      geometry ??
      ({
        schemaVersion: "0.2.0",
        sourcePdfPath: input.sourcePdfPath,
        settingsFilePath,
        units: "inch",
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
          horizontalMarks: [],
          verticalMarks: [],
          pairingStrategy: "consecutive_pairs",
          openingTypeInference: "sill_line_detection",
        },
        openings: [],
        validation: {
          dimensionTextFound: false,
          wallDimensionsResolved: false,
          openingDimensionsResolved: false,
          wallBoundsFit: true,
          openingPairsResolved: true,
          openingTypesResolved: true,
          headHeightResolved: true,
          sillHeightResolved: true,
          conflictsDetected: false,
          ambiguityDetected: true,
          requiresUserConfirmation: true,
          notes: [],
        },
        notes: [],
      } satisfies Cut2KitWallGeometry),
    wall: {
      width: geometry?.wall.width ?? 360,
      height: geometry?.wall.height ?? 96,
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
    openings: geometry?.openings ?? [],
    members: [
      {
        id: "bottom-plate",
        kind: "bottom-plate",
        x: 0,
        y: 0,
        width: geometry?.wall.width ?? 360,
        height: 1.5,
      },
    ],
    memberSchedule: [
      {
        id: "bottom-plate",
        label: "Bottom plate",
        memberKind: "bottom-plate",
        count: 1,
        length: geometry?.wall.width ?? 360,
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
    ...buildPromptTemplateSections({
      promptTemplates: input.promptTemplates,
    }),
    `Selected elevation PDF: ${input.sourcePdfPath}`,
    `Cut2Kit settings JSON: ${settingsFilePath}`,
    `Write the structured framing-layout JSON to: ${artifactPaths.framingJsonPath}`,
    `Cut2Kit will deterministically render the framing-layout PDF to: ${artifactPaths.framingPdfPath}`,
    `Canonical framing example: ${promptReferencePaths.framingExamplePdf}`,
    ...(geometry
      ? ["Wall geometry JSON:", jsonBlock(geometry)]
      : [
          `No extracted-elevation JSON is available yet for this wall. If needed, derive and save it to ${artifactPaths.geometryJsonPath} before finalizing ${artifactPaths.framingJsonPath}.`,
        ]),
    "Output only valid JSON matching this schema template:",
    jsonBlock(jsonTemplate),
  ].join("\n\n");
}

export function buildCut2KitSheathingLayoutPrompt(input: {
  project: Cut2KitProject;
  sourcePdfPath: string;
  geometry: Cut2KitWallGeometry;
  framingLayout: Cut2KitFramingLayoutV0_2_0;
  promptTemplates: {
    systemPrompt: string;
    userPrompt: string;
    validationChecklist: string;
  };
}): string {
  const artifactPaths = buildWallLayoutArtifactPaths(input.project, input.sourcePdfPath);
  const settingsFilePath = input.project.settingsFilePath ?? "cut2kit.settings.json";
  const promptReferencePaths = resolveCut2KitPromptReferencePaths(input.project);

  const jsonTemplate: Cut2KitSheathingLayout = {
    schemaVersion: "0.2.0",
    sourcePdfPath: input.sourcePdfPath,
    settingsFilePath,
    units: "inch",
    geometry: input.geometry,
    wall: {
      width: input.geometry.wall.width,
      height: input.geometry.wall.height,
      materialLabel: "7/16 in OSB",
      panelThickness: 0.4375,
      sheetNominalWidth: 48,
      sheetNominalHeight: 96,
      installedOrientation: "vertical",
      runDirection: "left_to_right",
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
        cutouts: [],
        notes: [],
      },
    ],
    summary: {
      sheetCount: 1,
      fullSheetCount: 1,
      terminalRipWidth: 0,
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

  return [
    ...buildPromptTemplateSections({
      promptTemplates: input.promptTemplates,
    }),
    `Selected elevation PDF: ${input.sourcePdfPath}`,
    `Cut2Kit settings JSON: ${settingsFilePath}`,
    `Write the structured sheathing-layout JSON to: ${artifactPaths.sheathingJsonPath}`,
    `Cut2Kit will deterministically render the sheathing-layout PDF to: ${artifactPaths.sheathingPdfPath}`,
    `Canonical sheathing example: ${promptReferencePaths.sheathingExamplePdf}`,
    "Wall geometry JSON:",
    jsonBlock(input.geometry),
    "Framing layout JSON:",
    jsonBlock({
      wall: input.framingLayout.wall,
      studLayout: input.framingLayout.studLayout,
      openings: input.framingLayout.openings,
      memberSchedule: input.framingLayout.memberSchedule,
    }),
    "Output only valid JSON matching this schema template:",
    jsonBlock(jsonTemplate),
  ].join("\n\n");
}
