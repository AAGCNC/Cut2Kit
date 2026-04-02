import type { Cut2KitProject } from "@t3tools/contracts";

export function summarizeCut2KitProjectHealth(project: Cut2KitProject): string {
  const statusLabel =
    project.status === "error"
      ? "blocked"
      : project.status === "warning"
        ? "attention needed"
        : "ready";
  return `${statusLabel}: ${project.summary.dxfCount} DXFs, ${project.summary.warningCount} warnings, ${project.summary.errorCount} errors`;
}

export function buildCut2KitAgentPrompt(project: Cut2KitProject): string {
  const snapshot = {
    cwd: project.cwd,
    name: project.name,
    status: project.status,
    settingsFilePath: project.settingsFilePath,
    summary: project.summary,
    issues: project.issues,
    sourceDocuments: project.sourceDocuments,
    framingRules: project.framingRules,
    panelManifest: project.panelManifest,
    nestManifest: project.nestManifest,
    queueManifest: project.queueManifest,
    ncJobs: project.ncJobs.map((job) => ({
      jobId: job.jobId,
      sourcePath: job.sourcePath,
      relativeOutputPath: job.relativeOutputPath,
      queueMode: job.queueMode,
      queueGroup: job.queueGroup,
      application: job.application,
    })),
  };

  return [
    "You are the Cut to Kit Agent for AXYZ Cut2Kit.",
    "Use the explicit project snapshot below as the source of truth.",
    "Explain project readiness, identify blocking issues, and suggest rule JSON improvements when useful.",
    "Do not assume hidden state. Do not silently mutate production files. Any file edits must go through explicit approval.",
    "If you recommend settings changes, present them as a reviewable JSON patch or replacement block and explain why each change helps kitting-first production.",
    "Project snapshot:",
    JSON.stringify(snapshot, null, 2),
  ].join("\n\n");
}
