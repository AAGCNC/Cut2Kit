import type { Cut2KitProject } from "@t3tools/contracts";

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
