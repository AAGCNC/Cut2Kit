import type {
  Cut2KitArcMoveOperation,
  Cut2KitControllerTarget,
  Cut2KitLabelImageOperation,
  Cut2KitLabelTemplateOperation,
  Cut2KitLinearMoveOperation,
  Cut2KitManufacturingJob,
  Cut2KitManufacturingOperation,
  Cut2KitManufacturingPlan,
  Cut2KitParkPosition,
  Cut2KitRapidMoveOperation,
  Cut2KitWorkOffset,
} from "@t3tools/contracts";

const ARC_TOLERANCE = 0.0001;

type MotionPosition = {
  x: number | null;
  y: number | null;
  z: number | null;
};

type PostState = {
  activeTool: number | null;
  spindleOn: boolean;
  currentFeed: number | null;
  position: MotionPosition;
  motionStarted: boolean;
};

export class A2mcPostError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "A2mcPostError";
  }
}

export type RenderA2mcProgramInput = {
  projectName: string;
  planSourcePath: string;
  plan: Cut2KitManufacturingPlan;
  job: Cut2KitManufacturingJob;
};

function assertFiniteNumber(value: number, label: string): number {
  if (!Number.isFinite(value)) {
    throw new A2mcPostError(`${label} must be a finite number.`);
  }
  return Object.is(value, -0) ? 0 : value;
}

function assertPositiveNumber(value: number, label: string): number {
  const normalized = assertFiniteNumber(value, label);
  if (normalized <= 0) {
    throw new A2mcPostError(`${label} must be greater than 0.`);
  }
  return normalized;
}

function formatCoordinate(value: number): string {
  return assertFiniteNumber(value, "Coordinate").toFixed(3);
}

function formatFeed(value: number): string {
  return assertPositiveNumber(value, "Feed rate").toFixed(1);
}

function formatSeconds(value: number): string {
  const normalized = assertPositiveNumber(value, "Dwell seconds");
  return normalized.toFixed(3).replace(/(?:\.0+|(\.\d*?)0+)$/, "$1");
}

function formatInteger(value: number, label: string): string {
  const normalized = assertPositiveNumber(value, label);
  if (!Number.isInteger(normalized)) {
    throw new A2mcPostError(`${label} must be an integer.`);
  }
  return String(normalized);
}

function hasAnyAxis(operation: {
  x?: number | undefined;
  y?: number | undefined;
  z?: number | undefined;
}): boolean {
  return operation.x !== undefined || operation.y !== undefined || operation.z !== undefined;
}

function sanitizePayloadField(value: string, label: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new A2mcPostError(`${label} cannot be empty.`);
  }
  if (/[();\r\n]/.test(trimmed)) {
    throw new A2mcPostError(
      `${label} contains characters that would corrupt A2MC payload parsing.`,
    );
  }
  return trimmed.toUpperCase();
}

function formatLabelCoordinate(value: number): string {
  return formatCoordinate(value);
}

function normalizeImageName(value: string): string {
  const sanitized = sanitizePayloadField(value, "Image name");
  return sanitized.endsWith(".BMP") ? sanitized : `${sanitized}.BMP`;
}

function formatMotionWords(
  operation: {
    x?: number | undefined;
    y?: number | undefined;
    z?: number | undefined;
  },
  includeFeed?: number,
): string[] {
  const words: string[] = [];
  if (operation.x !== undefined) {
    words.push(`X${formatCoordinate(operation.x)}`);
  }
  if (operation.y !== undefined) {
    words.push(`Y${formatCoordinate(operation.y)}`);
  }
  if (operation.z !== undefined) {
    words.push(`Z${formatCoordinate(operation.z)}`);
  }
  if (includeFeed !== undefined) {
    words.push(`F${formatFeed(includeFeed)}`);
  }
  return words;
}

function applyPosition(
  state: PostState,
  operation: {
    x?: number | undefined;
    y?: number | undefined;
    z?: number | undefined;
  },
): void {
  if (operation.x !== undefined) {
    state.position.x = assertFiniteNumber(operation.x, "X");
  }
  if (operation.y !== undefined) {
    state.position.y = assertFiniteNumber(operation.y, "Y");
  }
  if (operation.z !== undefined) {
    state.position.z = assertFiniteNumber(operation.z, "Z");
  }
  state.motionStarted = true;
}

function ensureToolSelected(state: PostState, operationLabel: string): void {
  if (state.activeTool === null) {
    throw new A2mcPostError(`${operationLabel} requires an active tool. Emit a tool_change first.`);
  }
}

function ensureFeed(
  state: PostState,
  operation: Cut2KitLinearMoveOperation | Cut2KitArcMoveOperation,
): void {
  if (operation.feed !== undefined) {
    state.currentFeed = assertPositiveNumber(operation.feed, "Feed rate");
    return;
  }
  if (state.currentFeed === null) {
    throw new A2mcPostError(`${operation.type} requires an explicit feed on the first feed move.`);
  }
}

function emitSafeZ(lines: string[], state: PostState, safeZ: number): void {
  const normalizedSafeZ = assertPositiveNumber(safeZ, "Safe Z");
  if (state.position.z !== normalizedSafeZ) {
    lines.push(`G0 Z${formatCoordinate(normalizedSafeZ)}`);
    state.position.z = normalizedSafeZ;
    state.motionStarted = true;
  }
}

function beforeToolChange(lines: string[], state: PostState, safeZ: number): void {
  if (state.spindleOn) {
    lines.push("M5");
    state.spindleOn = false;
  }
  if (state.motionStarted) {
    emitSafeZ(lines, state, safeZ);
  }
}

function maybeRaiseBeforeRapid(
  lines: string[],
  state: PostState,
  operation: Cut2KitRapidMoveOperation,
  safeZ: number,
): void {
  const hasXY = operation.x !== undefined || operation.y !== undefined;
  const normalizedSafeZ = assertPositiveNumber(safeZ, "Safe Z");
  if (hasXY && operation.z === undefined) {
    const currentZ = state.position.z;
    if (currentZ === null || currentZ < normalizedSafeZ - ARC_TOLERANCE) {
      emitSafeZ(lines, state, normalizedSafeZ);
    }
  }
}

function computeArcSweepRadians(input: {
  direction: Cut2KitArcMoveOperation["direction"];
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  i: number;
  j: number;
}): number {
  const centerX = input.startX + input.i;
  const centerY = input.startY + input.j;
  const startVectorX = input.startX - centerX;
  const startVectorY = input.startY - centerY;
  const endVectorX = input.endX - centerX;
  const endVectorY = input.endY - centerY;

  const startRadius = Math.hypot(startVectorX, startVectorY);
  const endRadius = Math.hypot(endVectorX, endVectorY);

  if (startRadius <= ARC_TOLERANCE || endRadius <= ARC_TOLERANCE) {
    throw new A2mcPostError("Arc center coincides with the start or end point.");
  }
  if (Math.abs(startRadius - endRadius) > ARC_TOLERANCE) {
    throw new A2mcPostError(
      "Arc start and end points are not equidistant from the specified center.",
    );
  }
  if (
    Math.abs(input.startX - input.endX) <= ARC_TOLERANCE &&
    Math.abs(input.startY - input.endY) <= ARC_TOLERANCE
  ) {
    throw new A2mcPostError(
      "Full-circle arcs are not emitted for A2MC. Linearize or split the move.",
    );
  }

  const startAngle = Math.atan2(startVectorY, startVectorX);
  const endAngle = Math.atan2(endVectorY, endVectorX);
  let sweep = input.direction === "cw" ? startAngle - endAngle : endAngle - startAngle;
  while (sweep <= 0) {
    sweep += Math.PI * 2;
  }
  return sweep;
}

function formatArcLine(
  state: PostState,
  operation: Cut2KitArcMoveOperation,
  safeZ: number,
): string {
  ensureToolSelected(state, "arc_move");
  if (!state.spindleOn) {
    throw new A2mcPostError("arc_move requires spindle_on before cutting motion.");
  }
  ensureFeed(state, operation);

  const startX = state.position.x;
  const startY = state.position.y;
  if (startX === null || startY === null) {
    throw new A2mcPostError("arc_move requires a known XY start position.");
  }

  const endX = assertFiniteNumber(operation.x, "Arc X");
  const endY = assertFiniteNumber(operation.y, "Arc Y");
  const i = assertFiniteNumber(operation.i, "Arc I");
  const j = assertFiniteNumber(operation.j, "Arc J");

  const sweep = computeArcSweepRadians({
    direction: operation.direction,
    startX,
    startY,
    endX,
    endY,
    i,
    j,
  });
  if (sweep > Math.PI + ARC_TOLERANCE) {
    throw new A2mcPostError("A2MC arcs over 180 degrees are rejected. Split or linearize the arc.");
  }

  const words = [
    operation.direction === "cw" ? "G2" : "G3",
    `X${formatCoordinate(endX)}`,
    `Y${formatCoordinate(endY)}`,
    `I${formatCoordinate(i)}`,
    `J${formatCoordinate(j)}`,
  ];
  if (operation.z !== undefined) {
    words.push(`Z${formatCoordinate(operation.z)}`);
  }
  if (operation.feed !== undefined) {
    words.push(`F${formatFeed(operation.feed)}`);
  } else if (state.currentFeed !== null) {
    words.push(`F${formatFeed(state.currentFeed)}`);
  }

  if (
    state.position.z !== null &&
    state.position.z > assertPositiveNumber(safeZ, "Safe Z") &&
    operation.z === undefined
  ) {
    // No-op branch; keeps safeZ validated for arc paths without forcing a redundant retract.
  }

  applyPosition(state, operation);
  return words.join(" ");
}

function emitLabelTool(lines: string[], state: PostState, toolNumber: number, safeZ: number): void {
  beforeToolChange(lines, state, safeZ);
  if (state.activeTool !== toolNumber) {
    lines.push(`M6 T${formatInteger(toolNumber, "Label tool number")}`);
    state.activeTool = toolNumber;
  }
}

function formatLabelTemplateLine(operation: Cut2KitLabelTemplateOperation): string {
  const payload = [
    formatLabelCoordinate(operation.x),
    formatLabelCoordinate(operation.y),
    sanitizePayloadField(operation.template, "Template"),
    sanitizePayloadField(operation.panelName, "Panel name"),
    sanitizePayloadField(operation.panelNumber, "Panel number"),
    sanitizePayloadField(operation.barcode, "Barcode"),
    sanitizePayloadField(operation.header1, "Header1"),
    sanitizePayloadField(operation.data1, "Data1"),
    sanitizePayloadField(operation.header2, "Header2"),
    sanitizePayloadField(operation.data2, "Data2"),
    sanitizePayloadField(operation.header3, "Header3"),
    sanitizePayloadField(operation.data3, "Data3"),
  ].join(";");
  return `M272(${payload})`;
}

function formatLabelImageLine(operation: Cut2KitLabelImageOperation): string {
  const payload = [
    formatLabelCoordinate(operation.x),
    formatLabelCoordinate(operation.y),
    normalizeImageName(operation.imageName),
  ].join(";");
  return `M273(${payload})`;
}

function resolveWorkOffset(
  plan: Cut2KitManufacturingPlan,
  job: Cut2KitManufacturingJob,
): Cut2KitWorkOffset {
  return job.workOffset ?? plan.defaultWorkOffset;
}

function resolveSafeZ(plan: Cut2KitManufacturingPlan, job: Cut2KitManufacturingJob): number {
  return assertPositiveNumber(job.safeZ ?? plan.safeZ, "Safe Z");
}

function resolveParkPosition(
  plan: Cut2KitManufacturingPlan,
  job: Cut2KitManufacturingJob,
): Cut2KitParkPosition {
  return job.parkPosition ?? plan.parkPosition;
}

function validateJob(job: Cut2KitManufacturingJob): void {
  if (job.operations.length === 0) {
    throw new A2mcPostError(`Manufacturing job '${job.jobId}' has no operations.`);
  }
  for (const operation of job.operations) {
    switch (operation.type) {
      case "rapid_move":
      case "linear_move":
        if (!hasAnyAxis(operation)) {
          throw new A2mcPostError(
            `${operation.type} in job '${job.jobId}' must move at least one axis.`,
          );
        }
        break;
      case "dwell":
        assertPositiveNumber(operation.seconds, "Dwell seconds");
        break;
      case "label_template":
        if (operation.toolNumber < 1) {
          throw new A2mcPostError(
            `label_template in job '${job.jobId}' requires a positive label tool number.`,
          );
        }
        break;
      case "label_image":
        if (operation.toolNumber < 1) {
          throw new A2mcPostError(
            `label_image in job '${job.jobId}' requires a positive label tool number.`,
          );
        }
        break;
      default:
        break;
    }
  }
}

function initialState(): PostState {
  return {
    activeTool: null,
    spindleOn: false,
    currentFeed: null,
    position: { x: null, y: null, z: null },
    motionStarted: false,
  };
}

function renderOperation(
  lines: string[],
  state: PostState,
  operation: Cut2KitManufacturingOperation,
  safeZ: number,
): void {
  switch (operation.type) {
    case "tool_change":
      beforeToolChange(lines, state, safeZ);
      lines.push(`M6 T${formatInteger(operation.toolNumber, "Tool number")}`);
      state.activeTool = operation.toolNumber;
      return;
    case "spindle_on":
      ensureToolSelected(state, "spindle_on");
      lines.push(
        `${operation.direction === "cw" ? "M3" : "M4"} S${formatInteger(operation.rpm, "Spindle RPM")}`,
      );
      state.spindleOn = true;
      return;
    case "spindle_stop":
      lines.push("M5");
      state.spindleOn = false;
      return;
    case "rapid_move":
      ensureToolSelected(state, "rapid_move");
      maybeRaiseBeforeRapid(lines, state, operation, safeZ);
      lines.push(`G0 ${formatMotionWords(operation).join(" ")}`);
      applyPosition(state, operation);
      return;
    case "linear_move":
      ensureToolSelected(state, "linear_move");
      if (!state.spindleOn) {
        throw new A2mcPostError("linear_move requires spindle_on before cutting motion.");
      }
      ensureFeed(state, operation);
      lines.push(`G1 ${formatMotionWords(operation, operation.feed).join(" ")}`);
      applyPosition(state, operation);
      return;
    case "arc_move":
      lines.push(formatArcLine(state, operation, safeZ));
      return;
    case "dwell":
      lines.push(`G4 P${formatSeconds(operation.seconds)}`);
      return;
    case "label_template":
      emitLabelTool(lines, state, operation.toolNumber, safeZ);
      lines.push(formatLabelTemplateLine(operation));
      return;
    case "label_image":
      emitLabelTool(lines, state, operation.toolNumber, safeZ);
      lines.push(formatLabelImageLine(operation));
      return;
  }
}

function buildHeaderComments(input: RenderA2mcProgramInput): string[] {
  return [
    "(CUT2KIT -> A2MC)",
    `(PROJECT: ${input.projectName})`,
    `(JOB: ${input.job.jobId})`,
    `(SOURCE: ${input.job.sourcePath})`,
    `(PLAN: ${input.planSourcePath})`,
  ];
}

export function renderA2mcProgram(input: RenderA2mcProgramInput): string {
  validateJob(input.job);

  const safeZ = resolveSafeZ(input.plan, input.job);
  const parkPosition = resolveParkPosition(input.plan, input.job);
  const workOffset = resolveWorkOffset(input.plan, input.job);
  const lines = [...buildHeaderComments(input)];
  const state = initialState();

  lines.push("G90");
  lines.push(input.plan.units === "metric" ? "G21" : "G20");
  lines.push(workOffset);

  for (const operation of input.job.operations) {
    renderOperation(lines, state, operation, safeZ);
  }

  lines.push("M5");
  emitSafeZ(lines, state, parkPosition.z);
  lines.push(`G0 X${formatCoordinate(parkPosition.x)} Y${formatCoordinate(parkPosition.y)}`);
  state.position.x = parkPosition.x;
  state.position.y = parkPosition.y;
  lines.push("M30");

  const program = `${lines.map((line) => line.toUpperCase()).join("\n")}\n`;
  if (program !== program.toUpperCase()) {
    throw new A2mcPostError("A2MC output must be uppercase only.");
  }
  return program;
}

export function getA2mcTargetController(): Cut2KitControllerTarget {
  return "axyz-a2mc";
}
