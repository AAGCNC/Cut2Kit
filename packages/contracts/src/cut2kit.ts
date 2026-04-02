import { Schema } from "effect";
import { IsoDateTime, NonNegativeInt, PositiveInt, TrimmedNonEmptyString } from "./baseSchemas";

export const CUT2KIT_SETTINGS_SCHEMA_VERSIONS = ["0.1.0"] as const;

export const Cut2KitSettingsSchemaVersion = Schema.Literals(CUT2KIT_SETTINGS_SCHEMA_VERSIONS);
export type Cut2KitSettingsSchemaVersion = typeof Cut2KitSettingsSchemaVersion.Type;

export const Cut2KitUnits = Schema.Literals(["imperial", "metric"]);
export type Cut2KitUnits = typeof Cut2KitUnits.Type;

export const Cut2KitProductionMode = Schema.Literals(["kitting", "line-side"]);
export type Cut2KitProductionMode = typeof Cut2KitProductionMode.Type;

export const Cut2KitApplication = Schema.Literals(["siding", "flooring", "roofing"]);
export type Cut2KitApplication = typeof Cut2KitApplication.Type;

export const Cut2KitQueueMode = Schema.Literals(["kitting", "line-side"]);
export type Cut2KitQueueMode = typeof Cut2KitQueueMode.Type;

export const Cut2KitFileKind = Schema.Literals(["file", "directory"]);
export type Cut2KitFileKind = typeof Cut2KitFileKind.Type;

export const Cut2KitFileClassification = Schema.Literals([
  "directory",
  "settings",
  "dxf",
  "manifest",
  "nc",
  "json",
  "pdf",
  "image",
  "text",
  "other",
]);
export type Cut2KitFileClassification = typeof Cut2KitFileClassification.Type;

export const Cut2KitFileRole = Schema.Literals([
  "settings",
  "source-dxf",
  "generated-manifest",
  "generated-nc",
  "reference",
  "other",
]);
export type Cut2KitFileRole = typeof Cut2KitFileRole.Type;

export const Cut2KitIssueSeverity = Schema.Literals(["info", "warning", "error"]);
export type Cut2KitIssueSeverity = typeof Cut2KitIssueSeverity.Type;

export const Cut2KitProjectStatus = Schema.Literals(["ready", "warning", "error"]);
export type Cut2KitProjectStatus = typeof Cut2KitProjectStatus.Type;

export const Cut2KitSourceDocumentKind = Schema.Literals([
  "elevation",
  "floor",
  "roof",
  "reference",
  "unknown",
]);
export type Cut2KitSourceDocumentKind = typeof Cut2KitSourceDocumentKind.Type;

export const Cut2KitSourceDocumentAssignmentSource = Schema.Literals([
  "settings",
  "path",
  "default",
]);
export type Cut2KitSourceDocumentAssignmentSource =
  typeof Cut2KitSourceDocumentAssignmentSource.Type;

const Cut2KitCompassReference = Schema.Literals([
  "north",
  "south",
  "east",
  "west",
  "front",
  "rear",
  "left",
  "right",
]);

const Cut2KitDirectionalReference = Schema.Literals([
  "north_south",
  "east_west",
  "north",
  "south",
  "east",
  "west",
  "front",
  "rear",
  "left",
  "right",
  "customer_defined",
]);

const Cut2KitDxfClassification = Schema.Literals(["elevation", "floor", "roof", "reference"]);
const Cut2KitStudContinuityPolicy = Schema.Literals([
  "continuous",
  "stop_at_openings",
  "customer_defined",
]);
const Cut2KitOpeningEdgePolicy = Schema.Literals([
  "single_stud_at_openings",
  "double_stud_at_openings",
]);
const Cut2KitPanelBreakPreference = Schema.Literals([
  "avoid_break_through_opening",
  "allow_break_through_opening",
]);
const Cut2KitPanelizationStrategy = Schema.Literals(["rule_driven", "manual_assist"]);
const Cut2KitNestingStrategy = Schema.Literals([
  "deterministic",
  "deterministic_with_ai_suggestions",
]);
const Cut2KitQueueGrouping = Schema.Literals(["assembly_zone", "production_flow", "house_side"]);
const Cut2KitOverwritePolicy = Schema.Literals([
  "overwrite",
  "skip_if_exists",
  "version_if_exists",
]);
const Cut2KitLayerMappingKey = Schema.Literals([
  "outline",
  "openings",
  "studs",
  "joists",
  "dimensions",
  "annotations",
]);

const StringArray = Schema.Array(TrimmedNonEmptyString);

export const Cut2KitProjectMetadata = Schema.Struct({
  projectId: TrimmedNonEmptyString,
  jobName: TrimmedNonEmptyString,
  customer: TrimmedNonEmptyString,
  site: TrimmedNonEmptyString,
  description: Schema.optionalKey(TrimmedNonEmptyString),
  units: Cut2KitUnits,
});
export type Cut2KitProjectMetadata = typeof Cut2KitProjectMetadata.Type;

export const Cut2KitProductionSettings = Schema.Struct({
  primaryMode: Cut2KitProductionMode,
  allowLineSideQueue: Schema.Boolean,
  applications: Schema.Array(Cut2KitApplication),
});
export type Cut2KitProductionSettings = typeof Cut2KitProductionSettings.Type;

export const Cut2KitMachineProfile = Schema.Struct({
  profileId: TrimmedNonEmptyString,
  postProcessorId: TrimmedNonEmptyString,
  stockCatalogId: TrimmedNonEmptyString,
});
export type Cut2KitMachineProfile = typeof Cut2KitMachineProfile.Type;

export const Cut2KitDiscoverySettings = Schema.Struct({
  searchRecursively: Schema.Boolean,
  preferredFolders: Schema.Array(TrimmedNonEmptyString),
  knownSettingsFileNames: Schema.Array(TrimmedNonEmptyString),
});
export type Cut2KitDiscoverySettings = typeof Cut2KitDiscoverySettings.Type;

export const Cut2KitDxfFileAssignment = Schema.Struct({
  pathPattern: TrimmedNonEmptyString,
  classification: Cut2KitDxfClassification,
  side: Schema.optionalKey(TrimmedNonEmptyString),
  application: Cut2KitApplication,
});
export type Cut2KitDxfFileAssignment = typeof Cut2KitDxfFileAssignment.Type;

export const Cut2KitDxfSettings = Schema.Struct({
  defaultUnits: TrimmedNonEmptyString,
  autoClassify: Schema.Boolean,
  layerMappings: Schema.Record(Cut2KitLayerMappingKey, StringArray),
  fileAssignments: Schema.Array(Cut2KitDxfFileAssignment),
});
export type Cut2KitDxfSettings = typeof Cut2KitDxfSettings.Type;

const Cut2KitStudRules = Schema.Struct({
  enabled: Schema.Boolean,
  onCenter: PositiveInt,
  originReference: Cut2KitCompassReference,
  continuityPolicy: Cut2KitStudContinuityPolicy,
  openingEdgePolicy: Cut2KitOpeningEdgePolicy,
  allowMidBreakPanelSeam: Schema.Boolean,
  drywallAlignmentPreference: Schema.Boolean,
  endCondition: TrimmedNonEmptyString,
});

const Cut2KitJoistRules = Schema.Struct({
  enabled: Schema.Boolean,
  direction: Cut2KitDirectionalReference,
  onCenter: PositiveInt,
  originReference: Cut2KitCompassReference,
  continuityPolicy: Cut2KitStudContinuityPolicy,
});

const Cut2KitHeadersAndTrimmersRules = Schema.Struct({
  autoGenerateWhenOpeningsExist: Schema.Boolean,
  openingEdgeClearance: Schema.Number,
});

export const FramingRuleSet = Schema.Struct({
  studs: Cut2KitStudRules,
  joists: Cut2KitJoistRules,
  headersAndTrimmers: Cut2KitHeadersAndTrimmersRules,
});
export type FramingRuleSet = typeof FramingRuleSet.Type;

export const Cut2KitOpeningPolicy = Schema.Struct({
  requiresExplicitOpeningGeometry: Schema.Boolean,
  doubleStudDefault: Schema.Boolean,
  panelBreakPreference: Cut2KitPanelBreakPreference,
});
export type Cut2KitOpeningPolicy = typeof Cut2KitOpeningPolicy.Type;

export const Cut2KitOpeningSettings = Schema.Struct({
  windowPolicy: Cut2KitOpeningPolicy,
  doorPolicy: Cut2KitOpeningPolicy,
});
export type Cut2KitOpeningSettings = typeof Cut2KitOpeningSettings.Type;

export const Cut2KitPanelizationSettings = Schema.Struct({
  strategy: Cut2KitPanelizationStrategy,
  targetPanelWidth: PositiveInt,
  maxPanelWidth: PositiveInt,
  maxPanelHeight: PositiveInt,
  minPanelWidth: PositiveInt,
  minPanelHeight: PositiveInt,
  edgeTrimAllowance: Schema.Number,
  kerfAllowance: Schema.Number,
  seamPriority: Schema.Array(TrimmedNonEmptyString),
  perApplication: Schema.Record(
    Cut2KitApplication,
    Schema.Struct({
      grainOrOrientation: TrimmedNonEmptyString,
      preferredBreakDirection: TrimmedNonEmptyString,
    }),
  ),
});
export type Cut2KitPanelizationSettings = typeof Cut2KitPanelizationSettings.Type;

export const Cut2KitNestingSettings = Schema.Struct({
  strategy: Cut2KitNestingStrategy,
  sortPriority: Schema.Array(TrimmedNonEmptyString),
  optimizeFor: TrimmedNonEmptyString,
  allowRotation: Schema.Boolean,
  groupByHouseSide: Schema.Boolean,
  maxConcurrentNests: PositiveInt,
});
export type Cut2KitNestingSettings = typeof Cut2KitNestingSettings.Type;

const Cut2KitQueueModeSettings = Schema.Struct({
  enabled: Schema.Boolean,
  groupBy: Cut2KitQueueGrouping,
  sequence: Schema.Array(TrimmedNonEmptyString),
  outputPrefix: TrimmedNonEmptyString,
});

export const Cut2KitQueueingSettings = Schema.Struct({
  kitting: Cut2KitQueueModeSettings,
  lineSide: Cut2KitQueueModeSettings,
});
export type Cut2KitQueueingSettings = typeof Cut2KitQueueingSettings.Type;

export const Cut2KitOutputSettings = Schema.Struct({
  root: TrimmedNonEmptyString,
  manifestsDir: TrimmedNonEmptyString,
  ncDir: TrimmedNonEmptyString,
  reportsDir: TrimmedNonEmptyString,
  overwritePolicy: Cut2KitOverwritePolicy,
});
export type Cut2KitOutputSettings = typeof Cut2KitOutputSettings.Type;

export const Cut2KitAiSettings = Schema.Struct({
  enabled: Schema.Boolean,
  agentName: TrimmedNonEmptyString,
  provider: TrimmedNonEmptyString,
  model: TrimmedNonEmptyString,
  reasoningEffort: TrimmedNonEmptyString,
  preferFastServiceTierWhenAvailable: Schema.Boolean,
  approvalRequiredForRuleEdits: Schema.Boolean,
  approvalRequiredForQueueGeneration: Schema.Boolean,
  allowedTasks: Schema.Array(TrimmedNonEmptyString),
});
export type Cut2KitAiSettings = typeof Cut2KitAiSettings.Type;

export const Cut2KitSettingsV0_1_0 = Schema.Struct({
  schemaVersion: Schema.Literal("0.1.0"),
  project: Cut2KitProjectMetadata,
  production: Cut2KitProductionSettings,
  machineProfile: Cut2KitMachineProfile,
  discovery: Cut2KitDiscoverySettings,
  dxf: Cut2KitDxfSettings,
  framing: FramingRuleSet,
  openings: Cut2KitOpeningSettings,
  panelization: Cut2KitPanelizationSettings,
  nesting: Cut2KitNestingSettings,
  queueing: Cut2KitQueueingSettings,
  output: Cut2KitOutputSettings,
  ai: Cut2KitAiSettings,
});

export const Cut2KitSettings = Schema.Union([Cut2KitSettingsV0_1_0]);
export type Cut2KitSettings = typeof Cut2KitSettings.Type;

export const Cut2KitIssue = Schema.Struct({
  severity: Cut2KitIssueSeverity,
  code: TrimmedNonEmptyString,
  message: TrimmedNonEmptyString,
  path: Schema.optionalKey(TrimmedNonEmptyString),
});
export type Cut2KitIssue = typeof Cut2KitIssue.Type;

export const ProjectFileRecord = Schema.Struct({
  relativePath: TrimmedNonEmptyString,
  name: TrimmedNonEmptyString,
  parentPath: Schema.optionalKey(TrimmedNonEmptyString),
  kind: Cut2KitFileKind,
  classification: Cut2KitFileClassification,
  role: Cut2KitFileRole,
  extension: Schema.optionalKey(TrimmedNonEmptyString),
  depth: NonNegativeInt,
  sizeBytes: Schema.NullOr(NonNegativeInt),
});
export type ProjectFileRecord = typeof ProjectFileRecord.Type;

export const Cut2KitSourceDocument = Schema.Struct({
  sourcePath: TrimmedNonEmptyString,
  fileName: TrimmedNonEmptyString,
  classification: Cut2KitSourceDocumentKind,
  application: Schema.NullOr(Cut2KitApplication),
  side: Schema.NullOr(TrimmedNonEmptyString),
  assignmentSource: Cut2KitSourceDocumentAssignmentSource,
});
export type Cut2KitSourceDocument = typeof Cut2KitSourceDocument.Type;

export const Cut2KitPanelCandidate = Schema.Struct({
  panelId: TrimmedNonEmptyString,
  sourcePath: TrimmedNonEmptyString,
  application: Schema.NullOr(Cut2KitApplication),
  side: Schema.NullOr(TrimmedNonEmptyString),
  placeholderStrategy: TrimmedNonEmptyString,
  kitGroup: TrimmedNonEmptyString,
});
export type Cut2KitPanelCandidate = typeof Cut2KitPanelCandidate.Type;

export const PanelManifestPanel = Schema.Struct({
  panelId: TrimmedNonEmptyString,
  sourcePath: TrimmedNonEmptyString,
  application: Schema.NullOr(Cut2KitApplication),
  side: Schema.NullOr(TrimmedNonEmptyString),
  kitGroup: TrimmedNonEmptyString,
  placeholderOnly: Schema.Boolean,
});
export type PanelManifestPanel = typeof PanelManifestPanel.Type;

export const PanelManifest = Schema.Struct({
  manifestVersion: TrimmedNonEmptyString,
  projectId: TrimmedNonEmptyString,
  mode: Cut2KitQueueMode,
  panels: Schema.Array(PanelManifestPanel),
});
export type PanelManifest = typeof PanelManifest.Type;

export const NestManifestNest = Schema.Struct({
  nestId: TrimmedNonEmptyString,
  application: Schema.NullOr(Cut2KitApplication),
  panelIds: Schema.Array(TrimmedNonEmptyString),
  placeholderOnly: Schema.Boolean,
});
export type NestManifestNest = typeof NestManifestNest.Type;

export const NestManifest = Schema.Struct({
  manifestVersion: TrimmedNonEmptyString,
  projectId: TrimmedNonEmptyString,
  nests: Schema.Array(NestManifestNest),
});
export type NestManifest = typeof NestManifest.Type;

export const QueueManifestEntry = Schema.Struct({
  queueId: TrimmedNonEmptyString,
  mode: Cut2KitQueueMode,
  jobId: TrimmedNonEmptyString,
  sourcePath: TrimmedNonEmptyString,
  groupKey: TrimmedNonEmptyString,
  sequenceIndex: NonNegativeInt,
  application: Schema.NullOr(Cut2KitApplication),
});
export type QueueManifestEntry = typeof QueueManifestEntry.Type;

export const QueueManifest = Schema.Struct({
  manifestVersion: TrimmedNonEmptyString,
  projectId: TrimmedNonEmptyString,
  primaryMode: Cut2KitProductionMode,
  entries: Schema.Array(QueueManifestEntry),
});
export type QueueManifest = typeof QueueManifest.Type;

export const NCJobRecord = Schema.Struct({
  jobId: TrimmedNonEmptyString,
  sourcePath: TrimmedNonEmptyString,
  relativeOutputPath: TrimmedNonEmptyString,
  queueMode: Cut2KitQueueMode,
  queueGroup: TrimmedNonEmptyString,
  sequenceIndex: NonNegativeInt,
  application: Schema.NullOr(Cut2KitApplication),
  placeholderProgram: TrimmedNonEmptyString,
});
export type NCJobRecord = typeof NCJobRecord.Type;

export const Cut2KitOutputStatus = Schema.Struct({
  generated: Schema.Boolean,
  manifestPaths: Schema.Array(TrimmedNonEmptyString),
  ncFilePaths: Schema.Array(TrimmedNonEmptyString),
});
export type Cut2KitOutputStatus = typeof Cut2KitOutputStatus.Type;

export const Cut2KitProjectSummary = Schema.Struct({
  totalFiles: NonNegativeInt,
  totalDirectories: NonNegativeInt,
  dxfCount: NonNegativeInt,
  settingsCount: NonNegativeInt,
  warningCount: NonNegativeInt,
  errorCount: NonNegativeInt,
  recognizedFileCount: NonNegativeInt,
  outputNcCount: NonNegativeInt,
});
export type Cut2KitProjectSummary = typeof Cut2KitProjectSummary.Type;

export const Cut2KitProject = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  name: TrimmedNonEmptyString,
  discoveredAt: IsoDateTime,
  status: Cut2KitProjectStatus,
  settingsFilePath: Schema.NullOr(TrimmedNonEmptyString),
  settings: Schema.NullOr(Cut2KitSettings),
  files: Schema.Array(ProjectFileRecord),
  issues: Schema.Array(Cut2KitIssue),
  sourceDocuments: Schema.Array(Cut2KitSourceDocument),
  framingRules: Schema.NullOr(FramingRuleSet),
  panelCandidates: Schema.Array(Cut2KitPanelCandidate),
  panelManifest: PanelManifest,
  nestManifest: NestManifest,
  queueManifest: QueueManifest,
  ncJobs: Schema.Array(NCJobRecord),
  outputStatus: Cut2KitOutputStatus,
  summary: Cut2KitProjectSummary,
});
export type Cut2KitProject = typeof Cut2KitProject.Type;

export const Cut2KitInspectProjectInput = Schema.Struct({
  cwd: TrimmedNonEmptyString,
});
export type Cut2KitInspectProjectInput = typeof Cut2KitInspectProjectInput.Type;

export const Cut2KitGenerateOutputsInput = Schema.Struct({
  cwd: TrimmedNonEmptyString,
});
export type Cut2KitGenerateOutputsInput = typeof Cut2KitGenerateOutputsInput.Type;

export const Cut2KitGenerateOutputsResult = Schema.Struct({
  project: Cut2KitProject,
  writtenPaths: Schema.Array(TrimmedNonEmptyString),
});
export type Cut2KitGenerateOutputsResult = typeof Cut2KitGenerateOutputsResult.Type;

export class Cut2KitProjectError extends Schema.TaggedErrorClass<Cut2KitProjectError>()(
  "Cut2KitProjectError",
  {
    cwd: TrimmedNonEmptyString,
    operation: TrimmedNonEmptyString,
    detail: TrimmedNonEmptyString,
    cause: Schema.optional(Schema.Defect),
  },
) {}
