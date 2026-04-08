import type { Cut2KitProject } from "@t3tools/contracts";
import {
  buildFramingLayoutArtifactPaths,
  buildSheathingLayoutArtifactPaths,
} from "@t3tools/shared/cut2kit";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { decodeProjectFileBytes } from "~/lib/projectFileContents";

import { usePdfDocument } from "../hooks/usePdfDocument";
import {
  buildProjectPdfOptions,
  fallbackProjectPdfFileName,
  findProjectPdfOption,
  isFramingWorkspacePdfOption,
  resolveSelectedProjectPdf,
} from "../lib/projectPdfFiles";
import { BasePdfSelector } from "./BasePdfSelector";
import { type PdfWorkspacePresentation, PdfWorkspaceState } from "./PdfWorkspaceState";

function createPdfObjectUrl(base64Contents: string): string {
  const bytes = decodeProjectFileBytes({ contents: base64Contents });
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return URL.createObjectURL(
    new Blob([buffer], {
      type: "application/pdf",
    }),
  );
}

function formatFileSize(sizeBytes: number | null): string | null {
  if (typeof sizeBytes !== "number") {
    return null;
  }
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }
  return `${(sizeBytes / 1024).toFixed(1)} KB`;
}

function getPresentation(input: {
  relativePath: string | null;
  isFileLoading: boolean;
  fileErrorMessage: string | null;
  pdfObjectUrl: string | null;
  emptyTitle: string;
  emptyDescription: string;
  loadingTitle: string;
  loadingDescription: string;
  errorTitle: string;
}) {
  if (!input.relativePath) {
    return {
      kind: "empty",
      title: input.emptyTitle,
      description: input.emptyDescription,
    } satisfies PdfWorkspacePresentation;
  }

  if (input.fileErrorMessage) {
    return {
      kind: "error",
      title: input.errorTitle,
      description: input.fileErrorMessage,
    } satisfies PdfWorkspacePresentation;
  }

  if (input.isFileLoading || input.pdfObjectUrl === null) {
    return {
      kind: "loading",
      title: input.loadingTitle,
      description: input.loadingDescription,
    } satisfies PdfWorkspacePresentation;
  }

  return { kind: "ready" } satisfies PdfWorkspacePresentation;
}

function PdfPreviewPane({
  cwd,
  title,
  subtitle,
  relativePath,
  emptyTitle,
  emptyDescription,
  loadingTitle,
  loadingDescription,
  errorTitle,
  badges,
}: {
  cwd: string;
  title: string;
  subtitle: string;
  relativePath: string | null;
  emptyTitle: string;
  emptyDescription: string;
  loadingTitle: string;
  loadingDescription: string;
  errorTitle: string;
  badges?: ReactNode;
}) {
  const documentQuery = usePdfDocument({
    cwd,
    relativePath,
  });

  const fileErrorMessage = documentQuery.isError
    ? documentQuery.error instanceof Error
      ? documentQuery.error.message
      : "The selected PDF could not be read from the active project."
    : null;

  const [pdfObjectUrl, setPdfObjectUrl] = useState<string | null>(null);
  useEffect(() => {
    setPdfObjectUrl(null);
  }, [relativePath]);

  useEffect(() => {
    if (!documentQuery.data) {
      setPdfObjectUrl(null);
      return;
    }

    const nextUrl = createPdfObjectUrl(documentQuery.data.contents);
    setPdfObjectUrl(nextUrl);
    return () => {
      URL.revokeObjectURL(nextUrl);
    };
  }, [documentQuery.data]);

  const presentation = getPresentation({
    relativePath,
    isFileLoading: documentQuery.isLoading || documentQuery.isFetching,
    fileErrorMessage,
    pdfObjectUrl,
    emptyTitle,
    emptyDescription,
    loadingTitle,
    loadingDescription,
    errorTitle,
  });

  const fileSize = formatFileSize(documentQuery.data?.sizeBytes ?? null);

  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border/70 bg-background/60">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">{badges}</div>
      </div>

      <div className="relative min-h-0 flex-1 bg-[linear-gradient(180deg,#f4efe3,#efe7d6)]">
        {pdfObjectUrl ? (
          <iframe
            className="h-full w-full border-0"
            src={`${pdfObjectUrl}#view=FitH`}
            title={relativePath ?? title}
          />
        ) : null}
        <PdfWorkspaceState presentation={presentation} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 px-4 py-3 text-xs text-muted-foreground">
        <div className="min-w-0 truncate">{subtitle}</div>
        <div className="flex flex-wrap items-center gap-2">
          {documentQuery.data?.modifiedAt ? (
            <Badge variant="outline">
              Updated {new Date(documentQuery.data.modifiedAt).toLocaleString()}
            </Badge>
          ) : null}
          {fileSize ? <Badge variant="outline">{fileSize}</Badge> : null}
          {relativePath ? (
            <Badge variant="outline">{fallbackProjectPdfFileName(relativePath)}</Badge>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function ProjectPdfWorkspace({
  project,
  selectedSourcePdfPath,
  onSelectedSourcePdfPathChange,
  onRenderFramingLayoutPdf,
  canRenderFramingLayoutPdf,
  isRenderingFramingLayoutPdf,
}: {
  project: Cut2KitProject;
  selectedSourcePdfPath: string | null;
  onSelectedSourcePdfPathChange: (nextPath: string | null) => void;
  onRenderFramingLayoutPdf?: () => void;
  canRenderFramingLayoutPdf?: boolean;
  isRenderingFramingLayoutPdf?: boolean;
}) {
  const options = useMemo(
    () => buildProjectPdfOptions(project).filter(isFramingWorkspacePdfOption),
    [project],
  );

  useEffect(() => {
    const nextPath = resolveSelectedProjectPdf(options, selectedSourcePdfPath);
    if (nextPath !== selectedSourcePdfPath) {
      onSelectedSourcePdfPathChange(nextPath);
    }
  }, [onSelectedSourcePdfPathChange, options, selectedSourcePdfPath]);

  const selectedOption = useMemo(
    () => findProjectPdfOption(options, selectedSourcePdfPath),
    [options, selectedSourcePdfPath],
  );
  const artifactPaths = useMemo(
    () =>
      selectedSourcePdfPath
        ? buildFramingLayoutArtifactPaths(project, selectedSourcePdfPath)
        : null,
    [project, selectedSourcePdfPath],
  );
  const generatedLayoutPdfPath =
    artifactPaths &&
    project.files.some(
      (file) =>
        file.kind === "file" &&
        file.relativePath === artifactPaths.pdfPath &&
        file.classification === "pdf",
    )
      ? artifactPaths.pdfPath
      : null;
  const generatedLayoutJsonPath =
    artifactPaths &&
    project.files.some(
      (file) =>
        file.kind === "file" &&
        file.relativePath === artifactPaths.jsonPath &&
        file.classification === "json",
    )
      ? artifactPaths.jsonPath
      : null;

  return (
    <Card className="flex min-h-0 flex-1 overflow-hidden">
      <CardHeader className="border-b border-border/70">
        <CardTitle>Elevation to Framing Workspace</CardTitle>
        <CardDescription>
          Select the wall elevation PDF on the left and review the generated framing-layout PDF on
          the right once Cut2Kit has rendered it from the AI-authored framing JSON.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <BasePdfSelector
              options={options}
              selectedPath={selectedSourcePdfPath}
              onChange={onSelectedSourcePdfPathChange}
            />
            {selectedOption?.classification ? (
              <Badge variant="secondary">{selectedOption.classification}</Badge>
            ) : null}
            {selectedOption?.application ? (
              <Badge variant="outline">{selectedOption.application}</Badge>
            ) : null}
            {selectedOption?.side ? <Badge variant="outline">{selectedOption.side}</Badge> : null}
          </div>
          <Badge variant="outline">{options.length} elevation PDFs</Badge>
        </div>

        <div className="grid min-h-0 flex-1 gap-4 p-4 xl:grid-cols-2">
          <PdfPreviewPane
            cwd={project.cwd}
            title="Elevation PDF"
            subtitle={selectedOption?.relativePath ?? "Choose an elevation PDF"}
            relativePath={selectedSourcePdfPath}
            emptyTitle="Choose an elevation PDF"
            emptyDescription="Select the source wall elevation for the framing-layout run."
            loadingTitle="Loading elevation PDF"
            loadingDescription={
              selectedSourcePdfPath
                ? `Decoding ${selectedSourcePdfPath} for inline review.`
                : "Select an elevation PDF to inspect it here."
            }
            errorTitle="Could not load elevation PDF"
            badges={
              selectedOption ? (
                <>
                  <Badge variant="secondary">source</Badge>
                  {selectedOption.side ? (
                    <Badge variant="outline">{selectedOption.side}</Badge>
                  ) : null}
                </>
              ) : null
            }
          />

          <PdfPreviewPane
            cwd={project.cwd}
            title="Framing Layout PDF"
            subtitle={
              generatedLayoutPdfPath ??
              artifactPaths?.pdfPath ??
              "Generate a framing layout to populate this pane."
            }
            relativePath={generatedLayoutPdfPath}
            emptyTitle="No framing layout PDF yet"
            emptyDescription={
              artifactPaths
                ? generatedLayoutJsonPath
                  ? `Framing-layout JSON is ready. Render the PDF to write ${artifactPaths.pdfPath}.`
                  : `When rendered, Cut2Kit writes the framing-layout PDF to ${artifactPaths.pdfPath}.`
                : "Select an elevation PDF first to determine the framing-layout output path."
            }
            loadingTitle="Loading framing-layout PDF"
            loadingDescription={
              generatedLayoutPdfPath
                ? `Decoding ${generatedLayoutPdfPath} for inline review.`
                : "Waiting for a generated framing-layout PDF."
            }
            errorTitle="Could not load framing-layout PDF"
            badges={
              <>
                {generatedLayoutJsonPath ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onRenderFramingLayoutPdf?.()}
                    disabled={!canRenderFramingLayoutPdf}
                  >
                    {isRenderingFramingLayoutPdf
                      ? "Rendering PDF..."
                      : generatedLayoutPdfPath
                        ? "Regenerate PDF"
                        : "Generate PDF"}
                  </Button>
                ) : null}
                <Badge variant={generatedLayoutPdfPath ? "success" : "outline"}>
                  {generatedLayoutPdfPath ? "rendered" : "pending"}
                </Badge>
                {generatedLayoutJsonPath ? <Badge variant="outline">json ready</Badge> : null}
              </>
            }
          />
        </div>
      </CardContent>
    </Card>
  );
}

export function SheathingPdfWorkspace({
  project,
  selectedSourcePdfPath,
  onRenderSheathingLayoutPdf,
  canRenderSheathingLayoutPdf,
  isRenderingSheathingLayoutPdf,
}: {
  project: Cut2KitProject;
  selectedSourcePdfPath: string | null;
  onRenderSheathingLayoutPdf?: () => void;
  canRenderSheathingLayoutPdf?: boolean;
  isRenderingSheathingLayoutPdf?: boolean;
}) {
  const options = useMemo(
    () => buildProjectPdfOptions(project).filter(isFramingWorkspacePdfOption),
    [project],
  );

  const selectedOption = useMemo(
    () => findProjectPdfOption(options, selectedSourcePdfPath),
    [options, selectedSourcePdfPath],
  );
  const framingArtifacts = useMemo(
    () =>
      selectedSourcePdfPath
        ? buildFramingLayoutArtifactPaths(project, selectedSourcePdfPath)
        : null,
    [project, selectedSourcePdfPath],
  );
  const sheathingArtifacts = useMemo(
    () =>
      selectedSourcePdfPath
        ? buildSheathingLayoutArtifactPaths(project, selectedSourcePdfPath)
        : null,
    [project, selectedSourcePdfPath],
  );
  const framingLayoutPdfPath =
    framingArtifacts &&
    project.files.some(
      (file) =>
        file.kind === "file" &&
        file.relativePath === framingArtifacts.pdfPath &&
        file.classification === "pdf",
    )
      ? framingArtifacts.pdfPath
      : null;
  const framingLayoutJsonPath =
    framingArtifacts &&
    project.files.some(
      (file) =>
        file.kind === "file" &&
        file.relativePath === framingArtifacts.jsonPath &&
        file.classification === "json",
    )
      ? framingArtifacts.jsonPath
      : null;
  const sheathingLayoutPdfPath =
    sheathingArtifacts &&
    project.files.some(
      (file) =>
        file.kind === "file" &&
        file.relativePath === sheathingArtifacts.pdfPath &&
        file.classification === "pdf",
    )
      ? sheathingArtifacts.pdfPath
      : null;
  const sheathingLayoutJsonPath =
    sheathingArtifacts &&
    project.files.some(
      (file) =>
        file.kind === "file" &&
        file.relativePath === sheathingArtifacts.jsonPath &&
        file.classification === "json",
    )
      ? sheathingArtifacts.jsonPath
      : null;

  return (
    <Card className="flex min-h-0 flex-1 overflow-hidden">
      <CardHeader className="border-b border-border/70">
        <CardTitle>Framing to Sheathing Workspace</CardTitle>
        <CardDescription>
          Review the generated framing-layout PDF on the left and render or inspect the
          sheathing-layout PDF on the right once Cut2Kit has a sheathing-layout JSON artifact.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <Badge variant={selectedOption ? "secondary" : "outline"}>
              {selectedOption?.relativePath ?? "No elevation selected"}
            </Badge>
            {selectedOption?.side ? <Badge variant="outline">{selectedOption.side}</Badge> : null}
            <Badge variant={framingLayoutJsonPath ? "success" : "outline"}>
              {framingLayoutJsonPath ? "framing json ready" : "framing json pending"}
            </Badge>
            <Badge variant={sheathingLayoutJsonPath ? "success" : "outline"}>
              {sheathingLayoutJsonPath ? "sheathing json ready" : "sheathing json pending"}
            </Badge>
          </div>
          <Badge variant="outline">shared elevation context</Badge>
        </div>

        <div className="grid min-h-0 flex-1 gap-4 p-4 xl:grid-cols-2">
          <PdfPreviewPane
            cwd={project.cwd}
            title="Framing Layout PDF"
            subtitle={
              framingLayoutPdfPath ??
              framingArtifacts?.pdfPath ??
              "Generate a framing layout to populate this pane."
            }
            relativePath={framingLayoutPdfPath}
            emptyTitle="No framing layout PDF yet"
            emptyDescription={
              framingArtifacts
                ? framingLayoutJsonPath
                  ? `Framing-layout JSON is ready. Render the framing PDF above to write ${framingArtifacts.pdfPath}.`
                  : `Generate the framing layout first so Cut2Kit can write ${framingArtifacts.pdfPath}.`
                : "Select an elevation PDF in the workspace above to determine the framing-layout output path."
            }
            loadingTitle="Loading framing-layout PDF"
            loadingDescription={
              framingLayoutPdfPath
                ? `Decoding ${framingLayoutPdfPath} for inline review.`
                : "Waiting for a generated framing-layout PDF."
            }
            errorTitle="Could not load framing-layout PDF"
            badges={
              <>
                <Badge variant={framingLayoutPdfPath ? "success" : "outline"}>
                  {framingLayoutPdfPath ? "rendered" : "pending"}
                </Badge>
                {framingLayoutJsonPath ? <Badge variant="outline">json ready</Badge> : null}
              </>
            }
          />

          <PdfPreviewPane
            cwd={project.cwd}
            title="Sheathing Layout PDF"
            subtitle={
              sheathingLayoutPdfPath ??
              sheathingArtifacts?.pdfPath ??
              "Generate a wall package to populate this pane."
            }
            relativePath={sheathingLayoutPdfPath}
            emptyTitle="No sheathing layout PDF yet"
            emptyDescription={
              sheathingArtifacts
                ? sheathingLayoutJsonPath
                  ? `Sheathing-layout JSON is ready. Render the PDF to write ${sheathingArtifacts.pdfPath}.`
                  : `When rendered, Cut2Kit writes the sheathing-layout PDF to ${sheathingArtifacts.pdfPath}.`
                : "Select an elevation PDF in the workspace above to determine the sheathing-layout output path."
            }
            loadingTitle="Loading sheathing-layout PDF"
            loadingDescription={
              sheathingLayoutPdfPath
                ? `Decoding ${sheathingLayoutPdfPath} for inline review.`
                : "Waiting for a generated sheathing-layout PDF."
            }
            errorTitle="Could not load sheathing-layout PDF"
            badges={
              <>
                {sheathingLayoutJsonPath ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onRenderSheathingLayoutPdf?.()}
                    disabled={!canRenderSheathingLayoutPdf}
                  >
                    {isRenderingSheathingLayoutPdf
                      ? "Rendering PDF..."
                      : sheathingLayoutPdfPath
                        ? "Regenerate PDF"
                        : "Generate PDF"}
                  </Button>
                ) : null}
                <Badge variant={sheathingLayoutPdfPath ? "success" : "outline"}>
                  {sheathingLayoutPdfPath ? "rendered" : "pending"}
                </Badge>
                {sheathingLayoutJsonPath ? <Badge variant="outline">json ready</Badge> : null}
              </>
            }
          />
        </div>
      </CardContent>
    </Card>
  );
}
