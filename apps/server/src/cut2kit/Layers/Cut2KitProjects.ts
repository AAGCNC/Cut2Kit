import fsPromises from "node:fs/promises";
import nodePath from "node:path";

import { Effect, Layer, Schema } from "effect";

import {
  type Cut2KitApplication,
  type Cut2KitFileClassification,
  type Cut2KitFileRole,
  type Cut2KitGenerateOutputsResult,
  type Cut2KitIssue,
  type Cut2KitManufacturingPlan,
  type Cut2KitOutputSettings,
  type Cut2KitPanelCandidate,
  type Cut2KitPdfFileAssignment,
  type Cut2KitProject,
  type Cut2KitQueueMode,
  type Cut2KitQueueingSettings,
  type Cut2KitSettings,
  type Cut2KitSourceDocument,
  Cut2KitManufacturingPlan as Cut2KitManufacturingPlanSchema,
  Cut2KitSettings as Cut2KitSettingsSchema,
  type NCJobRecord,
  type NestManifest,
  type PanelManifest,
  type ProjectFileRecord,
  type QueueManifest,
} from "@t3tools/contracts";
import { formatSchemaError, fromLenientJson } from "@t3tools/shared/schemaJson";

import {
  Cut2KitProjects,
  Cut2KitProjectsError,
  type Cut2KitProjectsShape,
} from "../Services/Cut2KitProjects.ts";
import { A2mcPostError, getA2mcTargetController, renderA2mcProgram } from "../cam/A2mcPost.ts";
import { WorkspaceEntries } from "../../workspace/Services/WorkspaceEntries.ts";
import { WorkspacePaths } from "../../workspace/Services/WorkspacePaths.ts";

const SETTINGS_FILE_NAME = "cut2kit.settings.json";
const MANUFACTURING_PLAN_FILE_NAME = "cut2kit.manufacturing.json";
const MANIFEST_VERSION = "cut2kit.planning.v1";
const DEFAULT_DISCOVERED_AT = "1970-01-01T00:00:00.000Z";
const IGNORED_DIRECTORY_NAMES = new Set([".git", "node_modules", ".turbo", "dist", "build"]);
const SettingsJson = fromLenientJson(Cut2KitSettingsSchema);
const ManufacturingPlanJson = fromLenientJson(Cut2KitManufacturingPlanSchema);

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
  const assignment = settings?.pdf.fileAssignments.find((candidate) =>
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
  if (normalized.includes("/elevation") || normalized.includes("/elevations/") || side) {
    return {
      sourcePath: relativePath,
      fileName,
      classification: "elevation",
      application: "siding",
      side,
      assignmentSource: side ? "path" : "default",
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
    settings?.pdf.fileAssignments.some((candidate) =>
      matchAssignmentPattern(relativePath, candidate),
    ) ?? false
  );
}

function getPrimaryQueueMode(settings: Cut2KitSettings | null): Cut2KitQueueMode {
  return settings?.production.primaryMode === "line-side" ? "line-side" : "kitting";
}

function resolveOutputSettings(settings: Cut2KitSettings | null): Cut2KitOutputSettings {
  return settings?.output ?? DEFAULT_OUTPUT_SETTINGS;
}

function resolveQueueingSettings(settings: Cut2KitSettings | null): Cut2KitQueueingSettings {
  return settings?.queueing ?? DEFAULT_QUEUEING_SETTINGS;
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

function deriveProject(input: {
  cwd: string;
  files: ReadonlyArray<ProjectFileRecord>;
  settings: Cut2KitSettings | null;
  settingsFilePath: string | null;
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
        "error",
        "manufacturing_plan.missing",
        `Expected ${MANUFACTURING_PLAN_FILE_NAME} somewhere inside the project directory before A2MC outputs can be generated.`,
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

  if (
    input.settings !== null &&
    !input.settings.machineProfile.postProcessorId.toLowerCase().includes("a2mc")
  ) {
    issues.push(
      makeIssue(
        "warning",
        "machine_profile.post_processor_mismatch",
        "Machine profile postProcessorId does not reference A2MC, but Cut2Kit currently emits A2MC NC only.",
        input.settingsFilePath ?? undefined,
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
    manufacturingPlanFilePath: input.manufacturingPlanFilePath,
    manufacturingPlan: input.manufacturingPlan,
    files: input.files.toSorted(compareProjectFiles),
    issues,
    sourceDocuments,
    framingRules: input.settings?.framing ?? null,
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

    return deriveProject({
      cwd: normalizedCwd,
      files,
      settings: settingsResult.settings,
      settingsFilePath,
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

  return {
    inspectProject,
    generateOutputs,
  } satisfies Cut2KitProjectsShape;
});

export const Cut2KitProjectsLive = Layer.effect(Cut2KitProjects, makeCut2KitProjects);
