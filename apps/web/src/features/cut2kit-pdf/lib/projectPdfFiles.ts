import type { Cut2KitProject } from "@t3tools/contracts";

type ProjectPdfProjectSnapshot = Pick<Cut2KitProject, "files" | "sourceDocuments">;

export type ProjectPdfOption = {
  relativePath: string;
  fileName: string;
  classification: Cut2KitProject["sourceDocuments"][number]["classification"] | null;
  application: Cut2KitProject["sourceDocuments"][number]["application"];
  side: Cut2KitProject["sourceDocuments"][number]["side"];
  assignmentSource: Cut2KitProject["sourceDocuments"][number]["assignmentSource"] | null;
  source: "source-document" | "project-file";
};

const CLASSIFICATION_PRIORITY: Record<NonNullable<ProjectPdfOption["classification"]>, number> = {
  elevation: 0,
  floor: 1,
  roof: 2,
  reference: 3,
  unknown: 4,
};

function fileNameFromPath(relativePath: string): string {
  const segments = relativePath.split("/");
  return segments[segments.length - 1] ?? relativePath;
}

function comparePdfOptions(left: ProjectPdfOption, right: ProjectPdfOption): number {
  const leftPriority =
    left.classification === null
      ? Number.MAX_SAFE_INTEGER
      : CLASSIFICATION_PRIORITY[left.classification];
  const rightPriority =
    right.classification === null
      ? Number.MAX_SAFE_INTEGER
      : CLASSIFICATION_PRIORITY[right.classification];

  if (leftPriority !== rightPriority) {
    return leftPriority - rightPriority;
  }

  return left.relativePath.localeCompare(right.relativePath);
}

export function buildProjectPdfOptions(project: ProjectPdfProjectSnapshot): ProjectPdfOption[] {
  const optionsByPath = new Map<string, ProjectPdfOption>();

  for (const sourceDocument of project.sourceDocuments) {
    optionsByPath.set(sourceDocument.sourcePath, {
      relativePath: sourceDocument.sourcePath,
      fileName: sourceDocument.fileName,
      classification: sourceDocument.classification,
      application: sourceDocument.application,
      side: sourceDocument.side,
      assignmentSource: sourceDocument.assignmentSource,
      source: "source-document",
    });
  }

  for (const file of project.files) {
    if (file.kind !== "file" || file.classification !== "pdf" || file.role !== "source-pdf") {
      continue;
    }
    if (optionsByPath.has(file.relativePath)) {
      continue;
    }
    optionsByPath.set(file.relativePath, {
      relativePath: file.relativePath,
      fileName: file.name,
      classification: null,
      application: null,
      side: null,
      assignmentSource: null,
      source: "project-file",
    });
  }

  return [...optionsByPath.values()].toSorted(comparePdfOptions);
}

export function describeProjectPdfOption(option: ProjectPdfOption): string {
  const tags = [
    option.classification,
    option.application,
    option.side,
    option.source === "source-document" ? option.assignmentSource : null,
  ].filter((value): value is string => value !== null);

  return tags.length > 0 ? `${tags.join(" · ")} · ${option.relativePath}` : option.relativePath;
}

export function resolveSelectedProjectPdf(
  options: ReadonlyArray<ProjectPdfOption>,
  preferredPath: string | null | undefined,
): string | null {
  if (preferredPath && options.some((option) => option.relativePath === preferredPath)) {
    return preferredPath;
  }
  return options[0]?.relativePath ?? null;
}

export function fallbackProjectPdfFileName(relativePath: string | null | undefined): string | null {
  return relativePath ? fileNameFromPath(relativePath) : null;
}

export function findProjectPdfOption(
  options: ReadonlyArray<ProjectPdfOption>,
  relativePath: string | null | undefined,
): ProjectPdfOption | null {
  if (!relativePath) {
    return null;
  }
  return options.find((option) => option.relativePath === relativePath) ?? null;
}
