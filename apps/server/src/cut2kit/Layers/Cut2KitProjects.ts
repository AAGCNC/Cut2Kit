import fsPromises from "node:fs/promises";
import nodePath from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { Effect, Layer, Schema } from "effect";

import {
  type Cut2KitCompileManufacturingPromptResult,
  type Cut2KitCompileFramingPromptResult,
  type Cut2KitCompileSheathingPromptResult,
  type Cut2KitApplication,
  type Cut2KitFileClassification,
  type Cut2KitFileRole,
  type Cut2KitFramingLayout,
  type Cut2KitFramingLayoutV0_2_0,
  type Cut2KitGenerateOutputsResult,
  type Cut2KitGenerateWallLayoutResult,
  type Cut2KitIssue,
  type Cut2KitManufacturingPlan,
  type Cut2KitOutputSettings,
  type Cut2KitPanelCandidate,
  type Cut2KitPdfFileAssignment,
  type Cut2KitProject,
  type Cut2KitQueueMode,
  type Cut2KitQueueingSettings,
  type Cut2KitRenderFramingLayoutResult,
  type Cut2KitRenderSheathingLayoutResult,
  type Cut2KitSheathingLayout,
  type Cut2KitSettings,
  type Cut2KitSourceDocument,
  type Cut2KitValidationReportIssue,
  type Cut2KitWallGeometry,
  type Cut2KitWallValidationReport,
  Cut2KitFramingLayout as Cut2KitFramingLayoutSchema,
  Cut2KitFramingLayoutV0_2_0 as Cut2KitFramingLayoutV0_2_0Schema,
  Cut2KitManufacturingPlan as Cut2KitManufacturingPlanSchema,
  Cut2KitSettings as Cut2KitSettingsSchema,
  Cut2KitSheathingLayout as Cut2KitSheathingLayoutSchema,
  Cut2KitWallGeometry as Cut2KitWallGeometrySchema,
  type NCJobRecord,
  type NestManifest,
  type PanelManifest,
  type ProjectFileRecord,
  type QueueManifest,
} from "@t3tools/contracts";
import {
  buildCut2KitFramingLayoutPrompt,
  buildCut2KitManufacturingPlanPrompt,
  buildCut2KitSheathingLayoutPrompt,
  buildCut2KitWallGeometryPrompt,
  buildManufacturingPlanArtifactPath,
  buildWallLayoutArtifactPaths,
  resolveCut2KitAutomationModelSelection,
  resolveCut2KitPromptTemplatePaths,
} from "@t3tools/shared/cut2kit";
import { formatSchemaError, fromLenientJson } from "@t3tools/shared/schemaJson";

import {
  Cut2KitProjects,
  Cut2KitProjectsError,
  type Cut2KitProjectsShape,
} from "../Services/Cut2KitProjects.ts";
import { runCut2KitCodexJson } from "../ai/codexStructuredGeneration.ts";
import {
  loadCut2KitPromptTemplateBundle,
  loadCut2KitResolvedPromptTemplates,
} from "../ai/promptTemplates.ts";
import { A2mcPostError, getA2mcTargetController, renderA2mcProgram } from "../cam/A2mcPost.ts";
import { renderFramingLayoutPdf } from "../framing/renderFramingLayoutPdf.ts";
import { computeFitScale, resolvePageDimensions } from "../rendering/pageGeometry.ts";
import { renderSheathingLayoutPdf } from "../rendering/renderSheathingLayoutPdf.ts";
import { WorkspaceEntries } from "../../workspace/Services/WorkspaceEntries.ts";
import { WorkspacePaths } from "../../workspace/Services/WorkspacePaths.ts";

const SETTINGS_FILE_NAME = "cut2kit.settings.json";
const MANUFACTURING_PLAN_FILE_NAME = "cut2kit.manufacturing.json";
const MANIFEST_VERSION = "cut2kit.planning.v1";
const DEFAULT_DISCOVERED_AT = "1970-01-01T00:00:00.000Z";
const IGNORED_DIRECTORY_NAMES = new Set([".git", "node_modules", ".turbo", "dist", "build"]);
const SettingsJson = fromLenientJson(Cut2KitSettingsSchema);
const ManufacturingPlanJson = fromLenientJson(Cut2KitManufacturingPlanSchema);
const FramingLayoutJson = fromLenientJson(Cut2KitFramingLayoutSchema);
const SheathingLayoutJson = fromLenientJson(Cut2KitSheathingLayoutSchema);
const WallGeometryJson = fromLenientJson(Cut2KitWallGeometrySchema);
const execFileAsync = promisify(execFile);

type Cut2KitWallWorkflowSettings = typeof Cut2KitSettingsSchema.Type;

const DEFAULT_OUTPUT_SETTINGS: Cut2KitOutputSettings = {
  root: "output",
  manifestsDir: "output/manifests",
  ncDir: "output/nc",
  reportsDir: "output/reports",
  overwritePolicy: "overwrite",
};

const DEFAULT_QUEUEING_SETTINGS: Cut2KitQueueingSettings = {
  kitting: {
    enabled: true,
    groupBy: "assembly_zone",
    sequence: ["front", "left", "right", "rear", "floor", "roof"],
    outputPrefix: "KIT",
  },
  lineSide: {
    enabled: true,
    groupBy: "production_flow",
    sequence: ["floor", "walls", "roof"],
    outputPrefix: "LINE",
  },
};

type ScannedFileRecord = ProjectFileRecord;

function toPosixPath(input: string): string {
  return input.replaceAll("\\", "/");
}

function splitSegments(input: string): string[] {
  return toPosixPath(input)
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

function fileDepth(relativePath: string): number {
  return Math.max(0, splitSegments(relativePath).length - 1);
}

function inferSide(relativePath: string): string | null {
  const candidates = new Set(
    splitSegments(relativePath)
      .join(" ")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 0),
  );
  for (const side of ["front", "rear", "left", "right", "east", "west", "north", "south"]) {
    if (candidates.has(side)) {
      return side;
    }
  }
  return null;
}

function isLikelySourcePdf(relativePath: string): boolean {
  const normalized = toPosixPath(relativePath).toLowerCase();
  if (!normalized.endsWith(".pdf")) {
    return false;
  }
  if (normalized.startsWith("output/") || normalized.includes(".framing-layout.")) {
    return false;
  }

  return (
    normalized.includes("/elevation") ||
    normalized.includes("/elevations/") ||
    normalized.includes("elevation") ||
    normalized.includes("/floor/") ||
    normalized.includes("floor") ||
    normalized.includes("/roof/") ||
    normalized.includes("roof") ||
    normalized.includes("framing") ||
    normalized.includes("wall") ||
    inferSide(relativePath) !== null
  );
}

function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/g, "")
    .replace(/-+$/g, "");
  return slug.length > 0 ? slug : "item";
}

function makeIssue(
  severity: Cut2KitIssue["severity"],
  code: string,
  message: string,
  path?: string,
): Cut2KitIssue {
  return {
    severity,
    code,
    message,
    ...(path ? { path } : {}),
  };
}

function classifyEntry(input: { relativePath: string; kind: ProjectFileRecord["kind"] }): {
  classification: Cut2KitFileClassification;
  role: Cut2KitFileRole;
  extension?: string;
} {
  if (input.kind === "directory") {
    return {
      classification: "directory",
      role: "other",
    };
  }

  const normalizedPath = toPosixPath(input.relativePath).toLowerCase();
  const extension = nodePath.extname(normalizedPath).replace(/^\./, "");

  if (normalizedPath === SETTINGS_FILE_NAME || normalizedPath.endsWith(`/${SETTINGS_FILE_NAME}`)) {
    return {
      classification: "settings",
      role: "settings",
      extension: "json",
    };
  }
  if (
    normalizedPath === MANUFACTURING_PLAN_FILE_NAME ||
    normalizedPath.endsWith(`/${MANUFACTURING_PLAN_FILE_NAME}`)
  ) {
    return {
      classification: "manufacturing-plan",
      role: "manufacturing-plan",
      extension: "json",
    };
  }
  if (
    normalizedPath.endsWith(".framing-layout.pdf") ||
    normalizedPath.endsWith(".sheathing-layout.pdf")
  ) {
    return {
      classification: "pdf",
      role: "generated-report",
      extension: "pdf",
    };
  }
  if (
    normalizedPath.endsWith(".framing-layout.json") ||
    normalizedPath.endsWith(".sheathing-layout.json") ||
    normalizedPath.endsWith(".extracted-elevation.json") ||
    normalizedPath.endsWith(".validation-report.json")
  ) {
    return {
      classification: "json",
      role: "generated-report",
      extension: "json",
    };
  }
  if (normalizedPath.startsWith("output/manifests/") && normalizedPath.endsWith(".json")) {
    return {
      classification: "manifest",
      role: "generated-manifest",
      extension: "json",
    };
  }
  if (normalizedPath.startsWith("output/nc/") && normalizedPath.endsWith(".nc")) {
    return {
      classification: "nc",
      role: "generated-nc",
      extension: "nc",
    };
  }
  if (normalizedPath.endsWith(".json")) {
    return {
      classification: "json",
      role: "reference",
      extension: "json",
    };
  }
  if (normalizedPath.endsWith(".pdf")) {
    return {
      classification: "pdf",
      role: isLikelySourcePdf(input.relativePath) ? "source-pdf" : "reference",
      extension: "pdf",
    };
  }
  if (/\.(png|jpe?g|gif|webp|bmp)$/i.test(normalizedPath)) {
    return {
      classification: "image",
      role: "reference",
      extension,
    };
  }
  if (/\.(txt|md|csv)$/i.test(normalizedPath)) {
    return {
      classification: "text",
      role: "reference",
      extension,
    };
  }
  return {
    classification: "other",
    role: "other",
    ...(extension ? { extension } : {}),
  };
}

function compareProjectFiles(left: ProjectFileRecord, right: ProjectFileRecord): number {
  if (left.depth !== right.depth) {
    return left.depth - right.depth;
  }
  if (left.kind !== right.kind) {
    return left.kind === "directory" ? -1 : 1;
  }
  return left.relativePath.localeCompare(right.relativePath);
}

async function scanProjectFiles(cwd: string, relativeDir = ""): Promise<ScannedFileRecord[]> {
  const absoluteDir = relativeDir.length > 0 ? nodePath.join(cwd, relativeDir) : cwd;
  const dirents = await fsPromises.readdir(absoluteDir, { withFileTypes: true });
  dirents.sort((left, right) => left.name.localeCompare(right.name));

  const records: ScannedFileRecord[] = [];
  for (const dirent of dirents) {
    const relativePath = relativeDir.length > 0 ? `${relativeDir}/${dirent.name}` : dirent.name;
    const depth = fileDepth(relativePath);
    const parentPath = depth > 0 ? splitSegments(relativePath).slice(0, -1).join("/") : undefined;
    const baseRecord = {
      relativePath,
      name: dirent.name,
      ...(parentPath ? { parentPath } : {}),
      depth,
    } as const;

    if (dirent.isDirectory()) {
      if (IGNORED_DIRECTORY_NAMES.has(dirent.name)) {
        continue;
      }
      records.push({
        ...baseRecord,
        kind: "directory",
        classification: "directory",
        role: "other",
        sizeBytes: null,
      });
      const childRecords = await scanProjectFiles(cwd, relativePath);
      records.push(...childRecords);
      continue;
    }

    if (!dirent.isFile()) {
      continue;
    }

    const absolutePath = nodePath.join(cwd, relativePath);
    const stat = await fsPromises.stat(absolutePath);
    const classification = classifyEntry({ relativePath, kind: "file" });
    records.push({
      ...baseRecord,
      kind: "file",
      classification: classification.classification,
      role: classification.role,
      ...(classification.extension ? { extension: classification.extension } : {}),
      sizeBytes: Math.max(0, Math.trunc(stat.size)),
    });
  }

  return records;
}

function chooseSettingsFile(files: ReadonlyArray<ProjectFileRecord>): string | null {
  const candidates = files
    .filter((entry) => entry.kind === "file" && entry.role === "settings")
    .map((entry) => entry.relativePath)
    .toSorted((left, right) => {
      const depthDelta = fileDepth(left) - fileDepth(right);
      if (depthDelta !== 0) return depthDelta;
      return left.localeCompare(right);
    });
  return candidates[0] ?? null;
}

function chooseManufacturingPlanFile(files: ReadonlyArray<ProjectFileRecord>): string | null {
  const candidates = files
    .filter((entry) => entry.kind === "file" && entry.role === "manufacturing-plan")
    .map((entry) => entry.relativePath)
    .toSorted((left, right) => {
      const depthDelta = fileDepth(left) - fileDepth(right);
      if (depthDelta !== 0) return depthDelta;
      return left.localeCompare(right);
    });
  return candidates[0] ?? null;
}

function escapeRegExp(input: string): string {
  return input.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

function globToRegExp(pattern: string): RegExp {
  const normalized = toPosixPath(pattern.trim().toLowerCase());
  let source = escapeRegExp(normalized);
  source = source.replaceAll("\\*\\*", ".*");
  source = source.replaceAll("\\*", "[^/]*");
  return new RegExp(`^${source}$`, "i");
}

function matchAssignmentPattern(
  relativePath: string,
  assignment: Cut2KitPdfFileAssignment,
): boolean {
  return globToRegExp(assignment.pathPattern).test(toPosixPath(relativePath).toLowerCase());
}

function inferSourceDocument(
  relativePath: string,
  settings: Cut2KitSettings | null,
): Cut2KitSourceDocument {
  const fileName = nodePath.basename(relativePath);
  const assignment = settings?.input.fileAssignments.find((candidate) =>
    matchAssignmentPattern(relativePath, candidate),
  );
  if (assignment) {
    return {
      sourcePath: relativePath,
      fileName,
      classification: assignment.classification,
      application: assignment.application,
      side: assignment.side ?? inferSide(relativePath),
      assignmentSource: "settings",
    };
  }

  const normalized = toPosixPath(relativePath).toLowerCase();
  const side = inferSide(relativePath);
  if (normalized.includes("/floor/") || normalized.includes("floor")) {
    return {
      sourcePath: relativePath,
      fileName,
      classification: "floor",
      application: "flooring",
      side,
      assignmentSource: "path",
    };
  }
  if (normalized.includes("/roof/") || normalized.includes("roof")) {
    return {
      sourcePath: relativePath,
      fileName,
      classification: "roof",
      application: "roofing",
      side,
      assignmentSource: "path",
    };
  }
  if (
    normalized.includes("/elevation") ||
    normalized.includes("/elevations/") ||
    normalized.includes("elevation") ||
    normalized.includes("wall") ||
    side
  ) {
    return {
      sourcePath: relativePath,
      fileName,
      classification: "elevation",
      application: "siding",
      side,
      assignmentSource: "path",
    };
  }

  return {
    sourcePath: relativePath,
    fileName,
    classification: "unknown",
    application: null,
    side: null,
    assignmentSource: "default",
  };
}

function hasPdfAssignmentMatch(relativePath: string, settings: Cut2KitSettings | null): boolean {
  return (
    settings?.input.fileAssignments.some((candidate) =>
      matchAssignmentPattern(relativePath, candidate),
    ) ?? false
  );
}

function getPrimaryQueueMode(_settings: Cut2KitSettings | null): Cut2KitQueueMode {
  return "kitting";
}

function resolveOutputSettings(settings: Cut2KitSettings | null): Cut2KitOutputSettings {
  return settings?.output ?? DEFAULT_OUTPUT_SETTINGS;
}

function resolveQueueingSettings(_settings: Cut2KitSettings | null): Cut2KitQueueingSettings {
  return DEFAULT_QUEUEING_SETTINGS;
}

function projectIdFor(settings: Cut2KitSettings | null, cwd: string): string {
  return settings?.project.projectId ?? slugify(nodePath.basename(cwd));
}

function projectNameFor(settings: Cut2KitSettings | null, cwd: string): string {
  return settings?.project.jobName ?? nodePath.basename(cwd) ?? cwd;
}

function queueGroupFor(
  sourceDocument: Cut2KitSourceDocument,
  mode: Cut2KitQueueMode,
  queueingSettings: Cut2KitQueueingSettings,
): string {
  const groupBy =
    mode === "line-side" ? queueingSettings.lineSide.groupBy : queueingSettings.kitting.groupBy;
  switch (groupBy) {
    case "house_side":
      return sourceDocument.side ?? "general";
    case "production_flow":
      if (sourceDocument.classification === "floor") return "floor";
      if (sourceDocument.classification === "roof") return "roof";
      return "walls";
    case "assembly_zone":
    default:
      return sourceDocument.side ?? sourceDocument.application ?? "general";
  }
}

function buildPanelCandidates(
  sourceDocuments: ReadonlyArray<Cut2KitSourceDocument>,
  queueingSettings: Cut2KitQueueingSettings,
): Cut2KitPanelCandidate[] {
  return sourceDocuments
    .toSorted((left, right) => left.sourcePath.localeCompare(right.sourcePath))
    .map((sourceDocument, index) => ({
      panelId: `panel-${String(index + 1).padStart(3, "0")}-${slugify(sourceDocument.sourcePath)}`,
      sourcePath: sourceDocument.sourcePath,
      application: sourceDocument.application,
      side: sourceDocument.side,
      placeholderStrategy: "single-source-pdf-placeholder",
      kitGroup: queueGroupFor(sourceDocument, "kitting", queueingSettings),
    }));
}

function buildPanelManifest(input: {
  projectId: string;
  primaryMode: Cut2KitQueueMode;
  panelCandidates: ReadonlyArray<Cut2KitPanelCandidate>;
}): PanelManifest {
  return {
    manifestVersion: MANIFEST_VERSION,
    projectId: input.projectId,
    mode: input.primaryMode,
    panels: input.panelCandidates.map((candidate) => ({
      panelId: candidate.panelId,
      sourcePath: candidate.sourcePath,
      application: candidate.application,
      side: candidate.side,
      kitGroup: candidate.kitGroup,
      placeholderOnly: true,
    })),
  };
}

function buildNestManifest(input: {
  projectId: string;
  panelCandidates: ReadonlyArray<Cut2KitPanelCandidate>;
}): NestManifest {
  const panelIdsByApplication = new Map<string, string[]>();
  for (const panel of input.panelCandidates) {
    const key = panel.application ?? "unassigned";
    const bucket = panelIdsByApplication.get(key) ?? [];
    bucket.push(panel.panelId);
    panelIdsByApplication.set(key, bucket);
  }

  const nests = [...panelIdsByApplication.entries()]
    .toSorted(([left], [right]) => left.localeCompare(right))
    .map(([application, panelIds], index) => ({
      nestId: `nest-${String(index + 1).padStart(3, "0")}-${slugify(application)}`,
      application: application === "unassigned" ? null : (application as Cut2KitApplication),
      panelIds: panelIds.toSorted(),
      placeholderOnly: true,
    }));

  return {
    manifestVersion: MANIFEST_VERSION,
    projectId: input.projectId,
    nests,
  };
}

function buildQueueArtifacts(input: {
  projectId: string;
  projectName: string;
  sourceDocuments: ReadonlyArray<Cut2KitSourceDocument>;
  queueingSettings: Cut2KitQueueingSettings;
  outputSettings: Cut2KitOutputSettings;
  primaryMode: Cut2KitQueueMode;
  manufacturingPlanFilePath: string | null;
  manufacturingPlan: Cut2KitManufacturingPlan | null;
}): {
  queueManifest: QueueManifest;
  ncJobs: NCJobRecord[];
  issues: Cut2KitIssue[];
} {
  const emptyResult = {
    queueManifest: {
      manifestVersion: MANIFEST_VERSION,
      projectId: input.projectId,
      primaryMode: input.primaryMode,
      entries: [],
    },
    ncJobs: [],
    issues: [],
  } satisfies {
    queueManifest: QueueManifest;
    ncJobs: NCJobRecord[];
    issues: Cut2KitIssue[];
  };

  if (input.manufacturingPlan === null || input.manufacturingPlanFilePath === null) {
    return emptyResult;
  }

  const sourceDocumentsByPath = new Map(
    input.sourceDocuments.map((sourceDocument) => [sourceDocument.sourcePath, sourceDocument]),
  );
  const entries: Array<QueueManifest["entries"][number]> = [];
  const ncJobs: NCJobRecord[] = [];
  const issues: Cut2KitIssue[] = [];

  for (const [index, job] of input.manufacturingPlan.jobs.entries()) {
    const sourceDocument = sourceDocumentsByPath.get(job.sourcePath);
    if (!sourceDocument) {
      issues.push(
        makeIssue(
          "error",
          "manufacturing_plan.unknown_source",
          `Manufacturing job '${job.jobId}' references '${job.sourcePath}', which is not a discovered PDF source document.`,
          input.manufacturingPlanFilePath,
        ),
      );
      continue;
    }

    const queueGroup = queueGroupFor(sourceDocument, input.primaryMode, input.queueingSettings);
    const sequenceIndex = index;
    const relativeOutputPath = `${input.outputSettings.ncDir}/${String(sequenceIndex + 1).padStart(3, "0")}-${slugify(queueGroup)}-${slugify(job.jobId)}.nc`;

    try {
      const program = renderA2mcProgram({
        projectName: input.projectName,
        planSourcePath: input.manufacturingPlanFilePath,
        plan: input.manufacturingPlan,
        job,
      });

      entries.push({
        queueId: `queue-${slugify(queueGroup)}`,
        mode: input.primaryMode,
        jobId: job.jobId,
        sourcePath: job.sourcePath,
        groupKey: queueGroup,
        sequenceIndex,
        application: sourceDocument.application,
      });

      ncJobs.push({
        jobId: job.jobId,
        sourcePath: job.sourcePath,
        planSourcePath: input.manufacturingPlanFilePath,
        relativeOutputPath,
        queueMode: input.primaryMode,
        queueGroup,
        sequenceIndex,
        application: sourceDocument.application,
        targetController: getA2mcTargetController(),
        operationCount: job.operations.length,
        program,
      });
    } catch (error) {
      const detail =
        error instanceof A2mcPostError || error instanceof Error ? error.message : String(error);
      issues.push(
        makeIssue(
          "error",
          "manufacturing_plan.job_invalid",
          `Manufacturing job '${job.jobId}' cannot be posted for A2MC: ${detail}`,
          input.manufacturingPlanFilePath,
        ),
      );
    }
  }

  if (issues.length > 0) {
    return {
      ...emptyResult,
      issues,
    };
  }

  return {
    queueManifest: {
      manifestVersion: MANIFEST_VERSION,
      projectId: input.projectId,
      primaryMode: input.primaryMode,
      entries,
    },
    ncJobs,
    issues,
  };
}

function existingFilePathsByRole(
  files: ReadonlyArray<ProjectFileRecord>,
  role: Cut2KitFileRole,
): Set<string> {
  return new Set(
    files
      .filter((entry) => entry.kind === "file" && entry.role === role)
      .map((entry) => entry.relativePath),
  );
}

async function readSettingsFile(
  cwd: string,
  relativePath: string,
): Promise<{ settings: Cut2KitSettings | null; issues: Cut2KitIssue[] }> {
  try {
    const raw = await fsPromises.readFile(nodePath.join(cwd, relativePath), "utf8");
    const decoded = Schema.decodeUnknownExit(SettingsJson)(raw);
    if (decoded._tag === "Failure") {
      return {
        settings: null,
        issues: [
          makeIssue("error", "settings.invalid", formatSchemaError(decoded.cause), relativePath),
        ],
      };
    }
    return {
      settings: decoded.value,
      issues: [],
    };
  } catch (error) {
    return {
      settings: null,
      issues: [
        makeIssue(
          "error",
          "settings.read_failed",
          error instanceof Error ? error.message : String(error),
          relativePath,
        ),
      ],
    };
  }
}

async function readManufacturingPlanFile(
  cwd: string,
  relativePath: string,
): Promise<{ manufacturingPlan: Cut2KitManufacturingPlan | null; issues: Cut2KitIssue[] }> {
  try {
    const raw = await fsPromises.readFile(nodePath.join(cwd, relativePath), "utf8");
    const decoded = Schema.decodeUnknownExit(ManufacturingPlanJson)(raw);
    if (decoded._tag === "Failure") {
      return {
        manufacturingPlan: null,
        issues: [
          makeIssue(
            "error",
            "manufacturing_plan.invalid",
            formatSchemaError(decoded.cause),
            relativePath,
          ),
        ],
      };
    }
    return {
      manufacturingPlan: decoded.value,
      issues: [],
    };
  } catch (error) {
    return {
      manufacturingPlan: null,
      issues: [
        makeIssue(
          "error",
          "manufacturing_plan.read_failed",
          error instanceof Error ? error.message : String(error),
          relativePath,
        ),
      ],
    };
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function normalizeDimensionMarks(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => {
      if (typeof entry === "number" && Number.isFinite(entry)) {
        return entry;
      }
      const record = asRecord(entry);
      return asFiniteNumber(record?.value);
    })
    .filter((entry): entry is number => entry !== null);
}

function normalizeCompatibleOpening(
  value: unknown,
): Cut2KitWallGeometry["openings"][number] | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const id = asString(record.id);
  const kind = (asString(record.kind) ?? asString(record.type)) as
    | Cut2KitWallGeometry["openings"][number]["kind"]
    | null;
  const left = asFiniteNumber(record.left) ?? asFiniteNumber(record.x);
  const bottom =
    asFiniteNumber(record.bottom) ??
    asFiniteNumber(record.y) ??
    asFiniteNumber(record.sillHeight) ??
    0;
  const width =
    asFiniteNumber(record.width) ??
    (() => {
      const right = asFiniteNumber(record.right);
      return left !== null && right !== null ? right - left : null;
    })();
  const height =
    asFiniteNumber(record.height) ??
    (() => {
      const top = asFiniteNumber(record.top) ?? asFiniteNumber(record.headHeight);
      return top !== null ? top - bottom : null;
    })();
  const right =
    asFiniteNumber(record.right) ?? (left !== null && width !== null ? left + width : null);
  const top =
    asFiniteNumber(record.top) ??
    asFiniteNumber(record.headHeight) ??
    (bottom !== null && height !== null ? bottom + height : null);

  if (
    id === null ||
    (kind !== "window" && kind !== "door") ||
    left === null ||
    right === null ||
    bottom === null ||
    top === null ||
    width === null ||
    height === null
  ) {
    return null;
  }

  return {
    id,
    kind,
    left,
    right,
    bottom,
    top,
    width,
    height,
    clearOpening: asBoolean(record.clearOpening) ?? true,
  };
}

function normalizeCompatibleMemberKind(
  value: unknown,
): Cut2KitFramingLayoutV0_2_0["members"][number]["kind"] | null {
  const kind = asString(value);
  switch (kind) {
    case "bottom-plate":
    case "top-plate":
    case "end-stud":
    case "jamb-stud":
    case "common-stud":
      return kind;
    case "head-member":
      return "header";
    case "sill-member":
      return "sill";
    case "cripple-stud":
    case "cripple-stud-above-head":
    case "cripple-stud-below-sill":
      return "cripple-stud";
    default:
      return null;
  }
}

function normalizeCompatibleMember(
  value: unknown,
): Cut2KitFramingLayoutV0_2_0["members"][number] | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const id = asString(record.id);
  const kind = normalizeCompatibleMemberKind(record.kind);
  const x = asFiniteNumber(record.x);
  const y = asFiniteNumber(record.y);
  const width = asFiniteNumber(record.width);
  const height = asFiniteNumber(record.height);
  if (
    id === null ||
    kind === null ||
    x === null ||
    y === null ||
    width === null ||
    height === null
  ) {
    return null;
  }

  return {
    id,
    kind,
    x,
    y,
    width,
    height,
    ...((asFiniteNumber(record.centerlineX) ?? asFiniteNumber(record.centerline) ?? null) !== null
      ? {
          centerlineX:
            asFiniteNumber(record.centerlineX) ?? (asFiniteNumber(record.centerline) as number),
        }
      : {}),
    ...((asString(record.sourceOpeningId) ?? asString(record.openingId) ?? null) !== null
      ? {
          sourceOpeningId:
            asString(record.sourceOpeningId) ?? (asString(record.openingId) as string),
        }
      : {}),
    ...(asString(record.notes) !== null ? { notes: asString(record.notes) as string } : {}),
  };
}

function normalizeCompatibleMemberScheduleItem(
  value: unknown,
): Cut2KitFramingLayoutV0_2_0["memberSchedule"][number] | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const id = asString(record.id);
  const label = asString(record.label);
  const memberKind = normalizeCompatibleMemberKind(record.memberKind);
  const count = asFiniteNumber(record.count);
  const length = asFiniteNumber(record.length);
  if (
    id === null ||
    label === null ||
    memberKind === null ||
    count === null ||
    !Number.isInteger(count) ||
    count < 1 ||
    length === null
  ) {
    return null;
  }
  return {
    id,
    label,
    memberKind,
    count,
    length,
    ...(asString(record.notes) !== null ? { notes: asString(record.notes) as string } : {}),
  };
}

function normalizeCompatibleGeometryValidation(value: unknown): Cut2KitWallGeometry["validation"] {
  const record = asRecord(value);
  return {
    dimensionTextFound: asBoolean(record?.dimensionTextFound) ?? false,
    wallDimensionsResolved: asBoolean(record?.wallDimensionsResolved) ?? false,
    openingDimensionsResolved: asBoolean(record?.openingDimensionsResolved) ?? false,
    wallBoundsFit: asBoolean(record?.wallBoundsFit) ?? false,
    openingPairsResolved: asBoolean(record?.openingPairsResolved) ?? false,
    openingTypesResolved: asBoolean(record?.openingTypesResolved) ?? false,
    headHeightResolved: asBoolean(record?.headHeightResolved) ?? false,
    sillHeightResolved: asBoolean(record?.sillHeightResolved) ?? false,
    conflictsDetected: asBoolean(record?.conflictsDetected) ?? false,
    ambiguityDetected: asBoolean(record?.ambiguityDetected) ?? false,
    requiresUserConfirmation: asBoolean(record?.requiresUserConfirmation) ?? false,
    notes: asStringArray(record?.notes),
  };
}

function normalizeCompatibleFramingValidation(
  value: unknown,
): Cut2KitFramingLayoutV0_2_0["validation"] {
  const record = asRecord(value);
  return {
    wallWidthMatchesElevation: asBoolean(record?.wallWidthMatchesElevation) ?? false,
    wallHeightMatchesElevation: asBoolean(record?.wallHeightMatchesElevation) ?? false,
    openingSizesMatchElevation: asBoolean(record?.openingSizesMatchElevation) ?? false,
    headHeightMatchesElevation: asBoolean(record?.headHeightMatchesElevation) ?? false,
    sillHeightMatchesElevation: asBoolean(record?.sillHeightMatchesElevation) ?? false,
    endStudsDoubled: asBoolean(record?.endStudsDoubled) ?? false,
    jambStudsPresent: asBoolean(record?.jambStudsPresent) ?? false,
    commonStudSpacingApplied: asBoolean(record?.commonStudSpacingApplied) ?? false,
    noCommonStudThroughVoid: asBoolean(record?.noCommonStudThroughVoid) ?? false,
    plateOrientationMatchesExpectation:
      asBoolean(record?.plateOrientationMatchesExpectation) ?? false,
    notes: asStringArray(record?.notes),
  };
}

function normalizeCompatibleGeometry(
  value: unknown,
  sourcePdfPath: string,
  settingsFilePath: string,
): Cut2KitWallGeometry | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const wall = asRecord(record.wall);
  const commonHeights = asRecord(record.commonHeights);
  const dimensionText = asRecord(record.dimensionText);
  const openings = Array.isArray(record.openings)
    ? record.openings
        .map((opening) => normalizeCompatibleOpening(opening))
        .filter((opening): opening is Cut2KitWallGeometry["openings"][number] => opening !== null)
    : [];
  const wallWidth = asFiniteNumber(wall?.width);
  const wallHeight = asFiniteNumber(wall?.height);
  const head = asFiniteNumber(commonHeights?.head);
  const windowSill = asFiniteNumber(commonHeights?.windowSill);
  if (wallWidth === null || wallHeight === null || head === null || windowSill === null) {
    return null;
  }
  return {
    schemaVersion: "0.2.0",
    sourcePdfPath,
    settingsFilePath,
    units: "inch",
    wall: {
      width: wallWidth,
      height: wallHeight,
      pageLeft: asFiniteNumber(wall?.pageLeft) ?? 0,
      pageRight: asFiniteNumber(wall?.pageRight) ?? wallWidth,
      pageTop: asFiniteNumber(wall?.pageTop) ?? wallHeight,
      pageBottom: asFiniteNumber(wall?.pageBottom) ?? 0,
    },
    commonHeights: {
      head,
      windowSill,
    },
    dimensionText: {
      horizontalMarks: normalizeDimensionMarks(dimensionText?.horizontalMarks),
      verticalMarks: normalizeDimensionMarks(dimensionText?.verticalMarks),
      pairingStrategy: "consecutive_pairs",
      openingTypeInference: "sill_line_detection",
    },
    openings,
    validation: normalizeCompatibleGeometryValidation(record.validation),
    notes: asStringArray(record.notes),
  };
}

function normalizeCompatibleFramingLayout(value: unknown): Cut2KitFramingLayoutV0_2_0 | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const sourcePdfPath = asString(record.sourcePdfPath);
  const settingsFilePath = asString(record.settingsFilePath);
  const wall = asRecord(record.wall);
  const studLayout = asRecord(record.studLayout);
  const geometry = normalizeCompatibleGeometry(
    record.geometry,
    sourcePdfPath ?? "",
    settingsFilePath ?? "",
  );
  const openingsSource = Array.isArray(record.openings)
    ? record.openings
    : (geometry?.openings ?? []);
  const openings = openingsSource
    .map((opening) => normalizeCompatibleOpening(opening))
    .filter((opening): opening is Cut2KitWallGeometry["openings"][number] => opening !== null);
  const members = Array.isArray(record.members)
    ? record.members
        .map((member) => normalizeCompatibleMember(member))
        .filter(
          (member): member is Cut2KitFramingLayoutV0_2_0["members"][number] => member !== null,
        )
    : [];
  const memberSchedule = Array.isArray(record.memberSchedule)
    ? record.memberSchedule
        .map((item) => normalizeCompatibleMemberScheduleItem(item))
        .filter(
          (item): item is Cut2KitFramingLayoutV0_2_0["memberSchedule"][number] => item !== null,
        )
    : [];
  const wallWidth = asFiniteNumber(wall?.width);
  const wallHeight = asFiniteNumber(wall?.height);
  const memberThickness = asFiniteNumber(wall?.memberThickness);
  const studNominalSize = asString(wall?.studNominalSize);
  const material = asString(wall?.material);
  const topMemberOrientation = asString(wall?.topMemberOrientation);
  const bottomMemberOrientation = asString(wall?.bottomMemberOrientation);
  const originEdge = asString(studLayout?.originEdge);
  const spacing = asFiniteNumber(studLayout?.spacing);
  const commonStudCenterlines = Array.isArray(studLayout?.commonStudCenterlines)
    ? studLayout.commonStudCenterlines.filter(
        (entry): entry is number => typeof entry === "number" && Number.isFinite(entry),
      )
    : [];

  if (
    sourcePdfPath === null ||
    settingsFilePath === null ||
    geometry === null ||
    wallWidth === null ||
    wallHeight === null ||
    memberThickness === null ||
    studNominalSize === null ||
    material === null ||
    (topMemberOrientation !== "flat" && topMemberOrientation !== "on_edge") ||
    (bottomMemberOrientation !== "flat" && bottomMemberOrientation !== "on_edge") ||
    (originEdge !== "left" && originEdge !== "right") ||
    spacing === null ||
    members.length === 0
  ) {
    return null;
  }

  const normalized = {
    schemaVersion: "0.2.0",
    sourcePdfPath,
    settingsFilePath,
    units: "inch",
    geometry,
    wall: {
      width: wallWidth,
      height: wallHeight,
      memberThickness,
      studNominalSize,
      material,
      topMemberOrientation,
      bottomMemberOrientation,
    },
    studLayout: {
      originEdge,
      spacing,
      commonStudCenterlines,
    },
    openings,
    members,
    memberSchedule,
    validation: normalizeCompatibleFramingValidation(record.validation),
    notes: asStringArray(record.notes),
  };

  const decoded = Schema.decodeUnknownExit(Cut2KitFramingLayoutV0_2_0Schema)(normalized);
  return decoded._tag === "Success" ? decoded.value : null;
}

function normalizeCompatibleSheathingLayout(
  value: unknown,
  settings: Cut2KitWallWorkflowSettings | null = null,
): Cut2KitSheathingLayout | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const sheets = Array.isArray(record.sheets)
    ? record.sheets.map((sheet) => {
        const sheetRecord = asRecord(sheet);
        if (!sheetRecord) {
          return sheet;
        }

        const cutouts = Array.isArray(sheetRecord.cutouts)
          ? sheetRecord.cutouts.map((cutout) => {
              const cutoutRecord = asRecord(cutout);
              if (!cutoutRecord) {
                return cutout;
              }

              const sourceOpeningId =
                asString(cutoutRecord.sourceOpeningId) ?? asString(cutoutRecord.openingId);
              return sourceOpeningId === null
                ? cutoutRecord
                : {
                    ...cutoutRecord,
                    sourceOpeningId,
                  };
            })
          : sheetRecord.cutouts;

        return {
          ...sheetRecord,
          cutouts,
        };
      })
    : record.sheets;

  const normalized = {
    ...record,
    sheets,
    fastening:
      asRecord(record.fastening) ??
      (settings
        ? {
            supportedEdgeSpacing: settings.fastening.supportedEdgeSpacing,
            fieldSpacing: settings.fastening.fieldSpacing,
            edgeDistance: settings.fastening.edgeDistance,
            typicalReferenceOnly: settings.fastening.typicalReferenceOnly,
            noteLines: settings.fastening.noteLines,
            disclaimerText: settings.fastening.disclaimerText,
          }
        : undefined),
  };

  const decoded = Schema.decodeUnknownExit(Cut2KitSheathingLayoutSchema)(normalized);
  return decoded._tag === "Success" ? decoded.value : null;
}

async function readFramingLayoutFile(
  cwd: string,
  relativePath: string,
): Promise<{ framingLayout: Cut2KitFramingLayout | null; issues: Cut2KitIssue[] }> {
  try {
    const raw = await fsPromises.readFile(nodePath.join(cwd, relativePath), "utf8");
    const decoded = Schema.decodeUnknownExit(FramingLayoutJson)(raw);
    if (decoded._tag === "Failure") {
      try {
        const parsed = JSON.parse(raw) as unknown;
        const normalized = normalizeCompatibleFramingLayout(parsed);
        if (normalized !== null) {
          return {
            framingLayout: normalized,
            issues: [],
          };
        }
      } catch {
        // Fall through to the original schema error below.
      }
      return {
        framingLayout: null,
        issues: [
          makeIssue(
            "error",
            "framing_layout.invalid",
            formatSchemaError(decoded.cause),
            relativePath,
          ),
        ],
      };
    }
    return {
      framingLayout: decoded.value,
      issues: [],
    };
  } catch (error) {
    return {
      framingLayout: null,
      issues: [
        makeIssue(
          "error",
          "framing_layout.read_failed",
          error instanceof Error ? error.message : String(error),
          relativePath,
        ),
      ],
    };
  }
}

async function readWallGeometryFile(
  cwd: string,
  relativePath: string,
): Promise<{ geometry: Cut2KitWallGeometry | null; issues: Cut2KitIssue[] }> {
  try {
    const raw = await fsPromises.readFile(nodePath.join(cwd, relativePath), "utf8");
    const decoded = Schema.decodeUnknownExit(WallGeometryJson)(raw);
    if (decoded._tag === "Failure") {
      return {
        geometry: null,
        issues: [
          makeIssue(
            "error",
            "wall_geometry.invalid",
            formatSchemaError(decoded.cause),
            relativePath,
          ),
        ],
      };
    }
    return {
      geometry: decoded.value,
      issues: [],
    };
  } catch (error) {
    return {
      geometry: null,
      issues: [
        makeIssue(
          "error",
          "wall_geometry.read_failed",
          error instanceof Error ? error.message : String(error),
          relativePath,
        ),
      ],
    };
  }
}

async function readSheathingLayoutFile(
  cwd: string,
  relativePath: string,
  settings: Cut2KitWallWorkflowSettings | null = null,
): Promise<{ sheathingLayout: Cut2KitSheathingLayout | null; issues: Cut2KitIssue[] }> {
  try {
    const raw = await fsPromises.readFile(nodePath.join(cwd, relativePath), "utf8");
    const decoded = Schema.decodeUnknownExit(SheathingLayoutJson)(raw);
    if (decoded._tag === "Failure") {
      try {
        const parsed = JSON.parse(raw) as unknown;
        const normalized = normalizeCompatibleSheathingLayout(parsed, settings);
        if (normalized !== null) {
          return {
            sheathingLayout: normalized,
            issues: [],
          };
        }
      } catch {
        // Fall through to the original schema error below.
      }
      return {
        sheathingLayout: null,
        issues: [
          makeIssue(
            "error",
            "sheathing_layout.invalid",
            formatSchemaError(decoded.cause),
            relativePath,
          ),
        ],
      };
    }
    return {
      sheathingLayout: decoded.value,
      issues: [],
    };
  } catch (error) {
    return {
      sheathingLayout: null,
      issues: [
        makeIssue(
          "error",
          "sheathing_layout.read_failed",
          error instanceof Error ? error.message : String(error),
          relativePath,
        ),
      ],
    };
  }
}

function roundToQuarterInch(value: number): number {
  return Math.round(value * 4) / 4;
}

function isWallWorkflowSettings(
  settings: Cut2KitSettings | null,
): settings is Cut2KitWallWorkflowSettings {
  return settings !== null;
}

function normalizeOpening<T extends Cut2KitWallGeometry["openings"][number]>(opening: T): T {
  const left = Math.min(opening.left, opening.right);
  const right = Math.max(opening.left, opening.right);
  const bottom = Math.min(opening.bottom, opening.top);
  const top = Math.max(opening.bottom, opening.top);
  return {
    ...opening,
    left: roundToQuarterInch(left),
    right: roundToQuarterInch(right),
    bottom: roundToQuarterInch(bottom),
    top: roundToQuarterInch(top),
    width: roundToQuarterInch(right - left),
    height: roundToQuarterInch(top - bottom),
  };
}

function withinTolerance(left: number, right: number, tolerance = 0.25): boolean {
  return Math.abs(left - right) <= tolerance;
}

function buildGeometryValidation(input: {
  geometry: Cut2KitWallGeometry;
  extractedText: string;
  settings: Cut2KitWallWorkflowSettings;
}): Cut2KitWallGeometry["validation"] {
  const geometry = input.geometry;
  const windows = geometry.openings.filter((opening) => opening.kind === "window");
  const notes: string[] = [];
  const dimensionTextFound = /\d+'\-\d+"|\d+/.test(input.extractedText);
  const wallDimensionsResolved =
    dimensionTextFound && geometry.wall.width > 0 && geometry.wall.height > 0;
  const openingPairsResolved = geometry.openings.every(
    (opening) => opening.width > 0 && opening.height > 0,
  );
  const openingDimensionsResolved =
    geometry.openings.length === 0 || (dimensionTextFound && openingPairsResolved);
  const wallBoundsFit = geometry.openings.every(
    (opening) =>
      opening.left >= geometry.wall.pageLeft &&
      opening.right <= geometry.wall.pageRight &&
      opening.bottom >= geometry.wall.pageBottom &&
      opening.top <= geometry.wall.pageTop,
  );
  const headHeightResolved =
    geometry.openings.length === 0 ||
    geometry.openings.every((opening) => withinTolerance(opening.top, geometry.commonHeights.head));
  const sillHeightResolved =
    windows.length === 0 ||
    windows.every((opening) => withinTolerance(opening.bottom, geometry.commonHeights.windowSill));
  const conflictsDetected = false;
  const ambiguityDetected =
    !dimensionTextFound ||
    !wallDimensionsResolved ||
    !openingDimensionsResolved ||
    !openingPairsResolved ||
    !headHeightResolved ||
    !sillHeightResolved;
  const requiresUserConfirmation =
    ambiguityDetected &&
    input.settings.input.elevationIntake.ambiguityHandling.requireUserConfirmationToContinue;

  if (!dimensionTextFound) {
    notes.push("Explicit dimension text was not detected reliably in the elevation PDF.");
  }
  if (!wallDimensionsResolved) {
    notes.push("Overall wall width and height are not fully resolved from explicit dimensions.");
  }
  if (!openingDimensionsResolved) {
    notes.push("Opening widths/heights are incomplete or not tied back to explicit dimensions.");
  }
  if (!wallBoundsFit) notes.push("One or more openings extend beyond the detected wall bounds.");
  if (!openingPairsResolved) notes.push("At least one opening has invalid paired dimensions.");
  if (!headHeightResolved) notes.push("Opening head heights do not resolve to a common value.");
  if (!sillHeightResolved) notes.push("Window sill heights do not resolve to a common value.");
  if (requiresUserConfirmation) {
    notes.push("User confirmation is required before continuing with ambiguous wall geometry.");
  }

  return {
    dimensionTextFound,
    wallDimensionsResolved,
    openingDimensionsResolved,
    wallBoundsFit,
    openingPairsResolved,
    openingTypesResolved: geometry.openings.every(
      (opening) => opening.kind === "window" || opening.kind === "door",
    ),
    headHeightResolved,
    sillHeightResolved,
    conflictsDetected,
    ambiguityDetected,
    requiresUserConfirmation,
    notes,
  };
}

function normalizeWallGeometry(input: {
  geometry: Cut2KitWallGeometry;
  sourcePdfPath: string;
  settingsFilePath: string;
  extractedText: string;
  settings: Cut2KitWallWorkflowSettings;
}): Cut2KitWallGeometry {
  const openings = input.geometry.openings
    .map((opening) => normalizeOpening(opening))
    .toSorted((left, right) => left.left - right.left);
  const commonHead =
    input.geometry.commonHeights.head > 0
      ? input.geometry.commonHeights.head
      : Math.max(...openings.map((opening) => opening.top), 0);
  const windowSills = openings
    .filter((opening) => opening.kind === "window")
    .map((opening) => opening.bottom);
  const commonWindowSill =
    input.geometry.commonHeights.windowSill > 0
      ? input.geometry.commonHeights.windowSill
      : (windowSills[0] ?? 0);

  const geometry: Cut2KitWallGeometry = {
    ...input.geometry,
    schemaVersion: "0.2.0",
    sourcePdfPath: input.sourcePdfPath,
    settingsFilePath: input.settingsFilePath,
    wall: {
      width: roundToQuarterInch(input.geometry.wall.width),
      height: roundToQuarterInch(input.geometry.wall.height),
      pageLeft: 0,
      pageRight: roundToQuarterInch(input.geometry.wall.width),
      pageTop: roundToQuarterInch(input.geometry.wall.height),
      pageBottom: 0,
    },
    commonHeights: {
      head: roundToQuarterInch(commonHead),
      windowSill: roundToQuarterInch(commonWindowSill),
    },
    openings,
  };

  const validation = buildGeometryValidation({
    geometry,
    extractedText: input.extractedText,
    settings: input.settings,
  });
  return {
    ...geometry,
    validation,
    notes: [...geometry.notes, ...validation.notes],
  };
}

function buildMemberSchedule(
  members: ReadonlyArray<Cut2KitFramingLayoutV0_2_0["members"][number]>,
): Cut2KitFramingLayoutV0_2_0["memberSchedule"] {
  const buckets = new Map<
    string,
    {
      label: string;
      memberKind: Cut2KitFramingLayoutV0_2_0["members"][number]["kind"];
      count: number;
      length: number;
    }
  >();

  for (const member of members) {
    const length = member.height >= member.width ? member.height : member.width;
    const key = `${member.kind}:${roundToQuarterInch(length)}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.count += 1;
      continue;
    }
    buckets.set(key, {
      label: `${member.kind.replace(/-/g, " ")} ${roundToQuarterInch(length)} in`,
      memberKind: member.kind,
      count: 1,
      length: roundToQuarterInch(length),
    });
  }

  return [...buckets.entries()].map(([key, value]) => ({
    id: slugify(key),
    label: value.label,
    memberKind: value.memberKind,
    count: value.count,
    length: value.length,
  }));
}

function buildFramingValidation(input: {
  geometry: Cut2KitWallGeometry;
  layout: Cut2KitFramingLayoutV0_2_0;
  settings: Cut2KitWallWorkflowSettings;
}): Cut2KitFramingLayoutV0_2_0["validation"] {
  const notes: string[] = [];
  const memberThickness = input.settings.framing.material.thickness;
  const leftEndStuds = input.layout.members.filter(
    (member) => member.kind === "end-stud" && member.x <= memberThickness + 0.25,
  ).length;
  const rightEndStuds = input.layout.members.filter(
    (member) =>
      member.kind === "end-stud" &&
      member.x >=
        input.layout.wall.width -
          memberThickness * input.settings.framing.endStuds.rightCount -
          0.25,
  ).length;
  const spacing = input.settings.framing.studLayout.spacing;
  const commonStudSpacingApplied = input.layout.studLayout.commonStudCenterlines.every(
    (centerline) =>
      withinTolerance(centerline % spacing, 0, 0.25) ||
      withinTolerance(centerline % spacing, spacing, 0.25),
  );
  const noCommonStudThroughVoid = input.layout.members
    .filter((member) => member.kind === "common-stud")
    .every((member) =>
      input.geometry.openings.every((opening) => {
        const centerline = member.centerlineX ?? member.x + member.width / 2;
        const spansVoid = member.y < opening.top && member.y + member.height > opening.bottom;
        return !(centerline > opening.left && centerline < opening.right && spansVoid);
      }),
    );
  const jambStudsPresent = input.geometry.openings.every((opening) => {
    const jambs = input.layout.members.filter(
      (member) =>
        member.kind === "jamb-stud" &&
        (member.sourceOpeningId === opening.id ||
          withinTolerance(member.x, opening.left - member.width, 1.75) ||
          withinTolerance(member.x, opening.right, 1.75)),
    );
    return jambs.length >= input.settings.framing.jambStuds.countPerSide * 2;
  });

  if (!commonStudSpacingApplied)
    notes.push("Common stud centerlines drift from the configured spacing grid.");
  if (!noCommonStudThroughVoid) notes.push("At least one common stud crosses an opening void.");
  if (!jambStudsPresent) notes.push("At least one opening is missing the required jamb studs.");

  return {
    wallWidthMatchesElevation: withinTolerance(input.layout.wall.width, input.geometry.wall.width),
    wallHeightMatchesElevation: withinTolerance(
      input.layout.wall.height,
      input.geometry.wall.height,
    ),
    openingSizesMatchElevation: input.layout.openings.every((opening, index) => {
      const geometryOpening = input.geometry.openings[index];
      return (
        geometryOpening !== undefined &&
        withinTolerance(opening.left, geometryOpening.left) &&
        withinTolerance(opening.right, geometryOpening.right) &&
        withinTolerance(opening.bottom, geometryOpening.bottom) &&
        withinTolerance(opening.top, geometryOpening.top)
      );
    }),
    headHeightMatchesElevation: input.layout.openings.every((opening) =>
      withinTolerance(opening.top, input.geometry.commonHeights.head),
    ),
    sillHeightMatchesElevation: input.layout.openings
      .filter((opening) => opening.kind === "window")
      .every((opening) => withinTolerance(opening.bottom, input.geometry.commonHeights.windowSill)),
    endStudsDoubled:
      leftEndStuds >= input.settings.framing.endStuds.leftCount &&
      rightEndStuds >= input.settings.framing.endStuds.rightCount,
    jambStudsPresent,
    commonStudSpacingApplied,
    noCommonStudThroughVoid,
    plateOrientationMatchesExpectation:
      input.layout.wall.topMemberOrientation ===
        input.settings.framing.plates.top.orientationInElevation &&
      input.layout.wall.bottomMemberOrientation ===
        input.settings.framing.plates.bottom.orientationInElevation,
    notes,
  };
}

function normalizeFramingLayout(input: {
  layout: Cut2KitFramingLayoutV0_2_0;
  geometry: Cut2KitWallGeometry;
  settings: Cut2KitWallWorkflowSettings;
  sourcePdfPath: string;
  settingsFilePath: string;
}): Cut2KitFramingLayoutV0_2_0 {
  const material = input.settings.framing.material;
  const members = input.layout.members
    .map((member) => ({
      ...member,
      x: roundToQuarterInch(member.x),
      y: roundToQuarterInch(member.y),
      width: roundToQuarterInch(member.width),
      height: roundToQuarterInch(member.height),
      ...(member.centerlineX !== undefined
        ? { centerlineX: roundToQuarterInch(member.centerlineX) }
        : {}),
    }))
    .toSorted((left, right) => left.x - right.x || left.y - right.y);
  const layout: Cut2KitFramingLayoutV0_2_0 = {
    ...input.layout,
    schemaVersion: "0.2.0",
    sourcePdfPath: input.sourcePdfPath,
    settingsFilePath: input.settingsFilePath,
    geometry: input.geometry,
    wall: {
      ...input.layout.wall,
      width: input.geometry.wall.width,
      height: input.geometry.wall.height,
      memberThickness: material.thickness,
      studNominalSize: material.nominalSize,
      material: material.label,
      topMemberOrientation: input.settings.framing.plates.top.orientationInElevation,
      bottomMemberOrientation: input.settings.framing.plates.bottom.orientationInElevation,
    },
    studLayout: {
      originEdge: input.settings.framing.studLayout.originSide === "left" ? "left" : "right",
      spacing: input.settings.framing.studLayout.spacing,
      commonStudCenterlines: input.layout.studLayout.commonStudCenterlines
        .map((value) => roundToQuarterInch(value))
        .toSorted((left, right) => left - right),
    },
    openings: input.geometry.openings,
    members,
    memberSchedule:
      input.layout.memberSchedule.length > 0
        ? input.layout.memberSchedule
        : buildMemberSchedule(members),
  };
  const validation = buildFramingValidation({
    geometry: input.geometry,
    layout,
    settings: input.settings,
  });
  return {
    ...layout,
    validation,
    notes: [...layout.notes, ...validation.notes],
  };
}

function buildSheathingValidation(input: {
  geometry: Cut2KitWallGeometry;
  layout: Cut2KitSheathingLayout;
  settings: Cut2KitWallWorkflowSettings;
}): Cut2KitSheathingLayout["validation"] {
  const notes: string[] = [];
  const sheetNominalWidth = input.settings.sheathing.sheet.nominalWidth;
  const sheetNominalHeight = input.settings.sheathing.sheet.nominalHeight;
  const remainder = input.geometry.wall.width % sheetNominalWidth;
  const cutoutsWithinSheets = input.layout.sheets.every((sheet) =>
    sheet.cutouts.every(
      (cutout) =>
        cutout.left >= sheet.left &&
        cutout.right <= sheet.right &&
        cutout.bottom >= sheet.bottom &&
        cutout.top <= sheet.top,
    ),
  );
  const openingCoverageRemoved = input.geometry.openings.every((opening) => {
    const matchingWidth = input.layout.sheets
      .flatMap((sheet) => sheet.cutouts)
      .filter((cutout) => cutout.sourceOpeningId === opening.id)
      .reduce((total, cutout) => total + cutout.width, 0);
    return withinTolerance(matchingWidth, opening.width, 0.5);
  });
  const terminalRipComputed =
    remainder === 0
      ? input.layout.sheets.every((sheet) => sheet.isTerminalRip === false)
      : input.layout.sheets.some(
          (sheet) => sheet.isTerminalRip && withinTolerance(sheet.width, remainder, 0.5),
        );
  const fullSheetCount = input.layout.sheets.filter(
    (sheet) =>
      !sheet.isTerminalRip &&
      withinTolerance(sheet.width, sheetNominalWidth, 0.5) &&
      withinTolerance(sheet.height, sheetNominalHeight, 0.5),
  ).length;
  const page = resolvePageDimensions(
    input.settings.rendering.sheathing.pageSize,
    input.settings.rendering.sheathing.pageOrientation,
  );
  const firstPageFitsMargins =
    computeFitScale({
      page,
      margins: input.settings.rendering.sheathing.margins,
      contentWidth: input.geometry.wall.width,
      contentHeight: input.geometry.wall.height,
    }) > 0;
  if (!cutoutsWithinSheets) notes.push("At least one cutout extends beyond its parent sheet.");
  if (!openingCoverageRemoved)
    notes.push("Openings are not fully removed from the sheathing cutouts.");
  if (!terminalRipComputed) notes.push("Terminal rip width does not match the wall remainder.");
  if (!firstPageFitsMargins)
    notes.push("Overall sheathing layout does not fit within the configured page margins.");

  return {
    openingCoverageRemoved,
    sheetCountMatchesLayout:
      input.layout.summary.sheetCount === input.layout.sheets.length &&
      input.layout.summary.fullSheetCount === fullSheetCount,
    terminalRipComputed,
    cutoutsWithinSheets,
    firstPageFitsMargins,
    notes,
  };
}

function normalizeSheathingLayout(input: {
  layout: Cut2KitSheathingLayout;
  geometry: Cut2KitWallGeometry;
  settings: Cut2KitWallWorkflowSettings;
  sourcePdfPath: string;
  settingsFilePath: string;
}): Cut2KitSheathingLayout {
  const sheets = input.layout.sheets
    .map((sheet, index) => ({
      ...sheet,
      id: sheet.id || `sheet-${index + 1}`,
      index: index + 1,
      left: roundToQuarterInch(sheet.left),
      right: roundToQuarterInch(sheet.right),
      bottom: roundToQuarterInch(sheet.bottom),
      top: roundToQuarterInch(sheet.top),
      width: roundToQuarterInch(sheet.right - sheet.left),
      height: roundToQuarterInch(sheet.top - sheet.bottom),
      cutouts: sheet.cutouts.map((cutout) => ({
        ...cutout,
        left: roundToQuarterInch(cutout.left),
        right: roundToQuarterInch(cutout.right),
        bottom: roundToQuarterInch(cutout.bottom),
        top: roundToQuarterInch(cutout.top),
        width: roundToQuarterInch(cutout.right - cutout.left),
        height: roundToQuarterInch(cutout.top - cutout.bottom),
      })),
    }))
    .toSorted((left, right) => left.left - right.left);
  const summary = {
    sheetCount: sheets.length,
    fullSheetCount: sheets.filter((sheet) => sheet.isTerminalRip === false).length,
    terminalRipWidth:
      sheets.find((sheet) => sheet.isTerminalRip)?.width ??
      input.geometry.wall.width % input.settings.sheathing.sheet.nominalWidth,
  };
  const layout: Cut2KitSheathingLayout = {
    ...input.layout,
    schemaVersion: "0.2.0",
    sourcePdfPath: input.sourcePdfPath,
    settingsFilePath: input.settingsFilePath,
    geometry: input.geometry,
    wall: {
      width: input.geometry.wall.width,
      height: input.geometry.wall.height,
      materialLabel: input.settings.sheathing.materialLabel,
      panelThickness: input.settings.sheathing.panelThickness,
      sheetNominalWidth: input.settings.sheathing.sheet.nominalWidth,
      sheetNominalHeight: input.settings.sheathing.sheet.nominalHeight,
      installedOrientation: input.settings.sheathing.sheet.installedOrientation,
      runDirection: input.settings.sheathing.sheet.runDirection,
    },
    sheets,
    summary,
    fastening: {
      supportedEdgeSpacing: input.settings.fastening.supportedEdgeSpacing,
      fieldSpacing: input.settings.fastening.fieldSpacing,
      edgeDistance: input.settings.fastening.edgeDistance,
      typicalReferenceOnly: input.settings.fastening.typicalReferenceOnly,
      noteLines:
        input.layout.fastening.noteLines.length > 0
          ? input.layout.fastening.noteLines
          : input.settings.fastening.noteLines,
      disclaimerText:
        input.layout.fastening.disclaimerText || input.settings.fastening.disclaimerText,
    },
  };
  const validation = buildSheathingValidation({
    geometry: input.geometry,
    layout,
    settings: input.settings,
  });
  return {
    ...layout,
    validation,
    notes: [...layout.notes, ...validation.notes],
  };
}

function geometryNeedsConfirmation(
  geometry: Cut2KitWallGeometry,
  settings: Cut2KitWallWorkflowSettings,
): boolean {
  const ambiguityHandling = settings.input.elevationIntake.ambiguityHandling;
  const missingDimensions =
    !geometry.validation.dimensionTextFound || !geometry.validation.wallDimensionsResolved;
  const conflictingDimensions = geometry.validation.conflictsDetected;
  const incompleteOpenings =
    !geometry.validation.openingDimensionsResolved || !geometry.validation.openingPairsResolved;

  return (
    (ambiguityHandling.stopOnMissingDimensions && missingDimensions) ||
    (ambiguityHandling.stopOnConflictingDimensions && conflictingDimensions) ||
    (ambiguityHandling.stopOnIncompleteOpeningGeometry && incompleteOpenings) ||
    geometry.validation.ambiguityDetected
  );
}

function geometryCanContinue(geometry: Cut2KitWallGeometry): boolean {
  return geometry.validation.wallBoundsFit && geometry.validation.openingTypesResolved;
}

function framingValidationPassed(validation: Cut2KitFramingLayoutV0_2_0["validation"]): boolean {
  return (
    validation.wallWidthMatchesElevation &&
    validation.wallHeightMatchesElevation &&
    validation.openingSizesMatchElevation &&
    validation.headHeightMatchesElevation &&
    validation.sillHeightMatchesElevation &&
    validation.endStudsDoubled &&
    validation.jambStudsPresent &&
    validation.commonStudSpacingApplied &&
    validation.noCommonStudThroughVoid &&
    validation.plateOrientationMatchesExpectation
  );
}

function sheathingValidationPassed(validation: Cut2KitSheathingLayout["validation"]): boolean {
  return (
    validation.openingCoverageRemoved &&
    validation.sheetCountMatchesLayout &&
    validation.terminalRipComputed &&
    validation.cutoutsWithinSheets &&
    validation.firstPageFitsMargins
  );
}

function buildWallValidationReport(input: {
  sourcePdfPath: string;
  settingsFilePath: string;
  checklistPath: string;
  settings: Cut2KitWallWorkflowSettings;
  geometry: Cut2KitWallGeometry;
  framingLayout: Cut2KitFramingLayoutV0_2_0 | null;
  sheathingLayout: Cut2KitSheathingLayout | null;
  confirmedAmbiguityProceeding: boolean;
}): Cut2KitWallValidationReport {
  const issues: Cut2KitValidationReportIssue[] = [];
  const requiresConfirmation =
    geometryNeedsConfirmation(input.geometry, input.settings) &&
    !input.confirmedAmbiguityProceeding;
  const geometryStatus = requiresConfirmation
    ? "needs_confirmation"
    : geometryCanContinue(input.geometry)
      ? "pass"
      : "blocked";
  const readyForFraming = geometryStatus === "pass";

  input.geometry.validation.notes.forEach((message) => {
    issues.push({
      stage: "geometry",
      severity: geometryStatus === "pass" ? "warning" : "error",
      code: geometryStatus === "pass" ? "geometry.warning" : "geometry.blocking",
      message,
    });
  });

  const framingStatus =
    input.framingLayout === null
      ? "not_run"
      : framingValidationPassed(input.framingLayout.validation)
        ? "pass"
        : "blocked";
  if (input.framingLayout) {
    input.framingLayout.validation.notes.forEach((message) => {
      issues.push({
        stage: "framing",
        severity: framingStatus === "pass" ? "warning" : "error",
        code: framingStatus === "pass" ? "framing.warning" : "framing.blocking",
        message,
      });
    });
  }

  const readyForSheathing = readyForFraming && framingStatus === "pass";
  const sheathingStatus =
    input.sheathingLayout === null
      ? "not_run"
      : sheathingValidationPassed(input.sheathingLayout.validation)
        ? "pass"
        : "blocked";
  if (input.sheathingLayout) {
    input.sheathingLayout.validation.notes.forEach((message) => {
      issues.push({
        stage: "sheathing",
        severity: sheathingStatus === "pass" ? "warning" : "error",
        code: sheathingStatus === "pass" ? "sheathing.warning" : "sheathing.blocking",
        message,
      });
    });
  }

  const readyForPackaging = readyForSheathing && sheathingStatus === "pass";

  return {
    schemaVersion: "0.2.0",
    sourcePdfPath: input.sourcePdfPath,
    settingsFilePath: input.settingsFilePath,
    checklistPath: input.checklistPath,
    ambiguity: {
      detected: input.geometry.validation.ambiguityDetected,
      requiresConfirmation,
      notes: input.geometry.validation.notes.filter((note) =>
        /ambigu|explicit dimension|confirmation/i.test(note),
      ),
    },
    geometry: {
      status: geometryStatus,
      checks: input.geometry.validation,
    },
    framing:
      input.framingLayout === null
        ? null
        : {
            status: framingStatus,
            checks: input.framingLayout.validation,
          },
    sheathing:
      input.sheathingLayout === null
        ? null
        : {
            status: sheathingStatus,
            checks: input.sheathingLayout.validation,
          },
    issues,
    readyForFraming,
    readyForSheathing,
    readyForPackaging,
  };
}

async function readPdfTextAbsolute(absolutePdfPath: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync("pdftotext", [absolutePdfPath, "-"]);
    return stdout.trim();
  } catch {
    return "";
  }
}

async function readPdfText(cwd: string, relativePdfPath: string): Promise<string> {
  return readPdfTextAbsolute(nodePath.join(cwd, relativePdfPath));
}

async function renderPdfPreviewImage(cwd: string, relativePdfPath: string): Promise<string> {
  const absolutePdfPath = nodePath.join(cwd, relativePdfPath);
  const tempDir = await fsPromises.mkdtemp(
    nodePath.join(os.tmpdir(), "cut2kit-elevation-preview-"),
  );
  const outputBase = nodePath.join(tempDir, "page-1");
  await execFileAsync("pdftoppm", ["-png", "-f", "1", "-singlefile", absolutePdfPath, outputBase]);
  return `${outputBase}.png`;
}

function deriveProject(input: {
  cwd: string;
  files: ReadonlyArray<ProjectFileRecord>;
  settings: Cut2KitSettings | null;
  settingsFilePath: string | null;
  resolvedPromptTemplates: Cut2KitProject["resolvedPromptTemplates"];
  manufacturingPlan: Cut2KitManufacturingPlan | null;
  manufacturingPlanFilePath: string | null;
  discoveredAt: string;
  settingsIssues: ReadonlyArray<Cut2KitIssue>;
  manufacturingPlanIssues: ReadonlyArray<Cut2KitIssue>;
}): Cut2KitProject {
  const issues = [...input.settingsIssues, ...input.manufacturingPlanIssues];

  const settingsFiles = input.files.filter(
    (entry) => entry.kind === "file" && entry.role === "settings",
  );
  if (settingsFiles.length === 0) {
    issues.push(
      makeIssue(
        "error",
        "settings.missing",
        `Expected ${SETTINGS_FILE_NAME} somewhere inside the project directory.`,
      ),
    );
  }
  if (settingsFiles.length > 1) {
    issues.push(
      makeIssue(
        "warning",
        "settings.multiple",
        "Multiple Cut2Kit settings files were found. The shallowest file was used.",
      ),
    );
  }

  const manufacturingPlanFiles = input.files.filter(
    (entry) => entry.kind === "file" && entry.role === "manufacturing-plan",
  );
  if (manufacturingPlanFiles.length === 0) {
    issues.push(
      makeIssue(
        "warning",
        "manufacturing_plan.missing",
        `No ${MANUFACTURING_PLAN_FILE_NAME} file was found. A2MC output generation stays unavailable until one is added.`,
      ),
    );
  }
  if (manufacturingPlanFiles.length > 1) {
    issues.push(
      makeIssue(
        "warning",
        "manufacturing_plan.multiple",
        "Multiple Cut2Kit manufacturing plan files were found. The shallowest file was used.",
      ),
    );
  }

  const sourceDocuments = input.files
    .filter(
      (entry) =>
        entry.kind === "file" &&
        entry.classification === "pdf" &&
        (entry.role === "source-pdf" || hasPdfAssignmentMatch(entry.relativePath, input.settings)),
    )
    .map((entry) => inferSourceDocument(entry.relativePath, input.settings))
    .toSorted((left, right) => left.sourcePath.localeCompare(right.sourcePath));

  if (sourceDocuments.length === 0) {
    issues.push(
      makeIssue(
        "error",
        "pdf.missing",
        "No source PDF files were found in the selected project directory.",
      ),
    );
  }

  for (const sourceDocument of sourceDocuments) {
    if (sourceDocument.classification === "unknown") {
      issues.push(
        makeIssue(
          "warning",
          "pdf.unclassified",
          "PDF file could not be classified from settings or path heuristics.",
          sourceDocument.sourcePath,
        ),
      );
    }
  }

  const primaryMode = getPrimaryQueueMode(input.settings);
  const queueingSettings = resolveQueueingSettings(input.settings);
  const outputSettings = resolveOutputSettings(input.settings);
  const projectId = projectIdFor(input.settings, input.cwd);
  const projectName = projectNameFor(input.settings, input.cwd);
  const panelCandidates = buildPanelCandidates(sourceDocuments, queueingSettings);
  const panelManifest = buildPanelManifest({
    projectId,
    primaryMode,
    panelCandidates,
  });
  const nestManifest = buildNestManifest({
    projectId,
    panelCandidates,
  });
  const queueArtifacts = buildQueueArtifacts({
    projectId,
    projectName,
    sourceDocuments,
    queueingSettings,
    outputSettings,
    primaryMode,
    manufacturingPlanFilePath: input.manufacturingPlanFilePath,
    manufacturingPlan: input.manufacturingPlan,
  });
  issues.push(...queueArtifacts.issues);

  if (input.manufacturingPlan !== null && input.manufacturingPlan.jobs.length === 0) {
    issues.push(
      makeIssue(
        "error",
        "manufacturing_plan.empty",
        "Manufacturing plan must contain at least one job before A2MC outputs can be generated.",
        input.manufacturingPlanFilePath ?? undefined,
      ),
    );
  }

  if (
    input.settings !== null &&
    input.manufacturingPlan !== null &&
    ((input.settings.project.units === "imperial" && input.manufacturingPlan.units !== "inch") ||
      (input.settings.project.units === "metric" && input.manufacturingPlan.units !== "metric"))
  ) {
    issues.push(
      makeIssue(
        "warning",
        "manufacturing_plan.units_mismatch",
        "Manufacturing plan units do not match the project settings units.",
        input.manufacturingPlanFilePath ?? undefined,
      ),
    );
  }

  const expectedManifestPaths = [
    `${outputSettings.manifestsDir}/panel-manifest.json`,
    `${outputSettings.manifestsDir}/nest-manifest.json`,
    `${outputSettings.manifestsDir}/queue-manifest.json`,
  ];
  const existingManifestPaths = existingFilePathsByRole(input.files, "generated-manifest");
  const existingNcPaths = existingFilePathsByRole(input.files, "generated-nc");
  const expectedNcPaths = queueArtifacts.ncJobs.map((job) => job.relativeOutputPath);
  const generated =
    expectedManifestPaths.every((manifestPath) => existingManifestPaths.has(manifestPath)) &&
    expectedNcPaths.length > 0 &&
    expectedNcPaths.every((ncPath) => existingNcPaths.has(ncPath));

  const errorCount = issues.filter((issue) => issue.severity === "error").length;
  const warningCount = issues.filter((issue) => issue.severity === "warning").length;

  return {
    cwd: input.cwd,
    name: projectName,
    discoveredAt: input.discoveredAt,
    status: errorCount > 0 ? "error" : warningCount > 0 ? "warning" : "ready",
    settingsFilePath: input.settingsFilePath,
    settings: input.settings,
    resolvedPromptTemplates: input.resolvedPromptTemplates,
    manufacturingPlanFilePath: input.manufacturingPlanFilePath,
    manufacturingPlan: input.manufacturingPlan,
    files: input.files.toSorted(compareProjectFiles),
    issues,
    sourceDocuments,
    panelCandidates,
    panelManifest,
    nestManifest,
    queueManifest: queueArtifacts.queueManifest,
    ncJobs: queueArtifacts.ncJobs,
    outputStatus: {
      generated,
      manifestPaths: expectedManifestPaths,
      ncFilePaths: expectedNcPaths,
    },
    summary: {
      totalFiles: input.files.filter((entry) => entry.kind === "file").length,
      totalDirectories: input.files.filter((entry) => entry.kind === "directory").length,
      pdfCount: sourceDocuments.length,
      settingsCount: settingsFiles.length,
      warningCount,
      errorCount,
      recognizedFileCount: input.files.filter(
        (entry) => entry.kind === "file" && entry.classification !== "other",
      ).length,
      outputNcCount: input.files.filter(
        (entry) => entry.kind === "file" && entry.role === "generated-nc",
      ).length,
    },
  };
}

function encodeJsonFile(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export const makeCut2KitProjects = Effect.gen(function* () {
  const workspacePaths = yield* WorkspacePaths;
  const workspaceEntries = yield* WorkspaceEntries;

  const inspectProject: Cut2KitProjectsShape["inspectProject"] = Effect.fn(
    "Cut2KitProjects.inspectProject",
  )(function* (input) {
    const normalizedCwd = yield* workspacePaths.normalizeWorkspaceRoot(input.cwd).pipe(
      Effect.mapError(
        (cause) =>
          new Cut2KitProjectsError({
            cwd: input.cwd,
            operation: "inspectProject.normalizeWorkspaceRoot",
            detail:
              cause._tag === "WorkspaceRootNotDirectoryError"
                ? "Workspace root must be a directory."
                : "Workspace root was not found.",
            cause,
          }),
      ),
    );

    const files = yield* Effect.tryPromise({
      try: () => scanProjectFiles(normalizedCwd),
      catch: (error) =>
        new Cut2KitProjectsError({
          cwd: normalizedCwd,
          operation: "inspectProject.scanProjectFiles",
          detail: error instanceof Error ? error.message : String(error),
        }),
    });

    const settingsFilePath = chooseSettingsFile(files);
    const manufacturingPlanFilePath = chooseManufacturingPlanFile(files);
    const settingsResult = settingsFilePath
      ? yield* Effect.tryPromise({
          try: () => readSettingsFile(normalizedCwd, settingsFilePath),
          catch: (error) =>
            new Cut2KitProjectsError({
              cwd: normalizedCwd,
              operation: "inspectProject.readSettingsFile",
              detail: error instanceof Error ? error.message : String(error),
            }),
        })
      : { settings: null, issues: [] };
    const manufacturingPlanResult = manufacturingPlanFilePath
      ? yield* Effect.tryPromise({
          try: () => readManufacturingPlanFile(normalizedCwd, manufacturingPlanFilePath),
          catch: (error) =>
            new Cut2KitProjectsError({
              cwd: normalizedCwd,
              operation: "inspectProject.readManufacturingPlanFile",
              detail: error instanceof Error ? error.message : String(error),
            }),
        })
      : { manufacturingPlan: null, issues: [] };
    const resolvedPromptTemplates = yield* loadCut2KitResolvedPromptTemplates({
      cwd: normalizedCwd,
      paths: resolveCut2KitPromptTemplatePaths({
        settings: settingsResult.settings,
      }),
    }).pipe(Effect.catch(() => Effect.succeed(null)));

    return deriveProject({
      cwd: normalizedCwd,
      files,
      settings: settingsResult.settings,
      settingsFilePath,
      resolvedPromptTemplates,
      manufacturingPlan: manufacturingPlanResult.manufacturingPlan,
      manufacturingPlanFilePath,
      discoveredAt: DEFAULT_DISCOVERED_AT,
      settingsIssues: settingsResult.issues,
      manufacturingPlanIssues: manufacturingPlanResult.issues,
    });
  });

  const writeWorkspaceFile = Effect.fn("Cut2KitProjects.writeWorkspaceFile")(function* (
    cwd: string,
    relativePath: string,
    contents: string,
  ) {
    const resolved = yield* workspacePaths
      .resolveRelativePathWithinRoot({
        workspaceRoot: cwd,
        relativePath,
      })
      .pipe(
        Effect.mapError(
          (cause) =>
            new Cut2KitProjectsError({
              cwd,
              operation: "generateOutputs.resolveRelativePathWithinRoot",
              detail: "Output path escaped the workspace root.",
              cause,
            }),
        ),
      );

    yield* Effect.tryPromise({
      try: async () => {
        await fsPromises.mkdir(nodePath.dirname(resolved.absolutePath), { recursive: true });
        await fsPromises.writeFile(resolved.absolutePath, contents, "utf8");
      },
      catch: (error) =>
        new Cut2KitProjectsError({
          cwd,
          operation: "generateOutputs.writeFile",
          detail: error instanceof Error ? error.message : String(error),
        }),
    });

    return resolved.relativePath;
  });

  const writeWorkspaceBytes = Effect.fn("Cut2KitProjects.writeWorkspaceBytes")(function* (
    cwd: string,
    relativePath: string,
    contents: Uint8Array,
  ) {
    const resolved = yield* workspacePaths
      .resolveRelativePathWithinRoot({
        workspaceRoot: cwd,
        relativePath,
      })
      .pipe(
        Effect.mapError(
          (cause) =>
            new Cut2KitProjectsError({
              cwd,
              operation: "generateWallLayout.resolveRelativePathWithinRoot",
              detail: "Output path escaped the workspace root.",
              cause,
            }),
        ),
      );

    yield* Effect.tryPromise({
      try: async () => {
        await fsPromises.mkdir(nodePath.dirname(resolved.absolutePath), { recursive: true });
        await fsPromises.writeFile(resolved.absolutePath, Buffer.from(contents));
      },
      catch: (error) =>
        new Cut2KitProjectsError({
          cwd,
          operation: "generateWallLayout.writeFile",
          detail: error instanceof Error ? error.message : String(error),
        }),
    });

    return resolved.relativePath;
  });

  const loadPromptTemplateBundleForProject = Effect.fn(
    "Cut2KitProjects.loadPromptTemplateBundleForProject",
  )(function* (project: Cut2KitProject) {
    const promptTemplatePaths = resolveCut2KitPromptTemplatePaths(project);
    const promptTemplateBundle = yield* loadCut2KitPromptTemplateBundle({
      cwd: project.cwd,
      paths: promptTemplatePaths,
    }).pipe(
      Effect.mapError(
        (cause) =>
          new Cut2KitProjectsError({
            cwd: project.cwd,
            operation: "cut2kit.loadPromptTemplates",
            detail: cause.detail,
            cause,
          }),
      ),
    );

    return { promptTemplatePaths, promptTemplateBundle };
  });

  const readOptionalWallGeometryArtifact = Effect.fn(
    "Cut2KitProjects.readOptionalWallGeometryArtifact",
  )(function* (project: Cut2KitProject, relativePath: string) {
    const resolved = yield* workspacePaths
      .resolveRelativePathWithinRoot({
        workspaceRoot: project.cwd,
        relativePath,
      })
      .pipe(
        Effect.mapError(
          (cause) =>
            new Cut2KitProjectsError({
              cwd: project.cwd,
              operation: "compileFramingPrompt.resolveGeometryArtifact",
              detail: "Geometry artifact path escaped the workspace root.",
              cause,
            }),
        ),
      );

    const stat = yield* Effect.tryPromise({
      try: async () => {
        try {
          return await fsPromises.stat(resolved.absolutePath);
        } catch (error) {
          if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
            return null;
          }
          throw error;
        }
      },
      catch: (error) =>
        new Cut2KitProjectsError({
          cwd: project.cwd,
          operation: "compileFramingPrompt.statGeometryArtifact",
          detail: error instanceof Error ? error.message : String(error),
        }),
    });

    if (!stat?.isFile()) {
      return null;
    }

    const { geometry, issues } = yield* Effect.tryPromise({
      try: () => readWallGeometryFile(project.cwd, resolved.relativePath),
      catch: (error) =>
        new Cut2KitProjectsError({
          cwd: project.cwd,
          operation: "compileFramingPrompt.readGeometryArtifact",
          detail: error instanceof Error ? error.message : String(error),
        }),
    });

    if (issues.length > 0 || geometry === null) {
      return yield* new Cut2KitProjectsError({
        cwd: project.cwd,
        operation: "compileFramingPrompt.decodeGeometryArtifact",
        detail:
          issues[0]?.message ?? "The extracted-elevation artifact exists but could not be decoded.",
      });
    }

    return geometry;
  });

  const compileFramingPrompt: Cut2KitProjectsShape["compileFramingPrompt"] = Effect.fn(
    "Cut2KitProjects.compileFramingPrompt",
  )(function* (input): Effect.fn.Return<Cut2KitCompileFramingPromptResult, Cut2KitProjectsError> {
    const project = yield* inspectProject({ cwd: input.cwd });
    const settings = project.settings;
    if (!isWallWorkflowSettings(settings)) {
      return yield* new Cut2KitProjectsError({
        cwd: project.cwd,
        operation: "compileFramingPrompt.validateSettings",
        detail:
          "Cut2Kit settings must be valid wall-workflow settings before compiling a framing prompt.",
      });
    }

    const sourceDocument = project.sourceDocuments.find(
      (document) => document.sourcePath === input.sourcePdfPath,
    );
    if (!sourceDocument || sourceDocument.classification !== "elevation") {
      return yield* new Cut2KitProjectsError({
        cwd: project.cwd,
        operation: "compileFramingPrompt.validateSourcePdf",
        detail: "Select a source document classified as an elevation PDF.",
      });
    }

    const artifactPaths = buildWallLayoutArtifactPaths(project, input.sourcePdfPath);
    const { promptTemplateBundle } = yield* loadPromptTemplateBundleForProject(project);
    const geometry = yield* readOptionalWallGeometryArtifact(
      project,
      artifactPaths.geometryJsonPath,
    );

    return {
      sourcePdfPath: input.sourcePdfPath,
      prompt: buildCut2KitFramingLayoutPrompt({
        project,
        sourcePdfPath: input.sourcePdfPath,
        ...(geometry ? { geometry } : {}),
        promptTemplates: {
          systemPrompt: promptTemplateBundle.framingSystem,
          userPrompt: promptTemplateBundle.framingUser,
          validationChecklist: promptTemplateBundle.validationChecklist,
        },
      }),
      geometryJsonPath: artifactPaths.geometryJsonPath,
      geometryLoaded: geometry !== null,
    };
  });

  const compileManufacturingPrompt: Cut2KitProjectsShape["compileManufacturingPrompt"] = Effect.fn(
    "Cut2KitProjects.compileManufacturingPrompt",
  )(function* (input): Effect.fn.Return<
    Cut2KitCompileManufacturingPromptResult,
    Cut2KitProjectsError
  > {
    const project = yield* inspectProject({ cwd: input.cwd });
    const settings = project.settings;
    if (!isWallWorkflowSettings(settings)) {
      return yield* new Cut2KitProjectsError({
        cwd: project.cwd,
        operation: "compileManufacturingPrompt.validateSettings",
        detail:
          "Cut2Kit settings must be valid wall-workflow settings before compiling an A2MC manufacturing-plan prompt.",
      });
    }

    const sourceDocument = project.sourceDocuments.find(
      (document) => document.sourcePath === input.sourcePdfPath,
    );
    if (!sourceDocument || sourceDocument.classification !== "elevation") {
      return yield* new Cut2KitProjectsError({
        cwd: project.cwd,
        operation: "compileManufacturingPrompt.validateSourcePdf",
        detail: "Select a source document classified as an elevation PDF.",
      });
    }

    const artifactPaths = buildWallLayoutArtifactPaths(project, input.sourcePdfPath);
    const { promptTemplateBundle } = yield* loadPromptTemplateBundleForProject(project);
    const sheathingLayoutResult = yield* Effect.tryPromise({
      try: () => readSheathingLayoutFile(project.cwd, artifactPaths.sheathingJsonPath, settings),
      catch: (error) =>
        new Cut2KitProjectsError({
          cwd: project.cwd,
          operation: "compileManufacturingPrompt.readSheathingArtifact",
          detail: error instanceof Error ? error.message : String(error),
        }),
    });

    if (sheathingLayoutResult.issues.length > 0 || sheathingLayoutResult.sheathingLayout === null) {
      return yield* new Cut2KitProjectsError({
        cwd: project.cwd,
        operation: "compileManufacturingPrompt.decodeSheathingArtifact",
        detail:
          sheathingLayoutResult.issues[0]?.message ??
          "Generate the sheathing layout JSON before starting manufacturing-plan generation.",
      });
    }

    const sheathingLayout = normalizeCompatibleSheathingLayout(
      sheathingLayoutResult.sheathingLayout,
      settings,
    );
    if (sheathingLayout === null) {
      return yield* new Cut2KitProjectsError({
        cwd: project.cwd,
        operation: "compileManufacturingPrompt.normalizeSheathingArtifact",
        detail:
          "The sheathing layout JSON exists but could not be normalized for manufacturing-plan generation.",
      });
    }

    return {
      sourcePdfPath: input.sourcePdfPath,
      prompt: buildCut2KitManufacturingPlanPrompt({
        project,
        sourcePdfPath: input.sourcePdfPath,
        sheathingLayout,
        promptTemplates: {
          systemPrompt: promptTemplateBundle.manufacturingSystem,
          userPrompt: promptTemplateBundle.manufacturingUser,
          validationChecklist: promptTemplateBundle.validationChecklist,
        },
      }),
      sheathingJsonPath: artifactPaths.sheathingJsonPath,
      manufacturingPlanPath: buildManufacturingPlanArtifactPath(project),
    };
  });

  const compileSheathingPrompt: Cut2KitProjectsShape["compileSheathingPrompt"] = Effect.fn(
    "Cut2KitProjects.compileSheathingPrompt",
  )(function* (input): Effect.fn.Return<Cut2KitCompileSheathingPromptResult, Cut2KitProjectsError> {
    const project = yield* inspectProject({ cwd: input.cwd });
    const settings = project.settings;
    if (!isWallWorkflowSettings(settings)) {
      return yield* new Cut2KitProjectsError({
        cwd: project.cwd,
        operation: "compileSheathingPrompt.validateSettings",
        detail:
          "Cut2Kit settings must be valid wall-workflow settings before compiling a wall-package prompt.",
      });
    }

    const sourceDocument = project.sourceDocuments.find(
      (document) => document.sourcePath === input.sourcePdfPath,
    );
    if (!sourceDocument || sourceDocument.classification !== "elevation") {
      return yield* new Cut2KitProjectsError({
        cwd: project.cwd,
        operation: "compileSheathingPrompt.validateSourcePdf",
        detail: "Select a source document classified as an elevation PDF.",
      });
    }

    const artifactPaths = buildWallLayoutArtifactPaths(project, input.sourcePdfPath);
    const { promptTemplateBundle } = yield* loadPromptTemplateBundleForProject(project);
    const framingLayoutResult = yield* Effect.tryPromise({
      try: () => readFramingLayoutFile(project.cwd, artifactPaths.framingJsonPath),
      catch: (error) =>
        new Cut2KitProjectsError({
          cwd: project.cwd,
          operation: "compileSheathingPrompt.readFramingArtifact",
          detail: error instanceof Error ? error.message : String(error),
        }),
    });

    if (framingLayoutResult.issues.length > 0 || framingLayoutResult.framingLayout === null) {
      return yield* new Cut2KitProjectsError({
        cwd: project.cwd,
        operation: "compileSheathingPrompt.decodeFramingArtifact",
        detail:
          framingLayoutResult.issues[0]?.message ??
          "Generate the framing layout JSON before starting the wall package flow.",
      });
    }

    const normalizedFramingLayout = normalizeCompatibleFramingLayout(
      framingLayoutResult.framingLayout,
    );
    if (normalizedFramingLayout === null) {
      return yield* new Cut2KitProjectsError({
        cwd: project.cwd,
        operation: "compileSheathingPrompt.normalizeFramingArtifact",
        detail:
          "The framing layout JSON exists but could not be normalized for wall-package generation.",
      });
    }

    const framingLayout = normalizeFramingLayout({
      layout: normalizedFramingLayout,
      geometry: normalizedFramingLayout.geometry,
      settings,
      sourcePdfPath: input.sourcePdfPath,
      settingsFilePath: project.settingsFilePath ?? "cut2kit.settings.json",
    });

    return {
      sourcePdfPath: input.sourcePdfPath,
      prompt: buildCut2KitSheathingLayoutPrompt({
        project,
        sourcePdfPath: input.sourcePdfPath,
        geometry: framingLayout.geometry,
        framingLayout,
        promptTemplates: {
          systemPrompt: promptTemplateBundle.sheathingSystem,
          userPrompt: promptTemplateBundle.sheathingUser,
          validationChecklist: promptTemplateBundle.validationChecklist,
        },
      }),
      framingJsonPath: artifactPaths.framingJsonPath,
      sheathingJsonPath: artifactPaths.sheathingJsonPath,
    };
  });

  const generateOutputs: Cut2KitProjectsShape["generateOutputs"] = Effect.fn(
    "Cut2KitProjects.generateOutputs",
  )(function* (input): Effect.fn.Return<Cut2KitGenerateOutputsResult, Cut2KitProjectsError> {
    const project = yield* inspectProject(input);
    if (project.summary.errorCount > 0) {
      return yield* new Cut2KitProjectsError({
        cwd: project.cwd,
        operation: "generateOutputs.validateProject",
        detail: "Project has validation errors. Resolve them before generating outputs.",
      });
    }
    if (project.ncJobs.length === 0) {
      return yield* new Cut2KitProjectsError({
        cwd: project.cwd,
        operation: "generateOutputs.validateProject",
        detail:
          "Project does not contain any valid A2MC manufacturing jobs. Add or fix cut2kit.manufacturing.json before generating outputs.",
      });
    }

    const outputSettings = resolveOutputSettings(project.settings);
    const writtenPaths: string[] = [];

    writtenPaths.push(
      yield* writeWorkspaceFile(
        project.cwd,
        `${outputSettings.manifestsDir}/panel-manifest.json`,
        encodeJsonFile(project.panelManifest),
      ),
    );
    writtenPaths.push(
      yield* writeWorkspaceFile(
        project.cwd,
        `${outputSettings.manifestsDir}/nest-manifest.json`,
        encodeJsonFile(project.nestManifest),
      ),
    );
    writtenPaths.push(
      yield* writeWorkspaceFile(
        project.cwd,
        `${outputSettings.manifestsDir}/queue-manifest.json`,
        encodeJsonFile(project.queueManifest),
      ),
    );

    for (const job of project.ncJobs) {
      writtenPaths.push(
        yield* writeWorkspaceFile(project.cwd, job.relativeOutputPath, job.program),
      );
    }

    yield* workspaceEntries.invalidate(project.cwd);

    const refreshedProject = yield* inspectProject({ cwd: project.cwd });
    return {
      project: refreshedProject,
      writtenPaths,
    };
  });

  const generateWallLayout: Cut2KitProjectsShape["generateWallLayout"] = Effect.fn(
    "Cut2KitProjects.generateWallLayout",
  )(function* (input): Effect.fn.Return<Cut2KitGenerateWallLayoutResult, Cut2KitProjectsError> {
    const project = yield* inspectProject({ cwd: input.cwd });
    const settings = project.settings;

    if (!isWallWorkflowSettings(settings)) {
      return yield* new Cut2KitProjectsError({
        cwd: project.cwd,
        operation: "generateWallLayout.validateSettings",
        detail:
          "AI-first wall generation requires schemaVersion 0.3.0 settings with input, artifacts, framing, sheathing, fastening, rendering, output, and ai sections.",
      });
    }

    const sourceFile = project.files.find(
      (file) =>
        file.kind === "file" &&
        file.relativePath === input.sourcePdfPath &&
        file.classification === "pdf",
    );
    if (!sourceFile) {
      return yield* new Cut2KitProjectsError({
        cwd: project.cwd,
        operation: "generateWallLayout.validateSourcePdf",
        detail: `Source PDF '${input.sourcePdfPath}' was not found in the project workspace.`,
      });
    }

    const blockingIssues = project.issues.filter(
      (issue) =>
        issue.severity === "error" &&
        !issue.code.startsWith("manufacturing_plan.") &&
        (issue.path === undefined ||
          issue.path === project.settingsFilePath ||
          issue.path === input.sourcePdfPath),
    );
    if (blockingIssues.length > 0) {
      return yield* new Cut2KitProjectsError({
        cwd: project.cwd,
        operation: "generateWallLayout.validateProject",
        detail: blockingIssues[0]?.message ?? "Project has blocking validation errors.",
      });
    }

    const modelSelection = resolveCut2KitAutomationModelSelection(project, null);
    if (modelSelection.provider !== "codex" && modelSelection.provider !== "opencode") {
      return yield* new Cut2KitProjectsError({
        cwd: project.cwd,
        operation: "generateWallLayout.validateProvider",
        detail: `The AI-first wall workflow does not support provider '${modelSelection.provider}'. Supported providers: codex, opencode.`,
      });
    }
    if (modelSelection.provider === "opencode" && !modelSelection.model.startsWith("vllm/")) {
      return yield* new Cut2KitProjectsError({
        cwd: project.cwd,
        operation: "generateWallLayout.validateModel",
        detail: "OpenCode wall generation requires a vLLM model in the format 'vllm/model-name'.",
      });
    }
    const { promptTemplatePaths, promptTemplateBundle } = yield* loadPromptTemplateBundleForProject(
      project,
    ).pipe(
      Effect.mapError(
        (cause) =>
          new Cut2KitProjectsError({
            cwd: project.cwd,
            operation: "generateWallLayout.loadPromptTemplates",
            detail: cause.detail,
            cause,
          }),
      ),
    );
    const extractedText = yield* Effect.tryPromise({
      try: () => readPdfText(project.cwd, input.sourcePdfPath),
      catch: (error) =>
        new Cut2KitProjectsError({
          cwd: project.cwd,
          operation: "generateWallLayout.readSourcePdfText",
          detail: error instanceof Error ? error.message : String(error),
        }),
    });
    const previewImagePath = yield* Effect.tryPromise({
      try: () => renderPdfPreviewImage(project.cwd, input.sourcePdfPath),
      catch: (error) =>
        new Cut2KitProjectsError({
          cwd: project.cwd,
          operation: "generateWallLayout.renderPdfPreviewImage",
          detail:
            error instanceof Error
              ? error.message
              : "Failed to render an image preview from the elevation PDF.",
        }),
    });

    const settingsFilePath = project.settingsFilePath ?? "cut2kit.settings.json";
    const artifactPaths = buildWallLayoutArtifactPaths(project, input.sourcePdfPath);

    const geometryDraft = yield* runCut2KitCodexJson({
      operation: "generateWallLayout.geometry",
      cwd: project.cwd,
      prompt: buildCut2KitWallGeometryPrompt({
        project,
        sourcePdfPath: input.sourcePdfPath,
        extractedText,
        promptTemplates: {
          systemPrompt: promptTemplateBundle.geometrySystem,
          userPrompt: promptTemplateBundle.geometryUser,
          validationChecklist: promptTemplateBundle.validationChecklist,
        },
      }),
      outputSchema: Cut2KitWallGeometrySchema,
      modelSelection,
      imagePaths: [previewImagePath],
      cleanupPaths: [previewImagePath],
    }).pipe(
      Effect.mapError(
        (cause) =>
          new Cut2KitProjectsError({
            cwd: project.cwd,
            operation: "generateWallLayout.geometry",
            detail: cause.detail,
            cause,
          }),
      ),
    );
    const geometry = normalizeWallGeometry({
      geometry: geometryDraft,
      sourcePdfPath: input.sourcePdfPath,
      settingsFilePath,
      extractedText,
      settings,
    });

    const writtenPaths: string[] = [];
    writtenPaths.push(
      yield* writeWorkspaceFile(
        project.cwd,
        artifactPaths.geometryJsonPath,
        encodeJsonFile(geometry),
      ),
    );

    const geometryValidationReport = buildWallValidationReport({
      sourcePdfPath: input.sourcePdfPath,
      settingsFilePath,
      checklistPath: promptTemplatePaths.validationChecklist,
      settings,
      geometry,
      framingLayout: null,
      sheathingLayout: null,
      confirmedAmbiguityProceeding: input.confirmedAmbiguityProceeding === true,
    });
    writtenPaths.push(
      yield* writeWorkspaceFile(
        project.cwd,
        artifactPaths.validationReportJsonPath,
        encodeJsonFile(geometryValidationReport),
      ),
    );

    if (geometryValidationReport.ambiguity.requiresConfirmation) {
      yield* workspaceEntries.invalidate(project.cwd);
      const refreshedProject = yield* inspectProject({ cwd: project.cwd });
      return {
        status: "needs_confirmation",
        statusMessage:
          geometryValidationReport.ambiguity.notes[0] ??
          "The elevation geometry is ambiguous and requires user confirmation before framing and sheathing generation can continue.",
        project: refreshedProject,
        sourcePdfPath: input.sourcePdfPath,
        artifacts: {
          geometryJsonPath: artifactPaths.geometryJsonPath,
          validationReportJsonPath: artifactPaths.validationReportJsonPath,
          framingJsonPath: artifactPaths.framingJsonPath,
          framingPdfPath: artifactPaths.framingPdfPath,
          sheathingJsonPath: artifactPaths.sheathingJsonPath,
          sheathingPdfPath: artifactPaths.sheathingPdfPath,
        },
        geometry,
        framingLayout: null,
        sheathingLayout: null,
        validationReport: geometryValidationReport,
        writtenPaths: [...new Set(writtenPaths)],
      };
    }

    const framingDraft = yield* runCut2KitCodexJson({
      operation: "generateWallLayout.framing",
      cwd: project.cwd,
      prompt: buildCut2KitFramingLayoutPrompt({
        project,
        sourcePdfPath: input.sourcePdfPath,
        geometry,
        promptTemplates: {
          systemPrompt: promptTemplateBundle.framingSystem,
          userPrompt: promptTemplateBundle.framingUser,
          validationChecklist: promptTemplateBundle.validationChecklist,
        },
      }),
      outputSchema: Cut2KitFramingLayoutV0_2_0Schema,
      modelSelection,
    }).pipe(
      Effect.mapError(
        (cause) =>
          new Cut2KitProjectsError({
            cwd: project.cwd,
            operation: "generateWallLayout.framing",
            detail: cause.detail,
            cause,
          }),
      ),
    );
    const framingLayout = normalizeFramingLayout({
      layout: framingDraft,
      geometry,
      settings,
      sourcePdfPath: input.sourcePdfPath,
      settingsFilePath,
    });
    writtenPaths.push(
      yield* writeWorkspaceFile(
        project.cwd,
        artifactPaths.framingJsonPath,
        encodeJsonFile(framingLayout),
      ),
    );

    const sheathingDraft = yield* runCut2KitCodexJson({
      operation: "generateWallLayout.sheathing",
      cwd: project.cwd,
      prompt: buildCut2KitSheathingLayoutPrompt({
        project,
        sourcePdfPath: input.sourcePdfPath,
        geometry,
        framingLayout,
        promptTemplates: {
          systemPrompt: promptTemplateBundle.sheathingSystem,
          userPrompt: promptTemplateBundle.sheathingUser,
          validationChecklist: promptTemplateBundle.validationChecklist,
        },
      }),
      outputSchema: Cut2KitSheathingLayoutSchema,
      modelSelection,
    }).pipe(
      Effect.mapError(
        (cause) =>
          new Cut2KitProjectsError({
            cwd: project.cwd,
            operation: "generateWallLayout.sheathing",
            detail: cause.detail,
            cause,
          }),
      ),
    );
    const sheathingLayout = normalizeSheathingLayout({
      layout: sheathingDraft,
      geometry,
      settings,
      sourcePdfPath: input.sourcePdfPath,
      settingsFilePath,
    });
    writtenPaths.push(
      yield* writeWorkspaceFile(
        project.cwd,
        artifactPaths.sheathingJsonPath,
        encodeJsonFile(sheathingLayout),
      ),
    );

    const validationReport = buildWallValidationReport({
      sourcePdfPath: input.sourcePdfPath,
      settingsFilePath,
      checklistPath: promptTemplatePaths.validationChecklist,
      settings,
      geometry,
      framingLayout,
      sheathingLayout,
      confirmedAmbiguityProceeding: input.confirmedAmbiguityProceeding === true,
    });

    if (!validationReport.readyForPackaging) {
      writtenPaths.push(
        yield* writeWorkspaceFile(
          project.cwd,
          artifactPaths.validationReportJsonPath,
          encodeJsonFile(validationReport),
        ),
      );
      yield* workspaceEntries.invalidate(project.cwd);
      const refreshedProject = yield* inspectProject({ cwd: project.cwd });
      return {
        status: "validation_blocked",
        statusMessage:
          validationReport.issues.find((issue) => issue.severity === "error")?.message ??
          "Validation blocked final PDF packaging for this wall layout run.",
        project: refreshedProject,
        sourcePdfPath: input.sourcePdfPath,
        artifacts: {
          geometryJsonPath: artifactPaths.geometryJsonPath,
          validationReportJsonPath: artifactPaths.validationReportJsonPath,
          framingJsonPath: artifactPaths.framingJsonPath,
          framingPdfPath: artifactPaths.framingPdfPath,
          sheathingJsonPath: artifactPaths.sheathingJsonPath,
          sheathingPdfPath: artifactPaths.sheathingPdfPath,
        },
        geometry,
        framingLayout,
        sheathingLayout,
        validationReport,
        writtenPaths: [...new Set(writtenPaths)],
      };
    }

    const framingPdfBytes = yield* Effect.tryPromise({
      try: () => renderFramingLayoutPdf(framingLayout),
      catch: (error) =>
        new Cut2KitProjectsError({
          cwd: project.cwd,
          operation: "generateWallLayout.renderFramingPdf",
          detail: error instanceof Error ? error.message : String(error),
        }),
    });
    const sheathingPdfBytes = yield* Effect.tryPromise({
      try: () =>
        renderSheathingLayoutPdf({
          layout: sheathingLayout,
          rendering: settings.rendering,
          pages: settings.sheathing.pages,
          fastening: settings.fastening,
        }),
      catch: (error) =>
        new Cut2KitProjectsError({
          cwd: project.cwd,
          operation: "generateWallLayout.renderSheathingPdf",
          detail: error instanceof Error ? error.message : String(error),
        }),
    });
    writtenPaths.push(
      yield* writeWorkspaceBytes(project.cwd, artifactPaths.framingPdfPath, framingPdfBytes),
    );
    writtenPaths.push(
      yield* writeWorkspaceBytes(project.cwd, artifactPaths.sheathingPdfPath, sheathingPdfBytes),
    );
    writtenPaths.push(
      yield* writeWorkspaceFile(
        project.cwd,
        artifactPaths.validationReportJsonPath,
        encodeJsonFile(validationReport),
      ),
    );

    yield* workspaceEntries.invalidate(project.cwd);
    const refreshedProject = yield* inspectProject({ cwd: project.cwd });

    return {
      status: "completed",
      statusMessage: null,
      project: refreshedProject,
      sourcePdfPath: input.sourcePdfPath,
      artifacts: {
        geometryJsonPath: artifactPaths.geometryJsonPath,
        validationReportJsonPath: artifactPaths.validationReportJsonPath,
        framingJsonPath: artifactPaths.framingJsonPath,
        framingPdfPath: artifactPaths.framingPdfPath,
        sheathingJsonPath: artifactPaths.sheathingJsonPath,
        sheathingPdfPath: artifactPaths.sheathingPdfPath,
      },
      geometry,
      framingLayout,
      sheathingLayout,
      validationReport,
      writtenPaths: [...new Set(writtenPaths)],
    };
  });

  const renderFramingLayout: Cut2KitProjectsShape["renderFramingLayout"] = Effect.fn(
    "Cut2KitProjects.renderFramingLayout",
  )(function* (input): Effect.fn.Return<Cut2KitRenderFramingLayoutResult, Cut2KitProjectsError> {
    const project = yield* inspectProject({ cwd: input.cwd });
    const framingLayoutResult = yield* Effect.tryPromise({
      try: () => readFramingLayoutFile(project.cwd, input.relativePath),
      catch: (error) =>
        new Cut2KitProjectsError({
          cwd: project.cwd,
          operation: "renderFramingLayout.readFramingLayoutFile",
          detail: error instanceof Error ? error.message : String(error),
        }),
    });

    if (framingLayoutResult.issues.length > 0 || framingLayoutResult.framingLayout === null) {
      return yield* new Cut2KitProjectsError({
        cwd: project.cwd,
        operation: "renderFramingLayout.validateFramingLayout",
        detail:
          framingLayoutResult.issues[0]?.message ?? "Framing layout JSON could not be validated.",
      });
    }

    const pdfBytes = yield* Effect.tryPromise({
      try: () => renderFramingLayoutPdf(framingLayoutResult.framingLayout!),
      catch: (error) =>
        new Cut2KitProjectsError({
          cwd: project.cwd,
          operation: "renderFramingLayout.renderPdf",
          detail: error instanceof Error ? error.message : String(error),
        }),
    });

    const pdfPath = input.relativePath.replace(/\.json$/i, ".pdf");
    const resolved = yield* workspacePaths
      .resolveRelativePathWithinRoot({
        workspaceRoot: project.cwd,
        relativePath: pdfPath,
      })
      .pipe(
        Effect.mapError(
          (cause) =>
            new Cut2KitProjectsError({
              cwd: project.cwd,
              operation: "renderFramingLayout.resolveRelativePathWithinRoot",
              detail: "Rendered PDF path escaped the workspace root.",
              cause,
            }),
        ),
      );

    yield* Effect.tryPromise({
      try: async () => {
        await fsPromises.mkdir(nodePath.dirname(resolved.absolutePath), { recursive: true });
        await fsPromises.writeFile(resolved.absolutePath, Buffer.from(pdfBytes));
      },
      catch: (error) =>
        new Cut2KitProjectsError({
          cwd: project.cwd,
          operation: "renderFramingLayout.writePdf",
          detail: error instanceof Error ? error.message : String(error),
        }),
    });

    yield* workspaceEntries.invalidate(project.cwd);
    const refreshedProject = yield* inspectProject({ cwd: project.cwd });

    return {
      project: refreshedProject,
      jsonPath: input.relativePath,
      pdfPath: resolved.relativePath,
      writtenPaths: [resolved.relativePath],
    };
  });

  const renderSheathingLayout: Cut2KitProjectsShape["renderSheathingLayout"] = Effect.fn(
    "Cut2KitProjects.renderSheathingLayout",
  )(function* (input): Effect.fn.Return<Cut2KitRenderSheathingLayoutResult, Cut2KitProjectsError> {
    const project = yield* inspectProject({ cwd: input.cwd });
    const settings = project.settings;
    if (!isWallWorkflowSettings(settings)) {
      return yield* new Cut2KitProjectsError({
        cwd: project.cwd,
        operation: "renderSheathingLayout.validateSettings",
        detail:
          "Cut2Kit settings must be valid wall-workflow settings before rendering a wall package PDF.",
      });
    }

    const sheathingLayoutResult = yield* Effect.tryPromise({
      try: () => readSheathingLayoutFile(project.cwd, input.relativePath, settings),
      catch: (error) =>
        new Cut2KitProjectsError({
          cwd: project.cwd,
          operation: "renderSheathingLayout.readSheathingLayoutFile",
          detail: error instanceof Error ? error.message : String(error),
        }),
    });

    if (sheathingLayoutResult.issues.length > 0 || sheathingLayoutResult.sheathingLayout === null) {
      return yield* new Cut2KitProjectsError({
        cwd: project.cwd,
        operation: "renderSheathingLayout.validateSheathingLayout",
        detail:
          sheathingLayoutResult.issues[0]?.message ??
          "Sheathing layout JSON could not be validated.",
      });
    }

    const sourcePdfPath = sheathingLayoutResult.sheathingLayout.sourcePdfPath;
    const artifactPaths = buildWallLayoutArtifactPaths(project, sourcePdfPath);
    const framingLayoutResult = yield* Effect.tryPromise({
      try: () => readFramingLayoutFile(project.cwd, artifactPaths.framingJsonPath),
      catch: (error) =>
        new Cut2KitProjectsError({
          cwd: project.cwd,
          operation: "renderSheathingLayout.readFramingLayoutFile",
          detail: error instanceof Error ? error.message : String(error),
        }),
    });

    if (framingLayoutResult.issues.length > 0 || framingLayoutResult.framingLayout === null) {
      return yield* new Cut2KitProjectsError({
        cwd: project.cwd,
        operation: "renderSheathingLayout.validateFramingLayout",
        detail:
          framingLayoutResult.issues[0]?.message ??
          "The framing layout JSON is required before the wall package can be rendered.",
      });
    }

    const normalizedFramingLayout = normalizeCompatibleFramingLayout(
      framingLayoutResult.framingLayout,
    );
    if (normalizedFramingLayout === null) {
      return yield* new Cut2KitProjectsError({
        cwd: project.cwd,
        operation: "renderSheathingLayout.normalizeFramingLayout",
        detail:
          "The framing layout JSON exists but could not be normalized for wall-package rendering.",
      });
    }

    const settingsFilePath = project.settingsFilePath ?? "cut2kit.settings.json";
    const framingLayout = normalizeFramingLayout({
      layout: normalizedFramingLayout,
      geometry: normalizedFramingLayout.geometry,
      settings,
      sourcePdfPath,
      settingsFilePath,
    });
    const sheathingLayout = normalizeSheathingLayout({
      layout: sheathingLayoutResult.sheathingLayout,
      geometry: framingLayout.geometry,
      settings,
      sourcePdfPath,
      settingsFilePath,
    });
    const { promptTemplatePaths } = yield* loadPromptTemplateBundleForProject(project);
    const validationReport = buildWallValidationReport({
      sourcePdfPath,
      settingsFilePath,
      checklistPath: promptTemplatePaths.validationChecklist,
      settings,
      geometry: framingLayout.geometry,
      framingLayout,
      sheathingLayout,
      confirmedAmbiguityProceeding: true,
    });

    const writtenPaths = [
      yield* writeWorkspaceFile(
        project.cwd,
        artifactPaths.validationReportJsonPath,
        encodeJsonFile(validationReport),
      ),
    ];

    if (!validationReport.readyForPackaging) {
      yield* workspaceEntries.invalidate(project.cwd);
      const refreshedProject = yield* inspectProject({ cwd: project.cwd });
      return {
        status: "validation_blocked",
        statusMessage:
          validationReport.issues.find((issue) => issue.severity === "error")?.message ??
          "Validation blocked final PDF packaging for this wall package run.",
        project: refreshedProject,
        jsonPath: input.relativePath,
        pdfPath: artifactPaths.sheathingPdfPath,
        validationReportJsonPath: artifactPaths.validationReportJsonPath,
        writtenPaths: [...new Set(writtenPaths)],
      };
    }

    const pdfBytes = yield* Effect.tryPromise({
      try: () =>
        renderSheathingLayoutPdf({
          layout: sheathingLayout,
          rendering: settings.rendering,
          pages: settings.sheathing.pages,
          fastening: settings.fastening,
        }),
      catch: (error) =>
        new Cut2KitProjectsError({
          cwd: project.cwd,
          operation: "renderSheathingLayout.renderPdf",
          detail: error instanceof Error ? error.message : String(error),
        }),
    });

    writtenPaths.push(
      yield* writeWorkspaceBytes(project.cwd, artifactPaths.sheathingPdfPath, pdfBytes),
    );

    yield* workspaceEntries.invalidate(project.cwd);
    const refreshedProject = yield* inspectProject({ cwd: project.cwd });

    return {
      status: "completed",
      statusMessage: null,
      project: refreshedProject,
      jsonPath: input.relativePath,
      pdfPath: artifactPaths.sheathingPdfPath,
      validationReportJsonPath: artifactPaths.validationReportJsonPath,
      writtenPaths: [...new Set(writtenPaths)],
    };
  });

  return {
    inspectProject,
    compileFramingPrompt,
    compileManufacturingPrompt,
    compileSheathingPrompt,
    generateOutputs,
    generateWallLayout,
    renderFramingLayout,
    renderSheathingLayout,
  } satisfies Cut2KitProjectsShape;
});

export const Cut2KitProjectsLive = Layer.effect(Cut2KitProjects, makeCut2KitProjects);
