import type { Cut2KitProject, ProjectId } from "@t3tools/contracts";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { decodeProjectFileBytes } from "~/lib/projectFileContents";

import { usePdfDocument } from "../hooks/usePdfDocument";
import {
  buildProjectPdfOptions,
  fallbackProjectPdfFileName,
  findProjectPdfOption,
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
  pdfCount: number;
  selectedPdfPath: string | null;
  isFileLoading: boolean;
  fileErrorMessage: string | null;
  pdfObjectUrl: string | null;
}): PdfWorkspacePresentation {
  if (input.pdfCount === 0) {
    return {
      kind: "empty",
      title: "No source PDFs detected",
      description: "Add dimensioned PDF drawings to the active project to review them here.",
    };
  }

  if (!input.selectedPdfPath) {
    return {
      kind: "empty",
      title: "Choose a source PDF",
      description: "Select one of the active project PDFs to load it into the review workspace.",
    };
  }

  if (input.fileErrorMessage) {
    return {
      kind: "error",
      title: "Could not load PDF",
      description: input.fileErrorMessage,
    };
  }

  if (input.isFileLoading || input.pdfObjectUrl === null) {
    return {
      kind: "loading",
      title: "Loading PDF",
      description: `Decoding ${input.selectedPdfPath} for inline review.`,
    };
  }

  return { kind: "ready" };
}

export function ProjectPdfWorkspace({
  project,
}: {
  project: Cut2KitProject;
  projectId: ProjectId;
}) {
  const options = useMemo(() => buildProjectPdfOptions(project), [project]);
  const [selectedPdfPath, setSelectedPdfPath] = useState<string | null>(() =>
    resolveSelectedProjectPdf(options, null),
  );

  useEffect(() => {
    setSelectedPdfPath((currentPath) => resolveSelectedProjectPdf(options, currentPath));
  }, [options]);

  const selectedOption = useMemo(
    () => findProjectPdfOption(options, selectedPdfPath),
    [options, selectedPdfPath],
  );
  const documentQuery = usePdfDocument({
    cwd: project.cwd,
    relativePath: selectedPdfPath,
  });

  const fileErrorMessage = documentQuery.isError
    ? documentQuery.error instanceof Error
      ? documentQuery.error.message
      : "The selected PDF could not be read from the active project."
    : null;

  const [pdfObjectUrl, setPdfObjectUrl] = useState<string | null>(null);
  useEffect(() => {
    setPdfObjectUrl(null);
  }, [selectedPdfPath]);

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
    pdfCount: options.length,
    selectedPdfPath,
    isFileLoading: documentQuery.isLoading || documentQuery.isFetching,
    fileErrorMessage,
    pdfObjectUrl,
  });

  const subtitle = selectedOption?.relativePath ?? selectedPdfPath ?? "Choose a project PDF";
  const fileSize = formatFileSize(documentQuery.data?.sizeBytes ?? null);

  return (
    <Card className="flex min-h-0 flex-1 overflow-hidden">
      <CardHeader className="border-b border-border/70">
        <CardTitle>Source PDF Workspace</CardTitle>
        <CardDescription>
          Review the dimensioned project PDFs directly in the app and use them as the source
          selection surface for Cut2Kit.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <BasePdfSelector
              options={options}
              selectedPath={selectedPdfPath}
              onChange={setSelectedPdfPath}
            />
            {selectedOption?.classification ? (
              <Badge variant="secondary">{selectedOption.classification}</Badge>
            ) : null}
            {selectedOption?.application ? (
              <Badge variant="outline">{selectedOption.application}</Badge>
            ) : null}
            {selectedOption?.side ? <Badge variant="outline">{selectedOption.side}</Badge> : null}
          </div>
          <Badge variant="outline">{options.length} source PDFs</Badge>
        </div>

        <div className="relative min-h-0 flex-1 bg-[linear-gradient(180deg,#f4efe3,#efe7d6)]">
          {pdfObjectUrl ? (
            <iframe
              className="h-full w-full border-0"
              src={`${pdfObjectUrl}#view=FitH`}
              title={selectedPdfPath ?? "Source PDF"}
            />
          ) : null}
          <PdfWorkspaceState presentation={presentation} />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 px-4 py-3 text-muted-foreground text-xs">
          <div className="min-w-0 truncate">{subtitle}</div>
          <div className="flex flex-wrap items-center gap-2">
            {documentQuery.data?.modifiedAt ? (
              <Badge variant="outline">
                Updated {new Date(documentQuery.data.modifiedAt).toLocaleString()}
              </Badge>
            ) : null}
            {fileSize ? <Badge variant="outline">{fileSize}</Badge> : null}
            {selectedPdfPath && !selectedOption ? (
              <Badge variant="outline">{fallbackProjectPdfFileName(selectedPdfPath)}</Badge>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
