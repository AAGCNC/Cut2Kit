import type { Cut2KitSettings } from "@t3tools/contracts";

export const CUT2KIT_SETTINGS_FILE_NAME = "cut2kit.settings.json";

const DEFAULT_CUT2KIT_SETTINGS: Cut2KitSettings = {
  schemaVersion: "0.3.0",
  project: {
    projectId: "cut2kit-project",
    jobName: "Cut2Kit Project",
    customer: "TBD",
    site: "TBD",
    description: "AI-first wall-layout workflow settings.",
    units: "imperial",
  },
  ai: {
    enabled: true,
    agentName: "Cut2Kit Agent",
    provider: "codex",
    model: "gpt-5.4",
    reasoningEffort: "xhigh",
    primaryWorkflow: "ai-first-wall-layout",
    runtimeGenerationOrder: [
      "extract_wall_geometry",
      "generate_framing_layout",
      "generate_sheathing_layout",
      "validate_and_package",
    ],
    promptTemplatePaths: {
      geometrySystem: ".docs/system-geometry.md",
      geometryUser: ".docs/user-geometry.md",
      framingSystem: ".docs/system-framing.md",
      framingUser: ".docs/user-framing.md",
      sheathingSystem: ".docs/system-sheathing.md",
      sheathingUser: ".docs/user-sheathing.md",
      manufacturingSystem: ".docs/system-manufacturing.md",
      manufacturingUser: ".docs/user-manufacturing.md",
      validationChecklist: ".docs/validation-checklist.md",
    },
  },
  discovery: {
    searchRecursively: true,
    preferredFolders: ["elevations", "references", ".docs"],
    knownSettingsFileNames: [CUT2KIT_SETTINGS_FILE_NAME],
  },
  input: {
    autoClassify: true,
    fileAssignments: [
      {
        pathPattern: "elevations/*.pdf",
        classification: "elevation",
        side: "front",
        application: "siding",
      },
    ],
    elevationIntake: {
      enabled: true,
      explicitDimensionsAreAuthoritative: true,
      geometrySourcePriority: ["dimension_text", "drawn_geometry"],
      horizontalDimensionMode: "cumulative_from_left_edge",
      openingPairingStrategy: "consecutive_pairs",
      openingTypeInference: "sill_line_detection",
      requireCommonHeadHeight: true,
      requireCommonWindowSillHeight: true,
      units: "inch",
      ambiguityHandling: {
        stopOnMissingDimensions: true,
        stopOnConflictingDimensions: true,
        stopOnIncompleteOpeningGeometry: true,
        requireUserConfirmationToContinue: true,
      },
    },
  },
  artifacts: {
    wallLayoutsDir: "wall-layouts",
    framingLayoutsDir: "framing-layouts",
    sheathingLayoutsDir: "sheathing-layouts",
  },
  framing: {
    enabled: true,
    material: {
      label: "SPF",
      nominalSize: "2x6",
      thickness: 1.5,
      depth: 5.5,
    },
    plates: {
      top: {
        enabled: true,
        continuity: "continuous",
        orientationInElevation: "flat",
      },
      bottom: {
        enabled: true,
        continuity: "continuous",
        orientationInElevation: "flat",
      },
    },
    horizontalMembers: {
      orientationInElevation: "flat",
    },
    endStuds: {
      leftCount: 2,
      rightCount: 2,
    },
    jambStuds: {
      countPerSide: 1,
      leftOffsetMode: "shift_left",
      leftOffset: 1.5,
      preserveClearOpenings: true,
    },
    studLayout: {
      enabled: true,
      spacing: 16,
      originSide: "left",
      direction: "left_to_right",
      stopBeforeNextBearingStudWithinOrEqual: 1,
    },
    openings: {
      clearArchitecturalOpenings: true,
      headMember: {
        windows: true,
        doors: true,
      },
      sillMember: {
        windows: true,
        doors: false,
      },
    },
    crippleStuds: {
      aboveHeads: true,
      belowWindowSills: true,
      splitGridStudsInsideOpenings: true,
    },
    labeling: {
      includeMemberSchedule: true,
      includeStudCenterSchedule: true,
    },
  },
  sheathing: {
    enabled: true,
    materialLabel: "7/16 in OSB",
    panelThickness: 0.4375,
    sheet: {
      nominalWidth: 48,
      nominalHeight: 96,
      installedOrientation: "vertical",
      runDirection: "left_to_right",
      allowTerminalRip: true,
    },
    openingsRemainUncovered: true,
    pages: {
      includeOverallLayoutPage: true,
      includePerSheetCutoutPages: true,
    },
    notes: {
      includeDisclaimer: true,
      panelEdgeGap: 0.125,
      supportedEdgeBehavior: "edges_over_framing_or_blocking",
    },
  },
  fastening: {
    enabled: false,
    includePage: false,
    typicalReferenceOnly: true,
    supportedEdgeSpacing: 6,
    fieldSpacing: 12,
    edgeDistance: 0.375,
    includeOverdrivingWarning: true,
    disclaimerText:
      "Confirm final fastening schedule and edge support requirements with code, engineering, and manufacturer instructions.",
    noteLines: [
      "Use the stud framing layout for support lines.",
      "Keep panel edges over framing members or provide blocking where required.",
      "Keep fasteners approximately 3/8 in back from panel edges and do not overdrive fasteners.",
    ],
  },
  manufacturing: {
    enabled: true,
    targetController: "axyz-a2mc",
    defaultWorkOffset: "G54",
    safeZ: 0.5,
    parkPosition: {
      x: 0,
      y: 0,
      z: 0.5,
    },
    sheathing: {
      toolNumber: 1,
      toolDiameter: 0.375,
      spindleDirection: "cw",
      spindleRpm: 18000,
      plungeFeed: 150,
      cutFeed: 250,
      passCount: 2,
    },
  },
  rendering: {
    units: "inch",
    dimensionFormat: "feet-and-inches",
    framing: {
      pageSize: "letter",
      pageOrientation: "landscape",
      margins: {
        left: 48,
        right: 48,
        top: 54,
        bottom: 72,
      },
      includeMemberSchedule: true,
      titleTemplate: "Framing Layout · {source}",
      subtitleTemplate: "{material} framing · members shown in elevation",
    },
    sheathing: {
      pageSize: "letter",
      pageOrientation: "landscape",
      margins: {
        left: 36,
        right: 36,
        top: 42,
        bottom: 54,
      },
      scaleToFitFirstPage: true,
      cutoutDetailsPerPage: 4,
      titleTemplate: "OSB Layout · {source}",
      subtitleTemplate: "{material} sheathing layout",
      fasteningTitleTemplate: "Fastening Notes · {source}",
    },
  },
  output: {
    root: "output",
    manifestsDir: "output/manifests",
    ncDir: "output/nc",
    reportsDir: "output/reports",
    overwritePolicy: "overwrite",
  },
};

function slugifyProjectId(input: string): string {
  const slug = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/g, "")
    .replace(/-+$/g, "");
  return slug.length > 0 ? slug : DEFAULT_CUT2KIT_SETTINGS.project.projectId;
}

export function createDefaultCut2KitSettings(input?: {
  projectId?: string;
  jobName?: string;
  customer?: string;
  site?: string;
  description?: string;
}): Cut2KitSettings {
  const next = JSON.parse(JSON.stringify(DEFAULT_CUT2KIT_SETTINGS)) as Cut2KitSettings;
  if (!input) {
    return next;
  }

  return {
    ...next,
    project: {
      ...next.project,
      ...(typeof input.projectId === "string" && input.projectId.trim().length > 0
        ? { projectId: slugifyProjectId(input.projectId) }
        : {}),
      ...(typeof input.jobName === "string" && input.jobName.trim().length > 0
        ? { jobName: input.jobName.trim() }
        : {}),
      ...(typeof input.customer === "string" && input.customer.trim().length > 0
        ? { customer: input.customer.trim() }
        : {}),
      ...(typeof input.site === "string" && input.site.trim().length > 0
        ? { site: input.site.trim() }
        : {}),
      ...(typeof input.description === "string" && input.description.trim().length > 0
        ? { description: input.description.trim() }
        : {}),
    },
  };
}
