import {
  buildCut2KitAgentPrompt,
  buildCut2KitFramingLayoutPrompt,
  buildFramingLayoutArtifactPaths,
  buildFramingLayoutThreadTitle,
  resolveCut2KitAutomationModelSelection,
  summarizeCut2KitProjectHealth,
} from "@t3tools/shared/cut2kit";
import type { Cut2KitProject, ProjectId, ThreadId } from "@t3tools/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { BotIcon, CheckIcon, FolderIcon, HammerIcon, TriangleAlertIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ProjectPdfWorkspace } from "../features/cut2kit-pdf/components/ProjectPdfWorkspace";
import {
  buildProjectPdfOptions,
  findProjectPdfOption,
  isFramingWorkspacePdfOption,
} from "../features/cut2kit-pdf/lib/projectPdfFiles";
import { openInPreferredEditor } from "../editorPreferences";
import { useHandleNewThread } from "../hooks/useHandleNewThread";
import { cut2kitProjectQueryOptions, cut2kitQueryKeys } from "../lib/cut2kitReactQuery";
import { newCommandId, newMessageId, newThreadId } from "../lib/utils";
import { readNativeApi } from "../nativeApi";
import { useStore } from "../store";
import { useProjectById } from "../storeSelectors";
import { toastManager } from "./ui/toast";
import { useComposerDraftStore } from "../composerDraftStore";
import { Cut2KitProjectExplorer } from "./sidebar/Cut2KitProjectExplorer";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { ScrollArea } from "./ui/scroll-area";

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

function isTerminalGenerationStatus(status: string | null | undefined): boolean {
  return (
    status === "ready" || status === "stopped" || status === "error" || status === "interrupted"
  );
}

export function Cut2KitProjectView({ projectId }: { projectId: ProjectId }) {
  const project = useProjectById(projectId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { handleNewThread } = useHandleNewThread();
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingWallLayout, setIsGeneratingWallLayout] = useState(false);
  const [isPreparingAgent, setIsPreparingAgent] = useState(false);
  const [selectedSourcePdfPath, setSelectedSourcePdfPath] = useState<string | null>(null);
  const [isStartingFramingGeneration, setIsStartingFramingGeneration] = useState(false);
  const [isRenderingFramingLayout, setIsRenderingFramingLayout] = useState(false);
  const [activeFramingGeneration, setActiveFramingGeneration] = useState<{
    threadId: ThreadId;
    sourcePdfPath: string;
    jsonPath: string;
    pdfPath: string;
  } | null>(null);
  const renderedGenerationThreadIdsRef = useRef(new Set<ThreadId>());
  const completedGenerationThreadIdsRef = useRef(new Set<ThreadId>());

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
  const elevationPdfOptions = useMemo(
    () => (snapshot ? buildProjectPdfOptions(snapshot).filter(isFramingWorkspacePdfOption) : []),
    [snapshot],
  );
  const selectedElevationOption = useMemo(
    () => findProjectPdfOption(elevationPdfOptions, selectedSourcePdfPath),
    [elevationPdfOptions, selectedSourcePdfPath],
  );
  const framingArtifacts = useMemo(
    () =>
      snapshot && selectedSourcePdfPath
        ? buildFramingLayoutArtifactPaths(snapshot, selectedSourcePdfPath)
        : null,
    [snapshot, selectedSourcePdfPath],
  );
  const framingPrompt = useMemo(
    () =>
      snapshot && selectedSourcePdfPath
        ? buildCut2KitFramingLayoutPrompt({
            project: snapshot,
            sourcePdfPath: selectedSourcePdfPath,
          })
        : "",
    [selectedSourcePdfPath, snapshot],
  );
  const framingGenerationThread = useStore((store) =>
    activeFramingGeneration
      ? (store.threads.find((thread) => thread.id === activeFramingGeneration.threadId) ?? null)
      : null,
  );
  const framingJsonReady = useMemo(
    () =>
      Boolean(
        framingArtifacts &&
        snapshot?.files.some(
          (file) =>
            file.kind === "file" &&
            file.relativePath === framingArtifacts.jsonPath &&
            file.classification === "json",
        ),
      ),
    [framingArtifacts, snapshot],
  );
  const framingPdfReady = useMemo(
    () =>
      Boolean(
        framingArtifacts &&
        snapshot?.files.some(
          (file) =>
            file.kind === "file" &&
            file.relativePath === framingArtifacts.pdfPath &&
            file.classification === "pdf",
        ),
      ),
    [framingArtifacts, snapshot],
  );
  const activeFramingJsonReady = useMemo(
    () =>
      Boolean(
        activeFramingGeneration &&
        snapshot?.files.some(
          (file) =>
            file.kind === "file" &&
            file.relativePath === activeFramingGeneration.jsonPath &&
            file.classification === "json",
        ),
      ),
    [activeFramingGeneration, snapshot],
  );
  const activeFramingPdfReady = useMemo(
    () =>
      Boolean(
        activeFramingGeneration &&
        snapshot?.files.some(
          (file) =>
            file.kind === "file" &&
            file.relativePath === activeFramingGeneration.pdfPath &&
            file.classification === "pdf",
        ),
      ),
    [activeFramingGeneration, snapshot],
  );
  const framingThreadStatus = framingGenerationThread?.session?.orchestrationStatus ?? null;

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

  const handleGenerateWallLayout = useCallback(async () => {
    if (!project || !selectedSourcePdfPath) return;
    const api = readNativeApi();
    if (!api) return;

    setIsGeneratingWallLayout(true);
    try {
      const result = await api.cut2kit.generateWallLayout({
        cwd: project.cwd,
        sourcePdfPath: selectedSourcePdfPath,
      });
      queryClient.setQueryData(cut2kitQueryKeys.project(project.cwd), result.project);
      toastManager.add({
        type: "success",
        title: "Wall layout package generated",
        description: `${result.writtenPaths.length} framing/sheathing artifacts written for ${selectedSourcePdfPath}.`,
      });
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Could not generate wall layout package",
        description: error instanceof Error ? error.message : "An unexpected error occurred.",
      });
    } finally {
      setIsGeneratingWallLayout(false);
    }
  }, [project, queryClient, selectedSourcePdfPath]);

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

  const handleGenerateFramingLayout = useCallback(async () => {
    if (!project || !snapshot || !selectedSourcePdfPath || !framingArtifacts) {
      return;
    }

    if (selectedElevationOption?.classification !== "elevation") {
      toastManager.add({
        type: "error",
        title: "Select an elevation PDF first",
        description:
          "Framing layout generation only runs from a source document classified as an elevation PDF.",
      });
      return;
    }

    const api = readNativeApi();
    if (!api) return;

    const createdAt = new Date().toISOString();
    const threadId = newThreadId();
    const modelSelection = resolveCut2KitAutomationModelSelection(
      snapshot,
      project.defaultModelSelection,
    );

    setIsStartingFramingGeneration(true);
    try {
      await api.orchestration.dispatchCommand({
        type: "thread.create",
        commandId: newCommandId(),
        threadId,
        projectId: project.id,
        title: buildFramingLayoutThreadTitle(selectedSourcePdfPath),
        modelSelection,
        runtimeMode: "full-access",
        interactionMode: "default",
        branch: null,
        worktreePath: null,
        createdAt,
      });

      await api.orchestration.dispatchCommand({
        type: "thread.turn.start",
        commandId: newCommandId(),
        threadId,
        message: {
          messageId: newMessageId(),
          role: "user",
          text: framingPrompt,
          attachments: [],
        },
        modelSelection,
        titleSeed: buildFramingLayoutThreadTitle(selectedSourcePdfPath),
        runtimeMode: "full-access",
        interactionMode: "default",
        createdAt,
      });

      renderedGenerationThreadIdsRef.current.delete(threadId);
      completedGenerationThreadIdsRef.current.delete(threadId);
      setActiveFramingGeneration({
        threadId,
        sourcePdfPath: selectedSourcePdfPath,
        jsonPath: framingArtifacts.jsonPath,
        pdfPath: framingArtifacts.pdfPath,
      });
      toastManager.add({
        type: "success",
        title: "Framing layout generation started",
        description: `Codex is generating ${framingArtifacts.jsonPath} from ${selectedSourcePdfPath}.`,
      });
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Could not start framing layout generation",
        description: error instanceof Error ? error.message : "An unexpected error occurred.",
      });
    } finally {
      setIsStartingFramingGeneration(false);
    }
  }, [
    framingArtifacts,
    framingPrompt,
    project,
    selectedElevationOption?.classification,
    selectedSourcePdfPath,
    snapshot,
  ]);

  const handleOpenFramingThread = useCallback(async () => {
    if (!activeFramingGeneration) return;
    await navigate({
      to: "/$threadId",
      params: { threadId: activeFramingGeneration.threadId },
    });
  }, [activeFramingGeneration, navigate]);

  useEffect(() => {
    if (!project || !activeFramingGeneration) {
      return;
    }
    const intervalId = globalThis.setInterval(() => {
      void queryClient.invalidateQueries({
        queryKey: cut2kitQueryKeys.project(project.cwd),
      });
    }, 3_000);
    return () => {
      globalThis.clearInterval(intervalId);
    };
  }, [activeFramingGeneration, project, queryClient]);

  useEffect(() => {
    if (!project || !activeFramingGeneration || isRenderingFramingLayout) {
      return;
    }
    if (!isTerminalGenerationStatus(framingThreadStatus) || !activeFramingJsonReady) {
      return;
    }
    if (renderedGenerationThreadIdsRef.current.has(activeFramingGeneration.threadId)) {
      return;
    }

    const api = readNativeApi();
    if (!api) return;

    renderedGenerationThreadIdsRef.current.add(activeFramingGeneration.threadId);
    setIsRenderingFramingLayout(true);
    void api.cut2kit
      .renderFramingLayout({
        cwd: project.cwd,
        relativePath: activeFramingGeneration.jsonPath,
      })
      .then((result) => {
        queryClient.setQueryData(cut2kitQueryKeys.project(project.cwd), result.project);
        toastManager.add({
          type: "success",
          title: "Framing layout PDF rendered",
          description: `Wrote ${result.pdfPath} from ${result.jsonPath}.`,
        });
      })
      .catch((error) => {
        renderedGenerationThreadIdsRef.current.delete(activeFramingGeneration.threadId);
        toastManager.add({
          type: "error",
          title: "Could not render framing layout PDF",
          description: error instanceof Error ? error.message : "An unexpected error occurred.",
        });
      })
      .finally(() => {
        setIsRenderingFramingLayout(false);
      });
  }, [
    activeFramingGeneration,
    activeFramingJsonReady,
    framingThreadStatus,
    isRenderingFramingLayout,
    project,
    queryClient,
  ]);

  useEffect(() => {
    if (!activeFramingGeneration || !isTerminalGenerationStatus(framingThreadStatus)) {
      return;
    }
    if (completedGenerationThreadIdsRef.current.has(activeFramingGeneration.threadId)) {
      return;
    }
    if (!activeFramingJsonReady && framingThreadStatus === "error") {
      completedGenerationThreadIdsRef.current.add(activeFramingGeneration.threadId);
      toastManager.add({
        type: "error",
        title: "Framing layout generation failed",
        description:
          framingGenerationThread?.session?.lastError ??
          "Codex finished without producing the framing layout JSON artifact.",
      });
      setActiveFramingGeneration(null);
      return;
    }
    if (
      !activeFramingJsonReady &&
      (framingThreadStatus === "ready" ||
        framingThreadStatus === "stopped" ||
        framingThreadStatus === "interrupted")
    ) {
      completedGenerationThreadIdsRef.current.add(activeFramingGeneration.threadId);
      toastManager.add({
        type: "error",
        title: "Framing layout JSON not found",
        description:
          "Codex finished the framing-layout thread without writing the expected JSON artifact.",
      });
      setActiveFramingGeneration(null);
      return;
    }
    if (
      isRenderingFramingLayout ||
      !activeFramingPdfReady ||
      !renderedGenerationThreadIdsRef.current.has(activeFramingGeneration.threadId)
    ) {
      return;
    }
    completedGenerationThreadIdsRef.current.add(activeFramingGeneration.threadId);
    setActiveFramingGeneration(null);
  }, [
    activeFramingGeneration,
    framingGenerationThread?.session?.lastError,
    activeFramingJsonReady,
    activeFramingPdfReady,
    framingThreadStatus,
    isRenderingFramingLayout,
  ]);

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
              <Badge variant="secondary">{snapshot.summary.pdfCount} PDFs</Badge>
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
              onClick={() => void handleGenerateWallLayout()}
              disabled={
                isGeneratingWallLayout ||
                !selectedSourcePdfPath ||
                selectedElevationOption?.classification !== "elevation"
              }
            >
              <HammerIcon className="size-4" />
              {isGeneratingWallLayout ? "Generating Wall Package..." : "Generate Wall Package"}
            </Button>
            <Button
              variant="outline"
              onClick={() => void handleGenerateFramingLayout()}
              disabled={
                isStartingFramingGeneration ||
                !selectedSourcePdfPath ||
                selectedElevationOption?.classification !== "elevation"
              }
            >
              <HammerIcon className="size-4" />
              {isStartingFramingGeneration ? "Starting Framing Run..." : "Generate Framing Layout"}
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

      <div className="mx-auto flex h-full w-full max-w-[1600px] min-h-0 flex-col gap-6 px-6 py-6 xl:flex-row">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
          <div className="flex min-h-0 flex-[2_1_0%]">
            <ProjectPdfWorkspace
              project={snapshot}
              selectedSourcePdfPath={selectedSourcePdfPath}
              onSelectedSourcePdfPathChange={setSelectedSourcePdfPath}
            />
          </div>

          <Card className="flex min-h-0 flex-[1_1_0%] flex-col overflow-hidden">
            <CardHeader className="border-b border-border/70">
              <CardTitle>AI-First Wall Automation</CardTitle>
              <CardDescription>
                The primary wall workflow runs geometry extraction, framing generation, and OSB
                generation through Codex/GPT-5.4, then validates and renders the PDFs
                deterministically. The framing-only thread below remains available as an advanced
                prompt/debug path.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid min-h-0 flex-1 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_260px]">
              <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border/70 bg-background/60">
                <div className="border-b border-border/70 px-3 py-2 text-xs font-medium text-muted-foreground">
                  Prompt preview
                </div>
                <ScrollArea className="min-h-0 flex-1">
                  <pre className="whitespace-pre-wrap px-3 py-3 text-xs leading-5 text-foreground">
                    {framingPrompt || "Select an elevation PDF to build the framing-layout prompt."}
                  </pre>
                </ScrollArea>
              </div>

              <div className="space-y-3">
                <div className="rounded-xl border border-border/70 bg-background/60 p-3">
                  <p className="text-xs font-medium text-muted-foreground">Selected elevation</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge
                      variant={
                        selectedElevationOption?.classification === "elevation"
                          ? "success"
                          : "outline"
                      }
                    >
                      {selectedElevationOption?.classification ?? "No elevation selected"}
                    </Badge>
                    {selectedElevationOption?.side ? (
                      <Badge variant="outline">{selectedElevationOption.side}</Badge>
                    ) : null}
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {selectedSourcePdfPath
                      ? `The AI-first wall run will use ${selectedSourcePdfPath} as the authoritative wall elevation PDF.`
                      : "Choose an elevation PDF in the workspace above before starting the wall run."}
                  </p>
                </div>

                <div className="rounded-xl border border-border/70 bg-background/60 p-3">
                  <p className="text-xs font-medium text-muted-foreground">Framing artifacts</p>
                  <p className="mt-2 break-all text-sm text-foreground">
                    {framingArtifacts?.jsonPath ??
                      "Select an elevation PDF to compute output paths"}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {framingArtifacts?.pdfPath ??
                      "The rendered PDF path is determined from the selected elevation PDF."}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Badge variant={framingJsonReady ? "success" : "outline"}>
                      {framingJsonReady ? "JSON ready" : "JSON pending"}
                    </Badge>
                    <Badge variant={framingPdfReady ? "success" : "outline"}>
                      {framingPdfReady
                        ? "PDF ready"
                        : isRenderingFramingLayout
                          ? "Rendering PDF"
                          : "PDF pending"}
                    </Badge>
                  </div>
                </div>

                <div className="rounded-xl border border-border/70 bg-background/60 p-3">
                  <p className="text-xs font-medium text-muted-foreground">Generation thread</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge variant={activeFramingGeneration ? "secondary" : "outline"}>
                      {activeFramingGeneration ? "Thread active" : "No active run"}
                    </Badge>
                    {framingThreadStatus ? (
                      <Badge variant="outline">{framingThreadStatus}</Badge>
                    ) : null}
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {activeFramingGeneration
                      ? `Codex thread ${activeFramingGeneration.threadId} is handling the current framing-layout run.`
                      : "Starting a framing run creates a dedicated full-access Codex thread for the selected elevation PDF."}
                  </p>
                </div>

                <div className="flex flex-col gap-2">
                  <Button
                    onClick={() => void handleGenerateWallLayout()}
                    disabled={
                      isGeneratingWallLayout ||
                      !selectedSourcePdfPath ||
                      selectedElevationOption?.classification !== "elevation"
                    }
                  >
                    <HammerIcon className="size-4" />
                    {isGeneratingWallLayout
                      ? "Generating Wall Package..."
                      : "Generate Wall Package"}
                  </Button>
                  <Button
                    onClick={() => void handleGenerateFramingLayout()}
                    disabled={
                      isStartingFramingGeneration ||
                      !selectedSourcePdfPath ||
                      selectedElevationOption?.classification !== "elevation"
                    }
                  >
                    <HammerIcon className="size-4" />
                    {isStartingFramingGeneration
                      ? "Starting Framing Run..."
                      : "Generate Framing Layout"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => void handleOpenFramingThread()}
                    disabled={!activeFramingGeneration}
                  >
                    <BotIcon className="size-4" />
                    Open Framing Thread
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
            </CardContent>
          </Card>
        </div>

        <div className="min-h-0 xl:w-[380px] xl:min-w-[380px]">
          <ScrollArea className="h-full">
            <div className="space-y-4 xl:pr-2">
              {snapshot.summary.errorCount > 0 ? (
                <Alert>
                  <TriangleAlertIcon className="size-4" />
                  <AlertTitle>Project validation is blocking output generation</AlertTitle>
                  <AlertDescription>
                    Resolve the settings, manufacturing-plan, or source-file errors below before
                    writing A2MC manifests and NC output files.
                  </AlertDescription>
                </Alert>
              ) : null}

              <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-1">
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
                  description={
                    snapshot.outputStatus.generated
                      ? "A2MC output files already exist."
                      : "A2MC output files have not been written yet."
                  }
                />
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Framing Layout Status</CardTitle>
                  <CardDescription>
                    Selected elevation, expected artifact paths, and the current Codex-run status
                    for the framing-layout workflow.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="rounded-xl border border-border/70 bg-background/60 p-3">
                    <p className="text-xs font-medium text-muted-foreground">Elevation PDF</p>
                    <p className="mt-1 break-all text-sm text-foreground">
                      {selectedSourcePdfPath ?? "No elevation PDF selected"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-background/60 p-3">
                    <p className="text-xs font-medium text-muted-foreground">Structured JSON</p>
                    <p className="mt-1 break-all text-sm text-foreground">
                      {framingArtifacts?.jsonPath ?? "Pending source selection"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-background/60 p-3">
                    <p className="text-xs font-medium text-muted-foreground">Rendered PDF</p>
                    <p className="mt-1 break-all text-sm text-foreground">
                      {framingArtifacts?.pdfPath ?? "Pending source selection"}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Validation</CardTitle>
                  <CardDescription>
                    Settings schema, PDF discovery, and project readiness checks.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
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
                            <span className="text-sm font-medium text-foreground">
                              {issue.code}
                            </span>
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
                  <CardTitle>Planned Outputs</CardTitle>
                  <CardDescription>
                    Deterministic manifests and A2MC jobs derived from the explicit manufacturing
                    plan.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
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
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Detected Source PDFs</CardTitle>
                  <CardDescription>
                    Source-PDF candidates come from the active project snapshot only.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {snapshot.sourceDocuments.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No source PDF documents were found.
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

              <Card>
                <CardHeader>
                  <CardTitle>Project Explorer</CardTitle>
                  <CardDescription>
                    Active-project files and generated artifacts discovered for this snapshot.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0 pb-2">
                  <Cut2KitProjectExplorer project={snapshot} />
                </CardContent>
              </Card>
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
