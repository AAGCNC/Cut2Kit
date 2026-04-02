import { buildCut2KitAgentPrompt, summarizeCut2KitProjectHealth } from "@t3tools/shared/cut2kit";
import type { Cut2KitProject, ProjectId } from "@t3tools/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BotIcon,
  CheckIcon,
  FolderIcon,
  HammerIcon,
  TriangleAlertIcon,
  WrenchIcon,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { openInPreferredEditor } from "../editorPreferences";
import { useHandleNewThread } from "../hooks/useHandleNewThread";
import { cut2kitProjectQueryOptions, cut2kitQueryKeys } from "../lib/cut2kitReactQuery";
import { readNativeApi } from "../nativeApi";
import { useProjectById } from "../storeSelectors";
import { toastManager } from "./ui/toast";
import { useComposerDraftStore } from "../composerDraftStore";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { ScrollArea } from "./ui/scroll-area";
import { Separator } from "./ui/separator";

function statusBadgeVariant(projectStatus: Cut2KitProject["status"]) {
  if (projectStatus === "error") return "error" as const;
  if (projectStatus === "warning") return "warning" as const;
  return "success" as const;
}

function statusLabel(projectStatus: Cut2KitProject["status"]) {
  if (projectStatus === "error") return "Blocked";
  if (projectStatus === "warning") return "Attention Needed";
  return "Ready";
}

function severityBadgeVariant(severity: Cut2KitProject["issues"][number]["severity"]) {
  if (severity === "error") return "error" as const;
  if (severity === "warning") return "warning" as const;
  return "info" as const;
}

function MetricCard({
  label,
  value,
  description,
}: {
  label: string;
  value: string | number;
  description: string;
}) {
  return (
    <Card className="min-h-32">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl">{value}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0 text-sm text-muted-foreground">{description}</CardContent>
    </Card>
  );
}

export function Cut2KitProjectView({ projectId }: { projectId: ProjectId }) {
  const project = useProjectById(projectId);
  const queryClient = useQueryClient();
  const { handleNewThread } = useHandleNewThread();
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPreparingAgent, setIsPreparingAgent] = useState(false);

  const snapshotQuery = useQuery(
    cut2kitProjectQueryOptions({
      cwd: project?.cwd ?? null,
      enabled: project !== undefined,
    }),
  );

  const snapshot = snapshotQuery.data ?? null;
  const issueSummary = useMemo(() => {
    if (!snapshot) {
      return { warnings: 0, errors: 0 };
    }
    return {
      warnings: snapshot.issues.filter((issue) => issue.severity === "warning").length,
      errors: snapshot.issues.filter((issue) => issue.severity === "error").length,
    };
  }, [snapshot]);
  const agentPrompt = useMemo(
    () => (snapshot ? buildCut2KitAgentPrompt(snapshot) : ""),
    [snapshot],
  );

  const handleGenerateOutputs = useCallback(async () => {
    if (!project) return;
    const api = readNativeApi();
    if (!api) return;

    setIsGenerating(true);
    try {
      const result = await api.cut2kit.generateOutputs({ cwd: project.cwd });
      queryClient.setQueryData(cut2kitQueryKeys.project(project.cwd), result.project);
      toastManager.add({
        type: "success",
        title: "A2MC outputs generated",
        description: `${result.writtenPaths.length} files written under ${project.cwd}.`,
      });
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Could not generate A2MC outputs",
        description: error instanceof Error ? error.message : "An unexpected error occurred.",
      });
    } finally {
      setIsGenerating(false);
    }
  }, [project, queryClient]);

  const handleOpenInEditor = useCallback(async () => {
    if (!project) return;
    const api = readNativeApi();
    if (!api) return;
    try {
      await openInPreferredEditor(api, project.cwd);
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Could not open project",
        description: error instanceof Error ? error.message : "An unexpected error occurred.",
      });
    }
  }, [project]);

  const handlePrepareAgent = useCallback(async () => {
    if (!project || !snapshot) return;
    setIsPreparingAgent(true);
    try {
      await handleNewThread(project.id, { envMode: "local" });
      const draftStore = useComposerDraftStore.getState();
      const draftThread = draftStore.getDraftThreadByProjectId(project.id);
      if (!draftThread) {
        throw new Error("Unable to open a draft thread for this project.");
      }

      draftStore.setPrompt(draftThread.threadId, agentPrompt);
      draftStore.setDraftThreadContext(draftThread.threadId, {
        runtimeMode: "approval-required",
        interactionMode: "default",
      });

      toastManager.add({
        type: "success",
        title: "Cut to Kit Agent prepared",
        description:
          "Opened a supervised Codex thread with the current project snapshot and A2MC manufacturing-plan guidance. Review the prompt and send when ready.",
      });
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Could not prepare the agent thread",
        description: error instanceof Error ? error.message : "An unexpected error occurred.",
      });
    } finally {
      setIsPreparingAgent(false);
    }
  }, [agentPrompt, handleNewThread, project, snapshot]);

  if (!project) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-sm text-muted-foreground">
        Project not found.
      </div>
    );
  }

  if (snapshotQuery.isLoading && !snapshot) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-sm text-muted-foreground">
        Scanning project directory...
      </div>
    );
  }

  if (snapshotQuery.isError || !snapshot) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-sm text-muted-foreground">
        Could not load the Cut2Kit project snapshot.
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background text-foreground">
      <header className="border-b border-border bg-card/70 px-6 py-4">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={statusBadgeVariant(snapshot.status)}>
                {statusLabel(snapshot.status)}
              </Badge>
              <Badge variant="outline">{snapshot.settings?.schemaVersion ?? "No settings"}</Badge>
              <Badge variant="secondary">{snapshot.summary.dxfCount} DXFs</Badge>
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{snapshot.name}</h1>
              <p className="text-sm text-muted-foreground">{snapshot.cwd}</p>
            </div>
            <p className="max-w-3xl text-sm text-muted-foreground">
              {summarizeCut2KitProjectHealth(snapshot)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => void handleOpenInEditor()}>
              <FolderIcon className="size-4" />
              Open Folder
            </Button>
            <Button
              variant="outline"
              onClick={() => void handlePrepareAgent()}
              disabled={isPreparingAgent}
            >
              <BotIcon className="size-4" />
              {isPreparingAgent ? "Preparing Agent..." : "Open Cut to Kit Agent"}
            </Button>
            <Button
              onClick={() => void handleGenerateOutputs()}
              disabled={isGenerating || snapshot.summary.errorCount > 0}
            >
              <HammerIcon className="size-4" />
              {isGenerating ? "Generating..." : "Generate A2MC Outputs"}
            </Button>
          </div>
        </div>
      </header>

      <ScrollArea className="flex-1">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6">
          {snapshot.summary.errorCount > 0 ? (
            <Alert>
              <TriangleAlertIcon className="size-4" />
              <AlertTitle>Project validation is blocking output generation</AlertTitle>
              <AlertDescription>
                Resolve the settings, manufacturing-plan, or source-file errors below before writing
                A2MC manifests and NC output files.
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-4 md:grid-cols-3">
            <MetricCard
              label="Detected Files"
              value={snapshot.summary.totalFiles}
              description={`${snapshot.summary.totalDirectories} folders indexed in the project tree.`}
            />
            <MetricCard
              label="Validation"
              value={issueSummary.errors > 0 ? issueSummary.errors : issueSummary.warnings}
              description={
                issueSummary.errors > 0
                  ? `${issueSummary.errors} blocking errors need attention.`
                  : issueSummary.warnings > 0
                    ? `${issueSummary.warnings} warnings are worth reviewing.`
                    : "No warnings or errors were found."
              }
            />
            <MetricCard
              label="Planned NC Jobs"
              value={snapshot.ncJobs.length}
              description={`${snapshot.outputStatus.generated ? "A2MC output files already exist." : "A2MC output files have not been written yet."}`}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <Card>
              <CardHeader>
                <CardTitle>Validation</CardTitle>
                <CardDescription>
                  Settings schema, DXF discovery, and project readiness checks.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-border/70 bg-background/60 p-3">
                    <p className="text-xs font-medium text-muted-foreground">Settings file</p>
                    <p className="mt-1 break-all text-sm text-foreground">
                      {snapshot.settingsFilePath ?? "Not found"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-background/60 p-3">
                    <p className="text-xs font-medium text-muted-foreground">Schema version</p>
                    <p className="mt-1 text-sm text-foreground">
                      {snapshot.settings?.schemaVersion ?? "Missing or invalid"}
                    </p>
                  </div>
                </div>
                <div className="space-y-2">
                  {snapshot.issues.length === 0 ? (
                    <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-background/60 p-3 text-sm text-foreground">
                      <CheckIcon className="size-4 text-emerald-500" />
                      No validation issues detected.
                    </div>
                  ) : (
                    snapshot.issues.map((issue) => (
                      <div
                        key={`${issue.code}:${issue.path ?? issue.message}`}
                        className="rounded-xl border border-border/70 bg-background/60 p-3"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={severityBadgeVariant(issue.severity)}>
                            {issue.severity}
                          </Badge>
                          <span className="text-sm font-medium text-foreground">{issue.code}</span>
                        </div>
                        <p className="mt-2 text-sm text-foreground">{issue.message}</p>
                        {issue.path ? (
                          <p className="mt-1 break-all text-xs text-muted-foreground">
                            {issue.path}
                          </p>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Detected DXFs</CardTitle>
                <CardDescription>
                  Source documents classified from settings and path heuristics.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {snapshot.sourceDocuments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No DXF source documents were found.
                  </p>
                ) : (
                  snapshot.sourceDocuments.map((sourceDocument) => (
                    <div
                      key={sourceDocument.sourcePath}
                      className="rounded-xl border border-border/70 bg-background/60 p-3"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">{sourceDocument.classification}</Badge>
                        {sourceDocument.application ? (
                          <Badge variant="outline">{sourceDocument.application}</Badge>
                        ) : null}
                        {sourceDocument.side ? (
                          <Badge variant="outline">{sourceDocument.side}</Badge>
                        ) : null}
                      </div>
                      <p className="mt-2 break-all text-sm text-foreground">
                        {sourceDocument.sourcePath}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Classified via {sourceDocument.assignmentSource}.
                      </p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <Card>
              <CardHeader>
                <CardTitle>Planned Outputs</CardTitle>
                <CardDescription>
                  Deterministic A2MC manifests and NC jobs derived from the explicit manufacturing
                  plan and project state.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-border/70 bg-background/60 p-3">
                    <p className="text-xs font-medium text-muted-foreground">Panels</p>
                    <p className="mt-1 text-2xl font-semibold text-foreground">
                      {snapshot.panelManifest.panels.length}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-background/60 p-3">
                    <p className="text-xs font-medium text-muted-foreground">Nests</p>
                    <p className="mt-1 text-2xl font-semibold text-foreground">
                      {snapshot.nestManifest.nests.length}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-background/60 p-3">
                    <p className="text-xs font-medium text-muted-foreground">Queue entries</p>
                    <p className="mt-1 text-2xl font-semibold text-foreground">
                      {snapshot.queueManifest.entries.length}
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border border-border/70 bg-background/60 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-medium text-muted-foreground">Manufacturing plan</p>
                    <Badge variant={snapshot.manufacturingPlan ? "success" : "outline"}>
                      {snapshot.manufacturingPlan
                        ? snapshot.manufacturingPlan.targetController
                        : "Missing"}
                    </Badge>
                  </div>
                  <p className="mt-2 break-all text-sm text-foreground">
                    {snapshot.manufacturingPlanFilePath ?? "cut2kit.manufacturing.json not found"}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {snapshot.manufacturingPlan
                      ? `${snapshot.manufacturingPlan.jobs.length} manufacturing jobs are ready for deterministic A2MC posting.`
                      : "Use the Cut to Kit Agent or manual edits to create cut2kit.manufacturing.json before generating outputs."}
                  </p>
                </div>

                <div className="rounded-xl border border-border/70 bg-background/60 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-medium text-muted-foreground">Generation status</p>
                    <Badge variant={snapshot.outputStatus.generated ? "success" : "outline"}>
                      {snapshot.outputStatus.generated ? "Outputs detected" : "Not generated yet"}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm text-foreground">
                    {snapshot.outputStatus.generated
                      ? `${snapshot.outputStatus.ncFilePaths.length} A2MC NC files are present under output/nc.`
                      : "Run Generate A2MC Outputs to write manifests and controller-safe NC files to disk."}
                  </p>
                </div>

                <div className="rounded-xl border border-border/70 bg-background/60 p-3">
                  <p className="text-xs font-medium text-muted-foreground">Manifest paths</p>
                  <div className="mt-2 space-y-1">
                    {snapshot.outputStatus.manifestPaths.map((manifestPath) => (
                      <p key={manifestPath} className="break-all text-sm text-foreground">
                        {manifestPath}
                      </p>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-border/70 bg-background/60 p-3">
                  <p className="text-xs font-medium text-muted-foreground">Generated NC paths</p>
                  <div className="mt-2 space-y-1">
                    {snapshot.outputStatus.ncFilePaths.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No A2MC NC files have been written yet.
                      </p>
                    ) : (
                      snapshot.outputStatus.ncFilePaths.slice(0, 6).map((ncPath) => (
                        <p key={ncPath} className="break-all text-sm text-foreground">
                          {ncPath}
                        </p>
                      ))
                    )}
                  </div>
                  {snapshot.outputStatus.ncFilePaths.length > 6 ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Showing first 6 of {snapshot.outputStatus.ncFilePaths.length} generated NC
                      files.
                    </p>
                  ) : null}
                </div>

                <div className="rounded-xl border border-border/70 bg-background/60 p-3">
                  <p className="text-xs font-medium text-muted-foreground">NC jobs</p>
                  <div className="mt-2 space-y-2">
                    {snapshot.ncJobs.slice(0, 6).map((job) => (
                      <div key={job.jobId} className="rounded-lg border border-border/60 px-3 py-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="secondary">{job.queueMode}</Badge>
                          <Badge variant="outline">{job.queueGroup}</Badge>
                          <Badge variant="outline">{job.targetController}</Badge>
                          {job.application ? (
                            <Badge variant="outline">{job.application}</Badge>
                          ) : null}
                        </div>
                        <p className="mt-2 break-all text-sm text-foreground">
                          {job.relativeOutputPath}
                        </p>
                        <p className="mt-1 break-all text-xs text-muted-foreground">
                          {job.sourcePath}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {job.operationCount} operations from {job.planSourcePath}
                        </p>
                      </div>
                    ))}
                    {snapshot.ncJobs.length > 6 ? (
                      <p className="text-xs text-muted-foreground">
                        Showing first 6 of {snapshot.ncJobs.length} planned NC jobs.
                      </p>
                    ) : null}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Cut to Kit Agent</CardTitle>
                <CardDescription>
                  Supervised Codex workflow seeded with the current project snapshot and A2MC
                  manufacturing-plan path.
                </CardDescription>
                <CardAction>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void handlePrepareAgent()}
                    disabled={isPreparingAgent}
                  >
                    <WrenchIcon className="size-4" />
                    {isPreparingAgent ? "Preparing..." : "Prepare Thread"}
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-xl border border-border/70 bg-background/60 p-3 text-sm text-muted-foreground">
                  The prepared thread runs in supervised mode. Any settings or manufacturing-plan
                  edits still require explicit file-change approval before they are applied.
                </div>
                <div className="rounded-xl border border-border/70 bg-background/60">
                  <div className="border-b border-border/70 px-3 py-2 text-xs font-medium text-muted-foreground">
                    Prompt preview
                  </div>
                  <ScrollArea className="h-72">
                    <pre className="whitespace-pre-wrap px-3 py-3 text-xs leading-5 text-foreground">
                      {agentPrompt}
                    </pre>
                  </ScrollArea>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>File Classification</CardTitle>
              <CardDescription>
                Recognized files currently discovered in the selected project directory.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {snapshot.files
                .filter((entry) => entry.kind === "file")
                .slice(0, 16)
                .map((entry, index) => (
                  <div key={entry.relativePath}>
                    {index > 0 ? <Separator className="mb-3" /> : null}
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{entry.classification}</Badge>
                      <Badge variant="secondary">{entry.role}</Badge>
                    </div>
                    <p className="mt-2 break-all text-sm text-foreground">{entry.relativePath}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {entry.sizeBytes ?? 0} bytes
                    </p>
                  </div>
                ))}
              {snapshot.files.filter((entry) => entry.kind === "file").length > 16 ? (
                <p className="text-xs text-muted-foreground">
                  Showing first 16 files from the classified project inventory.
                </p>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    </div>
  );
}
