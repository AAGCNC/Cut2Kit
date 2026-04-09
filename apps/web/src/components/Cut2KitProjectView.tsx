import {
  buildCut2KitAgentPrompt,
  buildFramingLayoutArtifactPaths,
  buildFramingLayoutThreadTitle,
  buildManufacturingPlanArtifactPath,
  buildManufacturingPlanThreadTitle,
  buildSheathingLayoutArtifactPaths,
  buildWallPackageThreadTitle,
  resolveCut2KitAutomationModelSelection,
  summarizeCut2KitProjectHealth,
} from "@t3tools/shared/cut2kit";
import {
  PROVIDER_DISPLAY_NAMES,
  type Cut2KitProject,
  type ProjectId,
  type ThreadId,
} from "@t3tools/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { BotIcon, CheckIcon, FolderIcon, HammerIcon, TriangleAlertIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  ProjectPdfWorkspace,
  SheathingPdfWorkspace,
} from "../features/cut2kit-pdf/components/ProjectPdfWorkspace";
import { cut2kitPdfQueryKeys } from "../features/cut2kit-pdf/hooks/usePdfDocument";
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
import { Cut2KitSettingsEditorDialog } from "./cut2kit-settings/Cut2KitSettingsEditorDialog";
import {
  canRenderLayoutPdfFromJson,
  canRenderFramingPdfFromJson,
  didLayoutJsonBecomeReady,
  didFramingJsonBecomeReady,
  shouldAutoRenderLayoutPdf,
  shouldAutoRenderFramingPdf,
} from "./cut2kitFramingLayout.logic";
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
  const [isStartingWallPackageGeneration, setIsStartingWallPackageGeneration] = useState(false);
  const [isStartingManufacturingPlanGeneration, setIsStartingManufacturingPlanGeneration] =
    useState(false);
  const [isPreparingAgent, setIsPreparingAgent] = useState(false);
  const [isSettingsEditorOpen, setIsSettingsEditorOpen] = useState(false);
  const [selectedSourcePdfPath, setSelectedSourcePdfPath] = useState<string | null>(null);
  const [isStartingFramingGeneration, setIsStartingFramingGeneration] = useState(false);
  const [isRenderingFramingLayout, setIsRenderingFramingLayout] = useState(false);
  const [isRenderingWallPackage, setIsRenderingWallPackage] = useState(false);
  const [activeFramingGeneration, setActiveFramingGeneration] = useState<{
    threadId: ThreadId;
    sourcePdfPath: string;
    jsonPath: string;
    pdfPath: string;
  } | null>(null);
  const [activeWallPackageGeneration, setActiveWallPackageGeneration] = useState<{
    threadId: ThreadId;
    sourcePdfPath: string;
    jsonPath: string;
    pdfPath: string;
  } | null>(null);
  const [activeManufacturingPlanGeneration, setActiveManufacturingPlanGeneration] = useState<{
    threadId: ThreadId;
    sourcePdfPath: string;
    sheathingJsonPath: string;
    manufacturingPlanPath: string;
  } | null>(null);
  const completedGenerationThreadIdsRef = useRef(new Set<ThreadId>());
  const completedWallPackageThreadIdsRef = useRef(new Set<ThreadId>());
  const completedManufacturingPlanThreadIdsRef = useRef(new Set<ThreadId>());
  const autoRenderedFramingJsonPathsRef = useRef(new Set<string>());
  const autoRenderedWallPackageJsonPathsRef = useRef(new Set<string>());
  const previousSelectedFramingJsonRef = useRef<{
    jsonPath: string | null;
    jsonReady: boolean;
  }>({
    jsonPath: null,
    jsonReady: false,
  });
  const previousSelectedWallPackageJsonRef = useRef<{
    jsonPath: string | null;
    jsonReady: boolean;
  }>({
    jsonPath: null,
    jsonReady: false,
  });

  const snapshotQuery = useQuery(
    cut2kitProjectQueryOptions({
      cwd: project?.cwd ?? null,
      enabled: project !== undefined,
    }),
  );

  const snapshot = snapshotQuery.data ?? null;
  const snapshotErrorMessage = (() => {
    const error = snapshotQuery.error;
    if (!error) {
      return null;
    }
    if (error instanceof Error && error.message.trim().length > 0) {
      return error.message;
    }
    const fallback = String(error).trim();
    return fallback.length > 0 ? fallback : null;
  })();
  const hasWallWorkflowSettings = snapshot?.settings !== null && snapshot?.settings !== undefined;
  const automationModelSelection = useMemo(
    () =>
      snapshot && project
        ? resolveCut2KitAutomationModelSelection(snapshot, project.defaultModelSelection)
        : null,
    [project, snapshot],
  );
  const automationProviderLabel = automationModelSelection
    ? PROVIDER_DISPLAY_NAMES[automationModelSelection.provider]
    : "AI";
  const automationRuntimeLabel = automationModelSelection
    ? `${automationProviderLabel}/${automationModelSelection.model}`
    : "the configured AI runtime";
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
  const wallPackageArtifacts = useMemo(
    () =>
      snapshot && selectedSourcePdfPath
        ? buildSheathingLayoutArtifactPaths(snapshot, selectedSourcePdfPath)
        : null,
    [snapshot, selectedSourcePdfPath],
  );
  const manufacturingPlanPath = useMemo(
    () => (snapshot ? buildManufacturingPlanArtifactPath(snapshot) : null),
    [snapshot],
  );
  const framingPromptQuery = useQuery({
    queryKey: [
      "cut2kit",
      "compileFramingPrompt",
      snapshot?.cwd ?? null,
      selectedSourcePdfPath,
      snapshot?.summary.totalFiles ?? 0,
    ],
    enabled:
      snapshot !== null &&
      hasWallWorkflowSettings &&
      selectedSourcePdfPath !== null &&
      selectedElevationOption?.classification === "elevation",
    queryFn: async () => {
      const api = readNativeApi();
      if (!api || !snapshot || !selectedSourcePdfPath) {
        throw new Error("Cut2Kit prompt compilation is unavailable.");
      }
      return api.cut2kit.compileFramingPrompt({
        cwd: snapshot.cwd,
        sourcePdfPath: selectedSourcePdfPath,
      });
    },
  });
  const framingPrompt = framingPromptQuery.data?.prompt ?? "";
  const framingGenerationThread = useStore((store) =>
    activeFramingGeneration
      ? (store.threads.find((thread) => thread.id === activeFramingGeneration.threadId) ?? null)
      : null,
  );
  const wallPackageGenerationThread = useStore((store) =>
    activeWallPackageGeneration
      ? (store.threads.find((thread) => thread.id === activeWallPackageGeneration.threadId) ?? null)
      : null,
  );
  const manufacturingPlanGenerationThread = useStore((store) =>
    activeManufacturingPlanGeneration
      ? (store.threads.find((thread) => thread.id === activeManufacturingPlanGeneration.threadId) ??
          null)
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
  const wallPackageJsonReady = useMemo(
    () =>
      Boolean(
        wallPackageArtifacts &&
        snapshot?.files.some(
          (file) =>
            file.kind === "file" &&
            file.relativePath === wallPackageArtifacts.jsonPath &&
            file.classification === "json",
        ),
      ),
    [wallPackageArtifacts, snapshot],
  );
  const wallPackagePdfReady = useMemo(
    () =>
      Boolean(
        wallPackageArtifacts &&
        snapshot?.files.some(
          (file) =>
            file.kind === "file" &&
            file.relativePath === wallPackageArtifacts.pdfPath &&
            file.classification === "pdf",
        ),
      ),
    [wallPackageArtifacts, snapshot],
  );
  const manufacturingPromptQuery = useQuery({
    queryKey: [
      "cut2kit",
      "compileManufacturingPrompt",
      snapshot?.cwd ?? null,
      selectedSourcePdfPath,
      snapshot?.summary.totalFiles ?? 0,
    ],
    enabled:
      snapshot !== null &&
      hasWallWorkflowSettings &&
      selectedSourcePdfPath !== null &&
      selectedElevationOption?.classification === "elevation" &&
      wallPackageJsonReady,
    queryFn: async () => {
      const api = readNativeApi();
      if (!api || !snapshot || !selectedSourcePdfPath) {
        throw new Error("Cut2Kit manufacturing prompt compilation is unavailable.");
      }
      return api.cut2kit.compileManufacturingPrompt({
        cwd: snapshot.cwd,
        sourcePdfPath: selectedSourcePdfPath,
      });
    },
  });
  const manufacturingPlanFileReady = useMemo(
    () =>
      Boolean(
        manufacturingPlanPath &&
        snapshot?.files.some(
          (file) =>
            file.kind === "file" &&
            file.relativePath === manufacturingPlanPath &&
            file.role === "manufacturing-plan",
        ),
      ),
    [manufacturingPlanPath, snapshot],
  );
  const selectedManufacturingJobCount = useMemo(
    () =>
      selectedSourcePdfPath
        ? (snapshot?.manufacturingPlan?.jobs.filter((job) => job.sourcePath === selectedSourcePdfPath)
            .length ?? 0)
        : 0,
    [selectedSourcePdfPath, snapshot?.manufacturingPlan],
  );
  const manufacturingPlanReadyForSelectedSource = selectedManufacturingJobCount > 0;
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
  const activeWallPackageJsonReady = useMemo(
    () =>
      Boolean(
        activeWallPackageGeneration &&
        snapshot?.files.some(
          (file) =>
            file.kind === "file" &&
            file.relativePath === activeWallPackageGeneration.jsonPath &&
            file.classification === "json",
        ),
      ),
    [activeWallPackageGeneration, snapshot],
  );
  const activeWallPackagePdfReady = useMemo(
    () =>
      Boolean(
        activeWallPackageGeneration &&
        snapshot?.files.some(
          (file) =>
            file.kind === "file" &&
            file.relativePath === activeWallPackageGeneration.pdfPath &&
            file.classification === "pdf",
        ),
      ),
    [activeWallPackageGeneration, snapshot],
  );
  const activeManufacturingPlanReady = useMemo(
    () =>
      Boolean(
        activeManufacturingPlanGeneration &&
        snapshot?.manufacturingPlan?.jobs.some(
          (job) => job.sourcePath === activeManufacturingPlanGeneration.sourcePdfPath,
        ),
      ),
    [activeManufacturingPlanGeneration, snapshot?.manufacturingPlan],
  );
  const framingThreadStatus = framingGenerationThread?.session?.orchestrationStatus ?? null;
  const wallPackageThreadStatus = wallPackageGenerationThread?.session?.orchestrationStatus ?? null;
  const manufacturingPlanThreadStatus =
    manufacturingPlanGenerationThread?.session?.orchestrationStatus ?? null;
  const canRenderSelectedFramingLayoutPdf = useMemo(
    () =>
      canRenderFramingPdfFromJson({
        framingJsonPath: framingArtifacts?.jsonPath ?? null,
        framingJsonReady,
        isRenderingFramingLayout,
      }),
    [framingArtifacts?.jsonPath, framingJsonReady, isRenderingFramingLayout],
  );
  const canRenderSelectedWallPackagePdf = useMemo(
    () =>
      canRenderLayoutPdfFromJson({
        layoutJsonPath: wallPackageArtifacts?.jsonPath ?? null,
        layoutJsonReady: wallPackageJsonReady,
        isRenderingLayout: isRenderingWallPackage,
      }),
    [isRenderingWallPackage, wallPackageArtifacts?.jsonPath, wallPackageJsonReady],
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
        title: "NC files generated",
        description: `${result.writtenPaths.length} files written under ${project.cwd}.`,
      });
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Could not generate NC files",
        description: error instanceof Error ? error.message : "An unexpected error occurred.",
      });
    } finally {
      setIsGenerating(false);
    }
  }, [project, queryClient]);

  const renderFramingLayoutFromJson = useCallback(
    async (relativePath: string, options?: { auto?: boolean }) => {
      if (!project) return;
      const api = readNativeApi();
      if (!api) return;

      setIsRenderingFramingLayout(true);
      try {
        const result = await api.cut2kit.renderFramingLayout({
          cwd: project.cwd,
          relativePath,
        });
        queryClient.setQueryData(cut2kitQueryKeys.project(project.cwd), result.project);
        await queryClient.invalidateQueries({
          queryKey: cut2kitPdfQueryKeys.document(project.cwd, result.pdfPath),
        });
        toastManager.add({
          type: "success",
          title: "Framing layout PDF rendered",
          description: options?.auto
            ? `Detected ${result.jsonPath} and wrote ${result.pdfPath} automatically.`
            : `Wrote ${result.pdfPath} from ${result.jsonPath}.`,
        });
      } catch (error) {
        toastManager.add({
          type: "error",
          title: "Could not render framing layout PDF",
          description: error instanceof Error ? error.message : "An unexpected error occurred.",
        });
        throw error;
      } finally {
        setIsRenderingFramingLayout(false);
      }
    },
    [project, queryClient],
  );

  const renderWallPackageFromJson = useCallback(
    async (relativePath: string, options?: { auto?: boolean }) => {
      if (!project) return;
      const api = readNativeApi();
      if (!api) return;

      setIsRenderingWallPackage(true);
      try {
        const result = await api.cut2kit.renderSheathingLayout({
          cwd: project.cwd,
          relativePath,
        });
        queryClient.setQueryData(cut2kitQueryKeys.project(project.cwd), result.project);
        if (result.status === "completed") {
          await queryClient.invalidateQueries({
            queryKey: cut2kitPdfQueryKeys.document(project.cwd, result.pdfPath),
          });
          toastManager.add({
            type: "success",
            title: "Sheathing PDF rendered",
            description: options?.auto
              ? `Detected ${result.jsonPath} and wrote ${result.pdfPath} automatically.`
              : `Wrote ${result.pdfPath} from ${result.jsonPath}.`,
          });
        } else {
          toastManager.add({
            type: "error",
            title: "Sheathing validation blocked packaging",
            description:
              result.statusMessage ??
              "Cut2Kit saved the validation report, but did not render the sheathing PDF.",
          });
        }
        return result;
      } catch (error) {
        toastManager.add({
          type: "error",
          title: "Could not render sheathing PDF",
          description: error instanceof Error ? error.message : "An unexpected error occurred.",
        });
        throw error;
      } finally {
        setIsRenderingWallPackage(false);
      }
    },
    [project, queryClient],
  );

  const handleGenerateWallPackage = useCallback(async () => {
    if (
      !project ||
      !snapshot ||
      !selectedSourcePdfPath ||
      !wallPackageArtifacts ||
      !framingArtifacts
    ) {
      return;
    }

    if (selectedElevationOption?.classification !== "elevation") {
      toastManager.add({
        type: "error",
        title: "Select an elevation PDF first",
        description:
          "Sheathing generation only runs from a source document classified as an elevation PDF.",
      });
      return;
    }

    const api = readNativeApi();
    if (!api) return;
    if (!snapshot.settings) {
      toastManager.add({
        type: "error",
        title: "Cut2Kit settings are required",
        description:
          "Add a valid cut2kit.settings.json file to this project before starting sheathing generation.",
      });
      return;
    }
    if (!framingJsonReady) {
      toastManager.add({
        type: "error",
        title: "Framing layout JSON not found",
        description:
          "Generate the framing layout first. The sheathing flow uses the framing JSON as its AI input.",
      });
      return;
    }

    const createdAt = new Date().toISOString();
    const threadId = newThreadId();
    const modelSelection =
      automationModelSelection ??
      resolveCut2KitAutomationModelSelection(snapshot, project.defaultModelSelection);

    setIsStartingWallPackageGeneration(true);
    try {
      const compiledPrompt = await api.cut2kit.compileSheathingPrompt({
        cwd: snapshot.cwd,
        sourcePdfPath: selectedSourcePdfPath,
      });

      await api.orchestration.dispatchCommand({
        type: "thread.create",
        commandId: newCommandId(),
        threadId,
        projectId: project.id,
        title: buildWallPackageThreadTitle(selectedSourcePdfPath),
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
          text: compiledPrompt.prompt,
          attachments: [],
        },
        modelSelection,
        titleSeed: buildWallPackageThreadTitle(selectedSourcePdfPath),
        runtimeMode: "full-access",
        interactionMode: "default",
        createdAt,
      });

      completedWallPackageThreadIdsRef.current.delete(threadId);
      autoRenderedWallPackageJsonPathsRef.current.delete(wallPackageArtifacts.jsonPath);
      setActiveWallPackageGeneration({
        threadId,
        sourcePdfPath: selectedSourcePdfPath,
        jsonPath: wallPackageArtifacts.jsonPath,
        pdfPath: wallPackageArtifacts.pdfPath,
      });
      toastManager.add({
        type: "success",
        title: "Sheathing generation started",
        description: `${PROVIDER_DISPLAY_NAMES[modelSelection.provider]} is generating ${wallPackageArtifacts.jsonPath} from ${framingArtifacts.jsonPath}.`,
      });
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Could not start sheathing generation",
        description: error instanceof Error ? error.message : "An unexpected error occurred.",
      });
    } finally {
      setIsStartingWallPackageGeneration(false);
    }
  }, [
    automationModelSelection,
    framingArtifacts,
    framingJsonReady,
    project,
    selectedElevationOption?.classification,
    selectedSourcePdfPath,
    snapshot,
    wallPackageArtifacts,
  ]);

  const handleGenerateManufacturingPlan = useCallback(async () => {
    if (
      !project ||
      !snapshot ||
      !selectedSourcePdfPath ||
      !wallPackageArtifacts ||
      !manufacturingPlanPath
    ) {
      return;
    }

    if (selectedElevationOption?.classification !== "elevation") {
      toastManager.add({
        type: "error",
        title: "Select an elevation PDF first",
        description:
          "Manufacturing-plan generation only runs from a source document classified as an elevation PDF.",
      });
      return;
    }

    const api = readNativeApi();
    if (!api) return;
    if (!snapshot.settings) {
      toastManager.add({
        type: "error",
        title: "Cut2Kit settings are required",
        description:
          "Add a valid cut2kit.settings.json file to this project before starting manufacturing-plan generation.",
      });
      return;
    }
    if (!wallPackageJsonReady) {
      toastManager.add({
        type: "error",
        title: "Sheathing layout JSON not found",
        description:
          "Generate the sheathing layout first. NC output is derived from sheathing, not directly from the stud-wall layout.",
      });
      return;
    }

    const createdAt = new Date().toISOString();
    const threadId = newThreadId();
    const modelSelection =
      automationModelSelection ??
      resolveCut2KitAutomationModelSelection(snapshot, project.defaultModelSelection);

    setIsStartingManufacturingPlanGeneration(true);
    try {
      const compiledPrompt =
        manufacturingPromptQuery.data ??
        (await api.cut2kit.compileManufacturingPrompt({
          cwd: snapshot.cwd,
          sourcePdfPath: selectedSourcePdfPath,
        }));

      await api.orchestration.dispatchCommand({
        type: "thread.create",
        commandId: newCommandId(),
        threadId,
        projectId: project.id,
        title: buildManufacturingPlanThreadTitle(selectedSourcePdfPath),
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
          text: compiledPrompt.prompt,
          attachments: [],
        },
        modelSelection,
        titleSeed: buildManufacturingPlanThreadTitle(selectedSourcePdfPath),
        runtimeMode: "full-access",
        interactionMode: "default",
        createdAt,
      });

      completedManufacturingPlanThreadIdsRef.current.delete(threadId);
      setActiveManufacturingPlanGeneration({
        threadId,
        sourcePdfPath: selectedSourcePdfPath,
        sheathingJsonPath: compiledPrompt.sheathingJsonPath,
        manufacturingPlanPath: compiledPrompt.manufacturingPlanPath,
      });
      toastManager.add({
        type: "success",
        title: "Manufacturing-plan generation started",
        description: `${PROVIDER_DISPLAY_NAMES[modelSelection.provider]} is generating ${compiledPrompt.manufacturingPlanPath} from ${compiledPrompt.sheathingJsonPath}.`,
      });
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Could not start manufacturing-plan generation",
        description: error instanceof Error ? error.message : "An unexpected error occurred.",
      });
    } finally {
      setIsStartingManufacturingPlanGeneration(false);
    }
  }, [
    automationModelSelection,
    manufacturingPlanPath,
    manufacturingPromptQuery.data,
    project,
    selectedElevationOption?.classification,
    selectedSourcePdfPath,
    snapshot,
    wallPackageArtifacts,
    wallPackageJsonReady,
  ]);

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

      if (automationModelSelection) {
        draftStore.setModelSelection(draftThread.threadId, automationModelSelection);
      }
      draftStore.setPrompt(draftThread.threadId, agentPrompt);
      draftStore.setDraftThreadContext(draftThread.threadId, {
        runtimeMode: "approval-required",
        interactionMode: "default",
      });

      toastManager.add({
        type: "success",
        title: "Cut to Kit Agent prepared",
        description: `Opened a supervised ${automationProviderLabel} thread with the current project snapshot and A2MC manufacturing-plan guidance. Review the prompt and send when ready.`,
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
  }, [
    agentPrompt,
    automationModelSelection,
    automationProviderLabel,
    handleNewThread,
    project,
    snapshot,
  ]);

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
    if (!snapshot.settings) {
      toastManager.add({
        type: "error",
        title: "Cut2Kit settings are required",
        description:
          "Add a valid cut2kit.settings.json file to this project before starting framing generation.",
      });
      return;
    }

    const createdAt = new Date().toISOString();
    const threadId = newThreadId();
    const modelSelection =
      automationModelSelection ??
      resolveCut2KitAutomationModelSelection(snapshot, project.defaultModelSelection);

    setIsStartingFramingGeneration(true);
    try {
      const compiledPrompt =
        framingPromptQuery.data ??
        (await api.cut2kit.compileFramingPrompt({
          cwd: snapshot.cwd,
          sourcePdfPath: selectedSourcePdfPath,
        }));

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
          text: compiledPrompt.prompt,
          attachments: [],
        },
        modelSelection,
        titleSeed: buildFramingLayoutThreadTitle(selectedSourcePdfPath),
        runtimeMode: "full-access",
        interactionMode: "default",
        createdAt,
      });

      completedGenerationThreadIdsRef.current.delete(threadId);
      autoRenderedFramingJsonPathsRef.current.delete(framingArtifacts.jsonPath);
      setActiveFramingGeneration({
        threadId,
        sourcePdfPath: selectedSourcePdfPath,
        jsonPath: framingArtifacts.jsonPath,
        pdfPath: framingArtifacts.pdfPath,
      });
      toastManager.add({
        type: "success",
        title: "Framing layout generation started",
        description: `${PROVIDER_DISPLAY_NAMES[modelSelection.provider]} is generating ${framingArtifacts.jsonPath} from ${selectedSourcePdfPath}.`,
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
    framingPromptQuery.data,
    automationModelSelection,
    project,
    selectedElevationOption?.classification,
    selectedSourcePdfPath,
    snapshot,
  ]);

  const handleRenderSelectedFramingLayoutPdf = useCallback(async () => {
    if (!project || !framingArtifacts || !framingJsonReady) {
      toastManager.add({
        type: "error",
        title: "Framing layout JSON not found",
        description:
          "Generate or write the framing layout JSON first, then render the framing PDF from that artifact.",
      });
      return;
    }

    await renderFramingLayoutFromJson(framingArtifacts.jsonPath);
  }, [framingArtifacts, framingJsonReady, project, renderFramingLayoutFromJson]);

  const handleOpenFramingThread = useCallback(async () => {
    if (!activeFramingGeneration) return;
    await navigate({
      to: "/$threadId",
      params: { threadId: activeFramingGeneration.threadId },
    });
  }, [activeFramingGeneration, navigate]);

  const handleOpenWallPackageThread = useCallback(async () => {
    if (!activeWallPackageGeneration) return;
    await navigate({
      to: "/$threadId",
      params: { threadId: activeWallPackageGeneration.threadId },
    });
  }, [activeWallPackageGeneration, navigate]);

  const handleOpenManufacturingPlanThread = useCallback(async () => {
    if (!activeManufacturingPlanGeneration) return;
    await navigate({
      to: "/$threadId",
      params: { threadId: activeManufacturingPlanGeneration.threadId },
    });
  }, [activeManufacturingPlanGeneration, navigate]);

  const handleRenderSelectedWallPackagePdf = useCallback(async () => {
    if (!project || !wallPackageArtifacts || !wallPackageJsonReady) {
      toastManager.add({
        type: "error",
        title: "Sheathing layout JSON not found",
        description:
          "Generate or write the sheathing layout JSON first, then render the sheathing PDF from that artifact.",
      });
      return;
    }

    await renderWallPackageFromJson(wallPackageArtifacts.jsonPath);
  }, [project, renderWallPackageFromJson, wallPackageArtifacts, wallPackageJsonReady]);

  useEffect(() => {
    if (!project || !activeFramingGeneration || activeFramingPdfReady) {
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
  }, [activeFramingGeneration, activeFramingPdfReady, project, queryClient]);

  useEffect(() => {
    if (!project || !activeWallPackageGeneration || activeWallPackagePdfReady) {
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
  }, [activeWallPackageGeneration, activeWallPackagePdfReady, project, queryClient]);

  useEffect(() => {
    if (!project || !activeManufacturingPlanGeneration || activeManufacturingPlanReady) {
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
  }, [activeManufacturingPlanGeneration, activeManufacturingPlanReady, project, queryClient]);

  useEffect(() => {
    const nextJsonPath = framingArtifacts?.jsonPath ?? null;
    const previousJsonState = previousSelectedFramingJsonRef.current;
    const jsonJustBecameReady = didFramingJsonBecomeReady({
      previousJsonPath: previousJsonState.jsonPath,
      previousJsonReady: previousJsonState.jsonReady,
      nextJsonPath,
      nextJsonReady: framingJsonReady,
    });
    previousSelectedFramingJsonRef.current = {
      jsonPath: nextJsonPath,
      jsonReady: framingJsonReady,
    };

    if (
      !project ||
      !shouldAutoRenderFramingPdf({
        framingJsonPath: nextJsonPath,
        framingJsonReady,
        framingPdfReady,
        isRenderingFramingLayout,
        hasActiveFramingGeneration: activeFramingGeneration !== null,
        jsonJustBecameReady,
        hasAlreadyAttemptedAutoRender:
          nextJsonPath !== null && autoRenderedFramingJsonPathsRef.current.has(nextJsonPath),
      })
    ) {
      return;
    }

    if (nextJsonPath === null) {
      return;
    }

    autoRenderedFramingJsonPathsRef.current.add(nextJsonPath);
    void renderFramingLayoutFromJson(nextJsonPath, {
      auto: true,
    }).catch(() => {
      autoRenderedFramingJsonPathsRef.current.delete(nextJsonPath);
    });
  }, [
    activeFramingGeneration,
    framingArtifacts?.jsonPath,
    framingJsonReady,
    framingPdfReady,
    isRenderingFramingLayout,
    project,
    renderFramingLayoutFromJson,
  ]);

  useEffect(() => {
    const nextJsonPath = wallPackageArtifacts?.jsonPath ?? null;
    const previousJsonState = previousSelectedWallPackageJsonRef.current;
    const jsonJustBecameReady = didLayoutJsonBecomeReady({
      previousJsonPath: previousJsonState.jsonPath,
      previousJsonReady: previousJsonState.jsonReady,
      nextJsonPath,
      nextJsonReady: wallPackageJsonReady,
    });
    previousSelectedWallPackageJsonRef.current = {
      jsonPath: nextJsonPath,
      jsonReady: wallPackageJsonReady,
    };

    if (
      !project ||
      !shouldAutoRenderLayoutPdf({
        layoutJsonPath: nextJsonPath,
        layoutJsonReady: wallPackageJsonReady,
        layoutPdfReady: wallPackagePdfReady,
        isRenderingLayout: isRenderingWallPackage,
        hasActiveGeneration: activeWallPackageGeneration !== null,
        jsonJustBecameReady,
        hasAlreadyAttemptedAutoRender:
          nextJsonPath !== null && autoRenderedWallPackageJsonPathsRef.current.has(nextJsonPath),
      })
    ) {
      return;
    }

    if (nextJsonPath === null) {
      return;
    }

    autoRenderedWallPackageJsonPathsRef.current.add(nextJsonPath);
    void renderWallPackageFromJson(nextJsonPath, {
      auto: true,
    }).catch(() => {
      autoRenderedWallPackageJsonPathsRef.current.delete(nextJsonPath);
    });
  }, [
    activeWallPackageGeneration,
    isRenderingWallPackage,
    project,
    renderWallPackageFromJson,
    wallPackageArtifacts?.jsonPath,
    wallPackageJsonReady,
    wallPackagePdfReady,
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
          `${automationProviderLabel} finished without producing the framing layout JSON artifact.`,
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
        description: `${automationProviderLabel} finished the framing-layout thread without writing the expected JSON artifact.`,
      });
      setActiveFramingGeneration(null);
      return;
    }
    if (isRenderingFramingLayout || !activeFramingPdfReady) {
      return;
    }
    completedGenerationThreadIdsRef.current.add(activeFramingGeneration.threadId);
    setActiveFramingGeneration(null);
  }, [
    activeFramingGeneration,
    automationProviderLabel,
    framingGenerationThread?.session?.lastError,
    activeFramingJsonReady,
    activeFramingPdfReady,
    framingThreadStatus,
    isRenderingFramingLayout,
  ]);

  useEffect(() => {
    if (!activeWallPackageGeneration || !isTerminalGenerationStatus(wallPackageThreadStatus)) {
      return;
    }
    if (completedWallPackageThreadIdsRef.current.has(activeWallPackageGeneration.threadId)) {
      return;
    }
    if (!activeWallPackageJsonReady && wallPackageThreadStatus === "error") {
      completedWallPackageThreadIdsRef.current.add(activeWallPackageGeneration.threadId);
      toastManager.add({
        type: "error",
        title: "Sheathing generation failed",
        description:
          wallPackageGenerationThread?.session?.lastError ??
          `${automationProviderLabel} finished without producing the sheathing JSON artifact.`,
      });
      setActiveWallPackageGeneration(null);
      return;
    }
    if (
      !activeWallPackageJsonReady &&
      (wallPackageThreadStatus === "ready" ||
        wallPackageThreadStatus === "stopped" ||
        wallPackageThreadStatus === "interrupted")
    ) {
      completedWallPackageThreadIdsRef.current.add(activeWallPackageGeneration.threadId);
      toastManager.add({
        type: "error",
        title: "Sheathing JSON not found",
        description: `${automationProviderLabel} finished the sheathing thread without writing the expected JSON artifact.`,
      });
      setActiveWallPackageGeneration(null);
      return;
    }
    if (isRenderingWallPackage) {
      return;
    }
    if (!activeWallPackagePdfReady) {
      if (autoRenderedWallPackageJsonPathsRef.current.has(activeWallPackageGeneration.jsonPath)) {
        completedWallPackageThreadIdsRef.current.add(activeWallPackageGeneration.threadId);
        setActiveWallPackageGeneration(null);
      }
      return;
    }
    completedWallPackageThreadIdsRef.current.add(activeWallPackageGeneration.threadId);
    setActiveWallPackageGeneration(null);
  }, [
    activeWallPackageGeneration,
    activeWallPackageJsonReady,
    activeWallPackagePdfReady,
    automationProviderLabel,
    isRenderingWallPackage,
    wallPackageGenerationThread?.session?.lastError,
    wallPackageThreadStatus,
  ]);

  useEffect(() => {
    if (
      !activeManufacturingPlanGeneration ||
      !isTerminalGenerationStatus(manufacturingPlanThreadStatus)
    ) {
      return;
    }
    if (
      completedManufacturingPlanThreadIdsRef.current.has(activeManufacturingPlanGeneration.threadId)
    ) {
      return;
    }
    if (!activeManufacturingPlanReady && manufacturingPlanThreadStatus === "error") {
      completedManufacturingPlanThreadIdsRef.current.add(activeManufacturingPlanGeneration.threadId);
      toastManager.add({
        type: "error",
        title: "Manufacturing-plan generation failed",
        description:
          manufacturingPlanGenerationThread?.session?.lastError ??
          `${automationProviderLabel} finished without writing selected-source jobs into the manufacturing plan.`,
      });
      setActiveManufacturingPlanGeneration(null);
      return;
    }
    if (
      !activeManufacturingPlanReady &&
      (manufacturingPlanThreadStatus === "ready" ||
        manufacturingPlanThreadStatus === "stopped" ||
        manufacturingPlanThreadStatus === "interrupted")
    ) {
      completedManufacturingPlanThreadIdsRef.current.add(activeManufacturingPlanGeneration.threadId);
      toastManager.add({
        type: "error",
        title: "Manufacturing-plan jobs not found",
        description: `${automationProviderLabel} finished the manufacturing-plan thread without producing jobs for ${activeManufacturingPlanGeneration.sourcePdfPath}.`,
      });
      setActiveManufacturingPlanGeneration(null);
      return;
    }
    completedManufacturingPlanThreadIdsRef.current.add(activeManufacturingPlanGeneration.threadId);
    toastManager.add({
      type: "success",
      title: "Manufacturing plan ready",
      description: `${activeManufacturingPlanGeneration.manufacturingPlanPath} now includes jobs for ${activeManufacturingPlanGeneration.sourcePdfPath}.`,
    });
    setActiveManufacturingPlanGeneration(null);
  }, [
    activeManufacturingPlanGeneration,
    activeManufacturingPlanReady,
    automationProviderLabel,
    manufacturingPlanGenerationThread?.session?.lastError,
    manufacturingPlanThreadStatus,
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
      <div className="flex flex-1 items-center justify-center px-6">
        <div className="max-w-2xl text-center text-sm text-muted-foreground">
          <p>Could not load the Cut2Kit project snapshot.</p>
          {snapshotErrorMessage ? <p className="mt-2">{snapshotErrorMessage}</p> : null}
        </div>
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
            <Button onClick={() => setIsSettingsEditorOpen(true)}>
              {snapshot.settingsFilePath ? "Edit Settings" : "Create Settings File"}
            </Button>
            <Button variant="outline" onClick={() => void handleOpenInEditor()}>
              <FolderIcon className="size-4" />
              Open Folder
            </Button>
            <Button
              onClick={() => void handleGenerateWallPackage()}
              disabled={
                isStartingWallPackageGeneration ||
                !selectedSourcePdfPath ||
                selectedElevationOption?.classification !== "elevation" ||
                !framingJsonReady
              }
            >
              <HammerIcon className="size-4" />
              {isStartingWallPackageGeneration
                ? "Starting Sheathing Run..."
                : "Generate Sheathing Layout"}
            </Button>
            <Button
              onClick={() => void handleGenerateManufacturingPlan()}
              disabled={
                isStartingManufacturingPlanGeneration ||
                !selectedSourcePdfPath ||
                selectedElevationOption?.classification !== "elevation" ||
                !wallPackageJsonReady
              }
            >
              <HammerIcon className="size-4" />
              {isStartingManufacturingPlanGeneration
                ? "Starting Manufacturing Run..."
                : "Generate Manufacturing Plan"}
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
              disabled={isGenerating || snapshot.summary.errorCount > 0 || snapshot.ncJobs.length === 0}
            >
              <HammerIcon className="size-4" />
              {isGenerating ? "Posting NC..." : "Generate NC Files"}
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex h-full w-full max-w-[1600px] min-h-0 flex-col gap-6 px-6 py-6 xl:flex-row">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto xl:pr-2">
          <div className="flex min-h-[720px] shrink-0">
            <ProjectPdfWorkspace
              project={snapshot}
              selectedSourcePdfPath={selectedSourcePdfPath}
              onSelectedSourcePdfPathChange={setSelectedSourcePdfPath}
              onRenderFramingLayoutPdf={() => void handleRenderSelectedFramingLayoutPdf()}
              canRenderFramingLayoutPdf={canRenderSelectedFramingLayoutPdf}
              isRenderingFramingLayoutPdf={isRenderingFramingLayout}
            />
          </div>

          <div className="flex min-h-[720px] shrink-0">
            <SheathingPdfWorkspace
              project={snapshot}
              selectedSourcePdfPath={selectedSourcePdfPath}
              onRenderSheathingLayoutPdf={() => void handleRenderSelectedWallPackagePdf()}
              canRenderSheathingLayoutPdf={canRenderSelectedWallPackagePdf}
              isRenderingSheathingLayoutPdf={isRenderingWallPackage}
            />
          </div>

          <Card className="flex min-h-[420px] shrink-0 flex-col overflow-hidden">
            <CardHeader className="border-b border-border/70">
              <CardTitle>AI-First Wall Automation</CardTitle>
              <CardDescription>
                Framing and sheathing run through {automationRuntimeLabel} as separate AI-first
                threads. Framing establishes support and wall dimensions for the sheathing layout,
                then the sheathing layout feeds an explicit manufacturing-plan thread that writes
                `cut2kit.manufacturing.json`. Only that manufacturing plan is posted into `.nc`
                output.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid min-h-0 flex-1 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_260px]">
              <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border/70 bg-background/60">
                <div className="border-b border-border/70 px-3 py-2 text-xs font-medium text-muted-foreground">
                  Prompt preview
                </div>
                <ScrollArea className="min-h-0 flex-1">
                  <pre className="whitespace-pre-wrap px-3 py-3 text-xs leading-5 text-foreground">
                    {!hasWallWorkflowSettings
                      ? "Add cut2kit.settings.json to this project before compiling the framing-layout prompt."
                      : !selectedSourcePdfPath
                        ? "Select an elevation PDF to compile the framing-layout prompt."
                        : framingPromptQuery.isLoading
                          ? "Compiling the framing-layout prompt on the server..."
                          : framingPromptQuery.isError
                            ? framingPromptQuery.error instanceof Error
                              ? framingPromptQuery.error.message
                              : "Could not compile the framing-layout prompt."
                            : framingPrompt}
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
                      ? `${automationProviderLabel} thread ${activeFramingGeneration.threadId} is handling the current framing-layout run.`
                      : `Starting a framing run creates a dedicated full-access ${automationProviderLabel} thread for the selected elevation PDF.`}
                  </p>
                </div>

                <div className="rounded-xl border border-border/70 bg-background/60 p-3">
                  <p className="text-xs font-medium text-muted-foreground">
                    Manufacturing-plan artifacts
                  </p>
                  <p className="mt-2 break-all text-sm text-foreground">
                    {manufacturingPlanPath ?? "Pending project snapshot"}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    The explicit manufacturing plan is project-wide, but jobs are tracked per
                    selected elevation PDF.
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Badge variant={manufacturingPlanFileReady ? "success" : "outline"}>
                      {manufacturingPlanFileReady ? "Plan file ready" : "Plan file pending"}
                    </Badge>
                    <Badge
                      variant={manufacturingPlanReadyForSelectedSource ? "success" : "outline"}
                    >
                      {manufacturingPlanReadyForSelectedSource
                        ? `${selectedManufacturingJobCount} selected-source job${selectedManufacturingJobCount === 1 ? "" : "s"}`
                        : "No selected-source jobs"}
                    </Badge>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <Button
                    onClick={() => void handleGenerateWallPackage()}
                    disabled={
                      isStartingWallPackageGeneration ||
                      !hasWallWorkflowSettings ||
                      !selectedSourcePdfPath ||
                      selectedElevationOption?.classification !== "elevation" ||
                      !framingJsonReady
                    }
                  >
                    <HammerIcon className="size-4" />
                    {isStartingWallPackageGeneration
                      ? "Starting Sheathing Run..."
                      : "Generate Sheathing Layout"}
                  </Button>
                  <Button
                    onClick={() => void handleGenerateManufacturingPlan()}
                    disabled={
                      isStartingManufacturingPlanGeneration ||
                      !hasWallWorkflowSettings ||
                      !selectedSourcePdfPath ||
                      selectedElevationOption?.classification !== "elevation" ||
                      !wallPackageJsonReady
                    }
                  >
                    <HammerIcon className="size-4" />
                    {isStartingManufacturingPlanGeneration
                      ? "Starting Manufacturing Run..."
                      : "Generate Manufacturing Plan"}
                  </Button>
                  <Button
                    onClick={() => void handleGenerateFramingLayout()}
                    disabled={
                      isStartingFramingGeneration ||
                      !hasWallWorkflowSettings ||
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
                    onClick={() => void handleOpenWallPackageThread()}
                    disabled={!activeWallPackageGeneration}
                  >
                    <BotIcon className="size-4" />
                    Open Sheathing Thread
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => void handleOpenManufacturingPlanThread()}
                    disabled={!activeManufacturingPlanGeneration}
                  >
                    <BotIcon className="size-4" />
                    Open Manufacturing Thread
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
                    disabled={
                      isGenerating || snapshot.summary.errorCount > 0 || snapshot.ncJobs.length === 0
                    }
                  >
                    <HammerIcon className="size-4" />
                    {isGenerating ? "Posting NC..." : "Generate NC Files"}
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
                    Selected elevation, expected artifact paths, and the current AI-run status for
                    the framing-layout workflow.
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
                  <CardTitle>Sheathing Layout Status</CardTitle>
                  <CardDescription>
                    Framing input, expected sheathing output paths, and the current AI-run status
                    for the sheathing workflow.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="rounded-xl border border-border/70 bg-background/60 p-3">
                    <p className="text-xs font-medium text-muted-foreground">Framing JSON input</p>
                    <p className="mt-1 break-all text-sm text-foreground">
                      {framingArtifacts?.jsonPath ?? "Pending source selection"}
                    </p>
                    <div className="mt-2">
                      <Badge variant={framingJsonReady ? "success" : "outline"}>
                        {framingJsonReady ? "ready" : "missing"}
                      </Badge>
                    </div>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-background/60 p-3">
                    <p className="text-xs font-medium text-muted-foreground">Structured JSON</p>
                    <p className="mt-1 break-all text-sm text-foreground">
                      {wallPackageArtifacts?.jsonPath ?? "Pending source selection"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-background/60 p-3">
                    <p className="text-xs font-medium text-muted-foreground">Rendered PDF</p>
                    <p className="mt-1 break-all text-sm text-foreground">
                      {wallPackageArtifacts?.pdfPath ?? "Pending source selection"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={wallPackageJsonReady ? "success" : "outline"}>
                      {wallPackageJsonReady ? "JSON ready" : "JSON pending"}
                    </Badge>
                    <Badge variant={wallPackagePdfReady ? "success" : "outline"}>
                      {wallPackagePdfReady
                        ? "PDF ready"
                        : isRenderingWallPackage
                          ? "Rendering PDF"
                          : "PDF pending"}
                    </Badge>
                    {wallPackageThreadStatus ? (
                      <Badge variant="outline">{wallPackageThreadStatus}</Badge>
                    ) : null}
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (wallPackageArtifacts?.jsonPath) {
                        void renderWallPackageFromJson(wallPackageArtifacts.jsonPath);
                      }
                    }}
                    disabled={!canRenderSelectedWallPackagePdf}
                  >
                    {isRenderingWallPackage
                      ? "Rendering Sheathing PDF..."
                      : wallPackagePdfReady
                        ? "Regenerate Sheathing PDF"
                        : "Render Sheathing PDF"}
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Manufacturing Plan Status</CardTitle>
                  <CardDescription>
                    Sheathing input, expected `cut2kit.manufacturing.json` output, and the current
                    AI-run status for A2MC manufacturing-plan generation.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="rounded-xl border border-border/70 bg-background/60 p-3">
                    <p className="text-xs font-medium text-muted-foreground">Sheathing JSON input</p>
                    <p className="mt-1 break-all text-sm text-foreground">
                      {wallPackageArtifacts?.jsonPath ?? "Pending source selection"}
                    </p>
                    <div className="mt-2">
                      <Badge variant={wallPackageJsonReady ? "success" : "outline"}>
                        {wallPackageJsonReady ? "ready" : "missing"}
                      </Badge>
                    </div>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-background/60 p-3">
                    <p className="text-xs font-medium text-muted-foreground">
                      Manufacturing plan JSON
                    </p>
                    <p className="mt-1 break-all text-sm text-foreground">
                      {manufacturingPlanPath ?? "Pending project snapshot"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={manufacturingPlanFileReady ? "success" : "outline"}>
                      {manufacturingPlanFileReady ? "Plan file ready" : "Plan file pending"}
                    </Badge>
                    <Badge variant={manufacturingPlanReadyForSelectedSource ? "success" : "outline"}>
                      {manufacturingPlanReadyForSelectedSource
                        ? `${selectedManufacturingJobCount} selected-source job${selectedManufacturingJobCount === 1 ? "" : "s"}`
                        : "No selected-source jobs"}
                    </Badge>
                    {manufacturingPlanThreadStatus ? (
                      <Badge variant="outline">{manufacturingPlanThreadStatus}</Badge>
                    ) : null}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Stud framing informs sheathing placement, but NC output is generated only from
                    the sheathing-derived manufacturing plan.
                  </p>
                  <div className="flex flex-col gap-2">
                    <Button
                      onClick={() => void handleGenerateManufacturingPlan()}
                      disabled={
                        isStartingManufacturingPlanGeneration ||
                        !hasWallWorkflowSettings ||
                        !selectedSourcePdfPath ||
                        selectedElevationOption?.classification !== "elevation" ||
                        !wallPackageJsonReady
                      }
                    >
                      {isStartingManufacturingPlanGeneration
                        ? "Starting Manufacturing Run..."
                        : "Generate Manufacturing Plan"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => void handleOpenManufacturingPlanThread()}
                      disabled={!activeManufacturingPlanGeneration}
                    >
                      Open Manufacturing Thread
                    </Button>
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
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-background/60 p-3">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">
                        {snapshot.settingsFilePath
                          ? "Edit the active Cut2Kit settings file."
                          : "This project does not have a settings file yet."}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {snapshot.settingsFilePath
                          ? "Open the large settings editor to update the wall-workflow configuration and save it back to disk."
                          : "Create cut2kit.settings.json from typed defaults, review the wall-workflow settings, and save it into the project workspace."}
                      </p>
                    </div>
                    <Button onClick={() => setIsSettingsEditorOpen(true)}>
                      {snapshot.settingsFilePath ? "Edit Settings" : "Create Settings File"}
                    </Button>
                  </div>
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
                    Deterministic manifests and A2MC `.nc` files derived only from the explicit
                    manufacturing plan.
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
                        : "Run Generate NC Files to write manifests and controller-safe NC files from cut2kit.manufacturing.json."}
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

      <Cut2KitSettingsEditorDialog
        open={isSettingsEditorOpen}
        projectId={project.id}
        snapshot={snapshot}
        onOpenChange={setIsSettingsEditorOpen}
      />
    </div>
  );
}
