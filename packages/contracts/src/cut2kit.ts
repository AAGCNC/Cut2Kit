import { Schema } from "effect";
import { IsoDateTime, NonNegativeInt, PositiveInt, TrimmedNonEmptyString } from "./baseSchemas";

export const CUT2KIT_SETTINGS_SCHEMA_VERSIONS = ["0.3.0"] as const;

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
  "manufacturing-plan",
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
  "manufacturing-plan",
  "source-pdf",
  "generated-manifest",
  "generated-nc",
  "generated-report",
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

const Cut2KitPdfClassification = Schema.Literals(["elevation", "floor", "roof", "reference"]);
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

export const Cut2KitPdfFileAssignment = Schema.Struct({
  pathPattern: TrimmedNonEmptyString,
  classification: Cut2KitPdfClassification,
  side: Schema.optionalKey(TrimmedNonEmptyString),
  application: Cut2KitApplication,
});
export type Cut2KitPdfFileAssignment = typeof Cut2KitPdfFileAssignment.Type;

const Cut2KitElevationGeometrySource = Schema.Literals(["dimension_text", "drawn_geometry"]);
const Cut2KitElevationHorizontalDimensionMode = Schema.Literal("cumulative_from_left_edge");
const Cut2KitElevationOpeningPairingStrategy = Schema.Literal("consecutive_pairs");
const Cut2KitElevationOpeningTypeInference = Schema.Literal("sill_line_detection");
const Cut2KitWallEdge = Schema.Literals(["left", "right"]);
const Cut2KitWallDirection = Schema.Literals(["left_to_right", "right_to_left"]);
const Cut2KitLeftJambOffsetMode = Schema.Literals(["shift_left", "none"]);
const Cut2KitMemberContinuity = Schema.Literals(["continuous"]);
const Cut2KitDrawingOrientation = Schema.Literals(["flat", "on_edge"]);
const Cut2KitInstalledSheetOrientation = Schema.Literals(["vertical", "horizontal"]);
const Cut2KitSheetRunDirection = Schema.Literals(["left_to_right", "right_to_left"]);
const Cut2KitSupportedEdgeBehavior = Schema.Literals(["edges_over_framing_or_blocking"]);
const Cut2KitPageSize = Schema.Literals(["letter", "a4"]);
const Cut2KitPageOrientation = Schema.Literals(["landscape", "portrait"]);
const Cut2KitDimensionFormat = Schema.Literals(["feet-and-inches", "decimal-inch"]);

export const Cut2KitNcUnits = Schema.Literals(["inch", "metric"]);
export type Cut2KitNcUnits = typeof Cut2KitNcUnits.Type;

const Cut2KitMargins = Schema.Struct({
  left: Schema.Number,
  right: Schema.Number,
  top: Schema.Number,
  bottom: Schema.Number,
});

export const Cut2KitElevationIntakeSettings = Schema.Struct({
  enabled: Schema.Boolean,
  explicitDimensionsAreAuthoritative: Schema.Boolean,
  geometrySourcePriority: Schema.Array(Cut2KitElevationGeometrySource),
  horizontalDimensionMode: Cut2KitElevationHorizontalDimensionMode,
  openingPairingStrategy: Cut2KitElevationOpeningPairingStrategy,
  openingTypeInference: Cut2KitElevationOpeningTypeInference,
  requireCommonHeadHeight: Schema.Boolean,
  requireCommonWindowSillHeight: Schema.Boolean,
  units: Cut2KitNcUnits,
  ambiguityHandling: Schema.Struct({
    stopOnMissingDimensions: Schema.Boolean,
    stopOnConflictingDimensions: Schema.Boolean,
    stopOnIncompleteOpeningGeometry: Schema.Boolean,
    requireUserConfirmationToContinue: Schema.Boolean,
  }),
});
export type Cut2KitElevationIntakeSettings = typeof Cut2KitElevationIntakeSettings.Type;

export const Cut2KitInputSettings = Schema.Struct({
  autoClassify: Schema.Boolean,
  fileAssignments: Schema.Array(Cut2KitPdfFileAssignment),
  elevationIntake: Cut2KitElevationIntakeSettings,
});
export type Cut2KitInputSettings = typeof Cut2KitInputSettings.Type;

export const Cut2KitArtifactsSettings = Schema.Struct({
  wallLayoutsDir: TrimmedNonEmptyString,
  framingLayoutsDir: TrimmedNonEmptyString,
  sheathingLayoutsDir: TrimmedNonEmptyString,
});
export type Cut2KitArtifactsSettings = typeof Cut2KitArtifactsSettings.Type;

export const Cut2KitFramingMaterialSettings = Schema.Struct({
  label: TrimmedNonEmptyString,
  nominalSize: TrimmedNonEmptyString,
  thickness: Schema.Number,
  depth: Schema.Number,
});
export type Cut2KitFramingMaterialSettings = typeof Cut2KitFramingMaterialSettings.Type;

const Cut2KitPlateSettings = Schema.Struct({
  enabled: Schema.Boolean,
  continuity: Cut2KitMemberContinuity,
  orientationInElevation: Cut2KitDrawingOrientation,
});

export const Cut2KitFramingSettings = Schema.Struct({
  enabled: Schema.Boolean,
  material: Cut2KitFramingMaterialSettings,
  plates: Schema.Struct({
    top: Cut2KitPlateSettings,
    bottom: Cut2KitPlateSettings,
  }),
  horizontalMembers: Schema.Struct({
    orientationInElevation: Cut2KitDrawingOrientation,
  }),
  endStuds: Schema.Struct({
    leftCount: PositiveInt,
    rightCount: PositiveInt,
  }),
  jambStuds: Schema.Struct({
    countPerSide: PositiveInt,
    leftOffsetMode: Cut2KitLeftJambOffsetMode,
    leftOffset: Schema.Number,
    preserveClearOpenings: Schema.Boolean,
  }),
  studLayout: Schema.Struct({
    enabled: Schema.Boolean,
    spacing: PositiveInt,
    originSide: Cut2KitWallEdge,
    direction: Cut2KitWallDirection,
    stopBeforeNextBearingStudWithinOrEqual: PositiveInt,
  }),
  openings: Schema.Struct({
    clearArchitecturalOpenings: Schema.Boolean,
    headMember: Schema.Struct({
      windows: Schema.Boolean,
      doors: Schema.Boolean,
    }),
    sillMember: Schema.Struct({
      windows: Schema.Boolean,
      doors: Schema.Boolean,
    }),
  }),
  crippleStuds: Schema.Struct({
    aboveHeads: Schema.Boolean,
    belowWindowSills: Schema.Boolean,
    splitGridStudsInsideOpenings: Schema.Boolean,
  }),
  labeling: Schema.Struct({
    includeMemberSchedule: Schema.Boolean,
    includeStudCenterSchedule: Schema.Boolean,
  }),
});
export type Cut2KitFramingSettings = typeof Cut2KitFramingSettings.Type;

export const Cut2KitSheathingSettings = Schema.Struct({
  enabled: Schema.Boolean,
  materialLabel: TrimmedNonEmptyString,
  panelThickness: Schema.Number,
  sheet: Schema.Struct({
    nominalWidth: PositiveInt,
    nominalHeight: PositiveInt,
    installedOrientation: Cut2KitInstalledSheetOrientation,
    runDirection: Cut2KitSheetRunDirection,
    allowTerminalRip: Schema.Boolean,
  }),
  openingsRemainUncovered: Schema.Boolean,
  pages: Schema.Struct({
    includeOverallLayoutPage: Schema.Boolean,
    includePerSheetCutoutPages: Schema.Boolean,
  }),
  notes: Schema.Struct({
    includeDisclaimer: Schema.Boolean,
    panelEdgeGap: Schema.Number,
    supportedEdgeBehavior: Cut2KitSupportedEdgeBehavior,
  }),
});
export type Cut2KitSheathingSettings = typeof Cut2KitSheathingSettings.Type;

export const Cut2KitFasteningSettings = Schema.Struct({
  enabled: Schema.Boolean,
  includePage: Schema.Boolean,
  typicalReferenceOnly: Schema.Boolean,
  supportedEdgeSpacing: PositiveInt,
  fieldSpacing: PositiveInt,
  edgeDistance: Schema.Number,
  includeOverdrivingWarning: Schema.Boolean,
  disclaimerText: TrimmedNonEmptyString,
  noteLines: Schema.Array(TrimmedNonEmptyString),
});
export type Cut2KitFasteningSettings = typeof Cut2KitFasteningSettings.Type;

const Cut2KitFramingRenderingSettings = Schema.Struct({
  pageSize: Cut2KitPageSize,
  pageOrientation: Cut2KitPageOrientation,
  margins: Cut2KitMargins,
  includeMemberSchedule: Schema.Boolean,
  titleTemplate: TrimmedNonEmptyString,
  subtitleTemplate: TrimmedNonEmptyString,
});

const Cut2KitSheathingRenderingSettings = Schema.Struct({
  pageSize: Cut2KitPageSize,
  pageOrientation: Cut2KitPageOrientation,
  margins: Cut2KitMargins,
  scaleToFitFirstPage: Schema.Boolean,
  cutoutDetailsPerPage: PositiveInt,
  titleTemplate: TrimmedNonEmptyString,
  subtitleTemplate: TrimmedNonEmptyString,
  fasteningTitleTemplate: TrimmedNonEmptyString,
});

export const Cut2KitRenderingSettings = Schema.Struct({
  units: Cut2KitNcUnits,
  dimensionFormat: Cut2KitDimensionFormat,
  framing: Cut2KitFramingRenderingSettings,
  sheathing: Cut2KitSheathingRenderingSettings,
});
export type Cut2KitRenderingSettings = typeof Cut2KitRenderingSettings.Type;

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

const Cut2KitAiGenerationStep = Schema.Literals([
  "extract_wall_geometry",
  "generate_framing_layout",
  "generate_sheathing_layout",
  "validate_and_package",
]);

const Cut2KitPromptTemplatePaths = Schema.Struct({
  geometrySystem: TrimmedNonEmptyString,
  geometryUser: TrimmedNonEmptyString,
  framingSystem: TrimmedNonEmptyString,
  framingUser: TrimmedNonEmptyString,
  sheathingSystem: TrimmedNonEmptyString,
  sheathingUser: TrimmedNonEmptyString,
  validationChecklist: TrimmedNonEmptyString,
});
export type Cut2KitPromptTemplatePaths = typeof Cut2KitPromptTemplatePaths.Type;

export const Cut2KitPromptTemplateSource = Schema.Literals([
  "workspace",
  "repo_default",
  "external",
]);
export type Cut2KitPromptTemplateSource = typeof Cut2KitPromptTemplateSource.Type;

export const Cut2KitResolvedPromptTemplate = Schema.Struct({
  configuredPath: TrimmedNonEmptyString,
  resolvedPath: TrimmedNonEmptyString,
  source: Cut2KitPromptTemplateSource,
  contents: Schema.String,
});
export type Cut2KitResolvedPromptTemplate = typeof Cut2KitResolvedPromptTemplate.Type;

export const Cut2KitResolvedPromptTemplates = Schema.Struct({
  geometrySystem: Cut2KitResolvedPromptTemplate,
  geometryUser: Cut2KitResolvedPromptTemplate,
  framingSystem: Cut2KitResolvedPromptTemplate,
  framingUser: Cut2KitResolvedPromptTemplate,
  sheathingSystem: Cut2KitResolvedPromptTemplate,
  sheathingUser: Cut2KitResolvedPromptTemplate,
  validationChecklist: Cut2KitResolvedPromptTemplate,
});
export type Cut2KitResolvedPromptTemplates = typeof Cut2KitResolvedPromptTemplates.Type;

export const Cut2KitAiSettings = Schema.Struct({
  enabled: Schema.Boolean,
  agentName: TrimmedNonEmptyString,
  provider: Schema.Literal("codex"),
  model: Schema.Literal("gpt-5.4"),
  reasoningEffort: Schema.Literal("xhigh"),
  primaryWorkflow: Schema.Literal("ai-first-wall-layout"),
  runtimeGenerationOrder: Schema.Array(Cut2KitAiGenerationStep),
  promptTemplatePaths: Cut2KitPromptTemplatePaths,
});
export type Cut2KitAiSettings = typeof Cut2KitAiSettings.Type;

export const Cut2KitControllerTarget = Schema.Literals(["axyz-a2mc"]);
export type Cut2KitControllerTarget = typeof Cut2KitControllerTarget.Type;

export const Cut2KitWorkOffset = Schema.Literals(["G54", "G55", "G56", "G57", "G58", "G59"]);
export type Cut2KitWorkOffset = typeof Cut2KitWorkOffset.Type;

export const Cut2KitSpindleDirection = Schema.Literals(["cw", "ccw"]);
export type Cut2KitSpindleDirection = typeof Cut2KitSpindleDirection.Type;

export const Cut2KitParkPosition = Schema.Struct({
  x: Schema.Number,
  y: Schema.Number,
  z: Schema.Number,
});
export type Cut2KitParkPosition = typeof Cut2KitParkPosition.Type;

export const Cut2KitToolChangeOperation = Schema.Struct({
  type: Schema.Literal("tool_change"),
  toolNumber: PositiveInt,
});
export type Cut2KitToolChangeOperation = typeof Cut2KitToolChangeOperation.Type;

export const Cut2KitSpindleOnOperation = Schema.Struct({
  type: Schema.Literal("spindle_on"),
  direction: Cut2KitSpindleDirection,
  rpm: PositiveInt,
});
export type Cut2KitSpindleOnOperation = typeof Cut2KitSpindleOnOperation.Type;

export const Cut2KitSpindleStopOperation = Schema.Struct({
  type: Schema.Literal("spindle_stop"),
});
export type Cut2KitSpindleStopOperation = typeof Cut2KitSpindleStopOperation.Type;

export const Cut2KitRapidMoveOperation = Schema.Struct({
  type: Schema.Literal("rapid_move"),
  x: Schema.optionalKey(Schema.Number),
  y: Schema.optionalKey(Schema.Number),
  z: Schema.optionalKey(Schema.Number),
});
export type Cut2KitRapidMoveOperation = typeof Cut2KitRapidMoveOperation.Type;

export const Cut2KitLinearMoveOperation = Schema.Struct({
  type: Schema.Literal("linear_move"),
  x: Schema.optionalKey(Schema.Number),
  y: Schema.optionalKey(Schema.Number),
  z: Schema.optionalKey(Schema.Number),
  feed: Schema.optionalKey(Schema.Number),
});
export type Cut2KitLinearMoveOperation = typeof Cut2KitLinearMoveOperation.Type;

export const Cut2KitArcMoveOperation = Schema.Struct({
  type: Schema.Literal("arc_move"),
  direction: Cut2KitSpindleDirection,
  x: Schema.Number,
  y: Schema.Number,
  z: Schema.optionalKey(Schema.Number),
  i: Schema.Number,
  j: Schema.Number,
  feed: Schema.optionalKey(Schema.Number),
});
export type Cut2KitArcMoveOperation = typeof Cut2KitArcMoveOperation.Type;

export const Cut2KitDwellOperation = Schema.Struct({
  type: Schema.Literal("dwell"),
  seconds: Schema.Number,
});
export type Cut2KitDwellOperation = typeof Cut2KitDwellOperation.Type;

export const Cut2KitLabelTemplateOperation = Schema.Struct({
  type: Schema.Literal("label_template"),
  toolNumber: PositiveInt,
  x: Schema.Number,
  y: Schema.Number,
  template: TrimmedNonEmptyString,
  panelName: TrimmedNonEmptyString,
  panelNumber: TrimmedNonEmptyString,
  barcode: TrimmedNonEmptyString,
  header1: TrimmedNonEmptyString,
  data1: TrimmedNonEmptyString,
  header2: TrimmedNonEmptyString,
  data2: TrimmedNonEmptyString,
  header3: TrimmedNonEmptyString,
  data3: TrimmedNonEmptyString,
});
export type Cut2KitLabelTemplateOperation = typeof Cut2KitLabelTemplateOperation.Type;

export const Cut2KitLabelImageOperation = Schema.Struct({
  type: Schema.Literal("label_image"),
  toolNumber: PositiveInt,
  x: Schema.Number,
  y: Schema.Number,
  imageName: TrimmedNonEmptyString,
});
export type Cut2KitLabelImageOperation = typeof Cut2KitLabelImageOperation.Type;

export const Cut2KitManufacturingOperation = Schema.Union([
  Cut2KitToolChangeOperation,
  Cut2KitSpindleOnOperation,
  Cut2KitSpindleStopOperation,
  Cut2KitRapidMoveOperation,
  Cut2KitLinearMoveOperation,
  Cut2KitArcMoveOperation,
  Cut2KitDwellOperation,
  Cut2KitLabelTemplateOperation,
  Cut2KitLabelImageOperation,
]);
export type Cut2KitManufacturingOperation = typeof Cut2KitManufacturingOperation.Type;

export const Cut2KitManufacturingJob = Schema.Struct({
  jobId: TrimmedNonEmptyString,
  sourcePath: TrimmedNonEmptyString,
  workOffset: Schema.optionalKey(Cut2KitWorkOffset),
  safeZ: Schema.optionalKey(Schema.Number),
  parkPosition: Schema.optionalKey(Cut2KitParkPosition),
  operations: Schema.Array(Cut2KitManufacturingOperation),
});
export type Cut2KitManufacturingJob = typeof Cut2KitManufacturingJob.Type;

export const Cut2KitManufacturingPlan = Schema.Struct({
  schemaVersion: Schema.Literal("0.1.0"),
  targetController: Cut2KitControllerTarget,
  units: Cut2KitNcUnits,
  defaultWorkOffset: Cut2KitWorkOffset,
  safeZ: Schema.Number,
  parkPosition: Cut2KitParkPosition,
  jobs: Schema.Array(Cut2KitManufacturingJob),
});
export type Cut2KitManufacturingPlan = typeof Cut2KitManufacturingPlan.Type;

export const Cut2KitSettings = Schema.Struct({
  schemaVersion: Schema.Literal("0.3.0"),
  project: Cut2KitProjectMetadata,
  discovery: Cut2KitDiscoverySettings,
  input: Cut2KitInputSettings,
  artifacts: Cut2KitArtifactsSettings,
  ai: Cut2KitAiSettings,
  framing: Cut2KitFramingSettings,
  sheathing: Cut2KitSheathingSettings,
  fastening: Cut2KitFasteningSettings,
  rendering: Cut2KitRenderingSettings,
  output: Cut2KitOutputSettings,
});
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

export const Cut2KitFramingLayoutOpeningKind = Schema.Literals(["window", "door"]);
export type Cut2KitFramingLayoutOpeningKind = typeof Cut2KitFramingLayoutOpeningKind.Type;

export const Cut2KitFramingLayoutMemberKind = Schema.Literals([
  "bottom-plate",
  "top-plate",
  "header",
  "sill",
  "end-stud",
  "jamb-stud",
  "common-stud",
  "cripple-stud",
]);
export type Cut2KitFramingLayoutMemberKind = typeof Cut2KitFramingLayoutMemberKind.Type;

export const Cut2KitFramingLayoutPlateOrientation = Schema.Literals(["flat", "on_edge"]);
export type Cut2KitFramingLayoutPlateOrientation = typeof Cut2KitFramingLayoutPlateOrientation.Type;

export const Cut2KitFramingLayoutOriginEdge = Schema.Literals(["left", "right"]);
export type Cut2KitFramingLayoutOriginEdge = typeof Cut2KitFramingLayoutOriginEdge.Type;

export const Cut2KitFramingLayoutOpening = Schema.Struct({
  id: TrimmedNonEmptyString,
  kind: Cut2KitFramingLayoutOpeningKind,
  left: Schema.Number,
  right: Schema.Number,
  bottom: Schema.Number,
  top: Schema.Number,
  width: Schema.Number,
  height: Schema.Number,
  clearOpening: Schema.Boolean,
});
export type Cut2KitFramingLayoutOpening = typeof Cut2KitFramingLayoutOpening.Type;

export const Cut2KitFramingLayoutMember = Schema.Struct({
  id: TrimmedNonEmptyString,
  kind: Cut2KitFramingLayoutMemberKind,
  x: Schema.Number,
  y: Schema.Number,
  width: Schema.Number,
  height: Schema.Number,
  centerlineX: Schema.optionalKey(Schema.Number),
  sourceOpeningId: Schema.optionalKey(TrimmedNonEmptyString),
  notes: Schema.optionalKey(TrimmedNonEmptyString),
});
export type Cut2KitFramingLayoutMember = typeof Cut2KitFramingLayoutMember.Type;

export const Cut2KitFramingLayoutValidation = Schema.Struct({
  wallWidthMatchesElevation: Schema.Boolean,
  wallHeightMatchesElevation: Schema.Boolean,
  openingSizesMatchElevation: Schema.Boolean,
  headHeightMatchesElevation: Schema.Boolean,
  sillHeightMatchesElevation: Schema.Boolean,
  endStudsDoubled: Schema.Boolean,
  jambStudsPresent: Schema.Boolean,
  commonStudSpacingApplied: Schema.Boolean,
  noCommonStudThroughVoid: Schema.Boolean,
  plateOrientationMatchesExpectation: Schema.Boolean,
  notes: Schema.Array(TrimmedNonEmptyString),
});
export type Cut2KitFramingLayoutValidation = typeof Cut2KitFramingLayoutValidation.Type;

export const Cut2KitWallGeometryValidation = Schema.Struct({
  dimensionTextFound: Schema.Boolean,
  wallDimensionsResolved: Schema.Boolean,
  openingDimensionsResolved: Schema.Boolean,
  wallBoundsFit: Schema.Boolean,
  openingPairsResolved: Schema.Boolean,
  openingTypesResolved: Schema.Boolean,
  headHeightResolved: Schema.Boolean,
  sillHeightResolved: Schema.Boolean,
  conflictsDetected: Schema.Boolean,
  ambiguityDetected: Schema.Boolean,
  requiresUserConfirmation: Schema.Boolean,
  notes: Schema.Array(TrimmedNonEmptyString),
});
export type Cut2KitWallGeometryValidation = typeof Cut2KitWallGeometryValidation.Type;

export const Cut2KitWallGeometry = Schema.Struct({
  schemaVersion: Schema.Literal("0.2.0"),
  sourcePdfPath: TrimmedNonEmptyString,
  settingsFilePath: TrimmedNonEmptyString,
  units: Cut2KitNcUnits,
  wall: Schema.Struct({
    width: Schema.Number,
    height: Schema.Number,
    pageLeft: Schema.Number,
    pageRight: Schema.Number,
    pageTop: Schema.Number,
    pageBottom: Schema.Number,
  }),
  commonHeights: Schema.Struct({
    head: Schema.Number,
    windowSill: Schema.Number,
  }),
  dimensionText: Schema.Struct({
    horizontalMarks: Schema.Array(Schema.Number),
    verticalMarks: Schema.Array(Schema.Number),
    pairingStrategy: Cut2KitElevationOpeningPairingStrategy,
    openingTypeInference: Cut2KitElevationOpeningTypeInference,
  }),
  openings: Schema.Array(Cut2KitFramingLayoutOpening),
  validation: Cut2KitWallGeometryValidation,
  notes: Schema.Array(TrimmedNonEmptyString),
});
export type Cut2KitWallGeometry = typeof Cut2KitWallGeometry.Type;

export const Cut2KitFramingMemberScheduleItem = Schema.Struct({
  id: TrimmedNonEmptyString,
  label: TrimmedNonEmptyString,
  memberKind: Cut2KitFramingLayoutMemberKind,
  count: PositiveInt,
  length: Schema.Number,
  notes: Schema.optionalKey(TrimmedNonEmptyString),
});
export type Cut2KitFramingMemberScheduleItem = typeof Cut2KitFramingMemberScheduleItem.Type;

export const Cut2KitFramingLayoutV0_1_0 = Schema.Struct({
  schemaVersion: Schema.Literal("0.1.0"),
  sourcePdfPath: TrimmedNonEmptyString,
  settingsFilePath: TrimmedNonEmptyString,
  units: Cut2KitNcUnits,
  wall: Schema.Struct({
    width: Schema.Number,
    height: Schema.Number,
    memberThickness: Schema.Number,
    studNominalSize: TrimmedNonEmptyString,
    material: TrimmedNonEmptyString,
    topMemberOrientation: Cut2KitFramingLayoutPlateOrientation,
    bottomMemberOrientation: Cut2KitFramingLayoutPlateOrientation,
  }),
  studLayout: Schema.Struct({
    originEdge: Cut2KitFramingLayoutOriginEdge,
    spacing: Schema.Number,
    commonStudCenterlines: Schema.Array(Schema.Number),
  }),
  openings: Schema.Array(Cut2KitFramingLayoutOpening),
  members: Schema.Array(Cut2KitFramingLayoutMember),
  validation: Cut2KitFramingLayoutValidation,
  notes: Schema.Array(TrimmedNonEmptyString),
});
export type Cut2KitFramingLayoutV0_1_0 = typeof Cut2KitFramingLayoutV0_1_0.Type;

export const Cut2KitFramingLayoutV0_2_0 = Schema.Struct({
  schemaVersion: Schema.Literal("0.2.0"),
  sourcePdfPath: TrimmedNonEmptyString,
  settingsFilePath: TrimmedNonEmptyString,
  units: Cut2KitNcUnits,
  geometry: Cut2KitWallGeometry,
  wall: Schema.Struct({
    width: Schema.Number,
    height: Schema.Number,
    memberThickness: Schema.Number,
    studNominalSize: TrimmedNonEmptyString,
    material: TrimmedNonEmptyString,
    topMemberOrientation: Cut2KitFramingLayoutPlateOrientation,
    bottomMemberOrientation: Cut2KitFramingLayoutPlateOrientation,
  }),
  studLayout: Schema.Struct({
    originEdge: Cut2KitFramingLayoutOriginEdge,
    spacing: Schema.Number,
    commonStudCenterlines: Schema.Array(Schema.Number),
  }),
  openings: Schema.Array(Cut2KitFramingLayoutOpening),
  members: Schema.Array(Cut2KitFramingLayoutMember),
  memberSchedule: Schema.Array(Cut2KitFramingMemberScheduleItem),
  validation: Cut2KitFramingLayoutValidation,
  notes: Schema.Array(TrimmedNonEmptyString),
});
export type Cut2KitFramingLayoutV0_2_0 = typeof Cut2KitFramingLayoutV0_2_0.Type;

export const Cut2KitFramingLayout = Schema.Union([
  Cut2KitFramingLayoutV0_1_0,
  Cut2KitFramingLayoutV0_2_0,
]);
export type Cut2KitFramingLayout = typeof Cut2KitFramingLayout.Type;

export const Cut2KitSheathingCutout = Schema.Struct({
  id: TrimmedNonEmptyString,
  sourceOpeningId: TrimmedNonEmptyString,
  left: Schema.Number,
  right: Schema.Number,
  bottom: Schema.Number,
  top: Schema.Number,
  width: Schema.Number,
  height: Schema.Number,
});
export type Cut2KitSheathingCutout = typeof Cut2KitSheathingCutout.Type;

export const Cut2KitSheathingSheet = Schema.Struct({
  id: TrimmedNonEmptyString,
  index: PositiveInt,
  left: Schema.Number,
  right: Schema.Number,
  bottom: Schema.Number,
  top: Schema.Number,
  width: Schema.Number,
  height: Schema.Number,
  isTerminalRip: Schema.Boolean,
  cutouts: Schema.Array(Cut2KitSheathingCutout),
  notes: Schema.Array(TrimmedNonEmptyString),
});
export type Cut2KitSheathingSheet = typeof Cut2KitSheathingSheet.Type;

export const Cut2KitSheathingLayoutValidation = Schema.Struct({
  openingCoverageRemoved: Schema.Boolean,
  sheetCountMatchesLayout: Schema.Boolean,
  terminalRipComputed: Schema.Boolean,
  cutoutsWithinSheets: Schema.Boolean,
  firstPageFitsMargins: Schema.Boolean,
  notes: Schema.Array(TrimmedNonEmptyString),
});
export type Cut2KitSheathingLayoutValidation = typeof Cut2KitSheathingLayoutValidation.Type;

export const Cut2KitSheathingLayout = Schema.Struct({
  schemaVersion: Schema.Literal("0.2.0"),
  sourcePdfPath: TrimmedNonEmptyString,
  settingsFilePath: TrimmedNonEmptyString,
  units: Cut2KitNcUnits,
  geometry: Cut2KitWallGeometry,
  wall: Schema.Struct({
    width: Schema.Number,
    height: Schema.Number,
    materialLabel: TrimmedNonEmptyString,
    panelThickness: Schema.Number,
    sheetNominalWidth: Schema.Number,
    sheetNominalHeight: Schema.Number,
    installedOrientation: Cut2KitInstalledSheetOrientation,
    runDirection: Cut2KitSheetRunDirection,
  }),
  sheets: Schema.Array(Cut2KitSheathingSheet),
  summary: Schema.Struct({
    sheetCount: NonNegativeInt,
    fullSheetCount: NonNegativeInt,
    terminalRipWidth: Schema.Number,
  }),
  fastening: Schema.Struct({
    supportedEdgeSpacing: Schema.Number,
    fieldSpacing: Schema.Number,
    edgeDistance: Schema.Number,
    typicalReferenceOnly: Schema.Boolean,
    noteLines: Schema.Array(TrimmedNonEmptyString),
    disclaimerText: TrimmedNonEmptyString,
  }),
  validation: Cut2KitSheathingLayoutValidation,
  notes: Schema.Array(TrimmedNonEmptyString),
});
export type Cut2KitSheathingLayout = typeof Cut2KitSheathingLayout.Type;

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
  planSourcePath: TrimmedNonEmptyString,
  relativeOutputPath: TrimmedNonEmptyString,
  queueMode: Cut2KitQueueMode,
  queueGroup: TrimmedNonEmptyString,
  sequenceIndex: NonNegativeInt,
  application: Schema.NullOr(Cut2KitApplication),
  targetController: Cut2KitControllerTarget,
  operationCount: NonNegativeInt,
  program: TrimmedNonEmptyString,
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
  pdfCount: NonNegativeInt,
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
  resolvedPromptTemplates: Schema.NullOr(Cut2KitResolvedPromptTemplates),
  manufacturingPlanFilePath: Schema.NullOr(TrimmedNonEmptyString),
  manufacturingPlan: Schema.NullOr(Cut2KitManufacturingPlan),
  files: Schema.Array(ProjectFileRecord),
  issues: Schema.Array(Cut2KitIssue),
  sourceDocuments: Schema.Array(Cut2KitSourceDocument),
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

export const Cut2KitWallArtifactPaths = Schema.Struct({
  geometryJsonPath: TrimmedNonEmptyString,
  validationReportJsonPath: TrimmedNonEmptyString,
  framingJsonPath: TrimmedNonEmptyString,
  framingPdfPath: TrimmedNonEmptyString,
  sheathingJsonPath: TrimmedNonEmptyString,
  sheathingPdfPath: TrimmedNonEmptyString,
});
export type Cut2KitWallArtifactPaths = typeof Cut2KitWallArtifactPaths.Type;

export const Cut2KitValidationStage = Schema.Literals([
  "geometry",
  "framing",
  "sheathing",
  "packaging",
]);
export type Cut2KitValidationStage = typeof Cut2KitValidationStage.Type;

export const Cut2KitValidationStageStatus = Schema.Literals([
  "pass",
  "needs_confirmation",
  "blocked",
  "not_run",
]);
export type Cut2KitValidationStageStatus = typeof Cut2KitValidationStageStatus.Type;

export const Cut2KitWallGenerationStatus = Schema.Literals([
  "completed",
  "needs_confirmation",
  "validation_blocked",
]);
export type Cut2KitWallGenerationStatus = typeof Cut2KitWallGenerationStatus.Type;

export const Cut2KitValidationReportIssue = Schema.Struct({
  stage: Cut2KitValidationStage,
  severity: Cut2KitIssueSeverity,
  code: TrimmedNonEmptyString,
  message: TrimmedNonEmptyString,
});
export type Cut2KitValidationReportIssue = typeof Cut2KitValidationReportIssue.Type;

export const Cut2KitWallValidationReport = Schema.Struct({
  schemaVersion: Schema.Literal("0.2.0"),
  sourcePdfPath: TrimmedNonEmptyString,
  settingsFilePath: TrimmedNonEmptyString,
  checklistPath: TrimmedNonEmptyString,
  ambiguity: Schema.Struct({
    detected: Schema.Boolean,
    requiresConfirmation: Schema.Boolean,
    notes: Schema.Array(TrimmedNonEmptyString),
  }),
  geometry: Schema.Struct({
    status: Cut2KitValidationStageStatus,
    checks: Cut2KitWallGeometryValidation,
  }),
  framing: Schema.NullOr(
    Schema.Struct({
      status: Cut2KitValidationStageStatus,
      checks: Cut2KitFramingLayoutValidation,
    }),
  ),
  sheathing: Schema.NullOr(
    Schema.Struct({
      status: Cut2KitValidationStageStatus,
      checks: Cut2KitSheathingLayoutValidation,
    }),
  ),
  issues: Schema.Array(Cut2KitValidationReportIssue),
  readyForFraming: Schema.Boolean,
  readyForSheathing: Schema.Boolean,
  readyForPackaging: Schema.Boolean,
});
export type Cut2KitWallValidationReport = typeof Cut2KitWallValidationReport.Type;

export const Cut2KitGenerateWallLayoutInput = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  sourcePdfPath: TrimmedNonEmptyString,
  confirmedAmbiguityProceeding: Schema.optionalKey(Schema.Boolean),
});
export type Cut2KitGenerateWallLayoutInput = typeof Cut2KitGenerateWallLayoutInput.Type;

export const Cut2KitGenerateWallLayoutResult = Schema.Struct({
  status: Cut2KitWallGenerationStatus,
  statusMessage: Schema.NullOr(TrimmedNonEmptyString),
  project: Cut2KitProject,
  sourcePdfPath: TrimmedNonEmptyString,
  artifacts: Cut2KitWallArtifactPaths,
  geometry: Cut2KitWallGeometry,
  framingLayout: Schema.NullOr(Cut2KitFramingLayoutV0_2_0),
  sheathingLayout: Schema.NullOr(Cut2KitSheathingLayout),
  validationReport: Cut2KitWallValidationReport,
  writtenPaths: Schema.Array(TrimmedNonEmptyString),
});
export type Cut2KitGenerateWallLayoutResult = typeof Cut2KitGenerateWallLayoutResult.Type;

export const Cut2KitRenderFramingLayoutInput = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  relativePath: TrimmedNonEmptyString,
});
export type Cut2KitRenderFramingLayoutInput = typeof Cut2KitRenderFramingLayoutInput.Type;

export const Cut2KitRenderFramingLayoutResult = Schema.Struct({
  project: Cut2KitProject,
  jsonPath: TrimmedNonEmptyString,
  pdfPath: TrimmedNonEmptyString,
  writtenPaths: Schema.Array(TrimmedNonEmptyString),
});
export type Cut2KitRenderFramingLayoutResult = typeof Cut2KitRenderFramingLayoutResult.Type;

export const Cut2KitCompileFramingPromptInput = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  sourcePdfPath: TrimmedNonEmptyString,
});
export type Cut2KitCompileFramingPromptInput = typeof Cut2KitCompileFramingPromptInput.Type;

export const Cut2KitCompileFramingPromptResult = Schema.Struct({
  sourcePdfPath: TrimmedNonEmptyString,
  prompt: TrimmedNonEmptyString,
  geometryJsonPath: TrimmedNonEmptyString,
  geometryLoaded: Schema.Boolean,
});
export type Cut2KitCompileFramingPromptResult = typeof Cut2KitCompileFramingPromptResult.Type;

export class Cut2KitProjectError extends Schema.TaggedErrorClass<Cut2KitProjectError>()(
  "Cut2KitProjectError",
  {
    cwd: TrimmedNonEmptyString,
    operation: TrimmedNonEmptyString,
    detail: TrimmedNonEmptyString,
    cause: Schema.optional(Schema.Defect),
  },
) {}
