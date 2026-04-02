import type { Cut2KitProject } from "@t3tools/contracts";

type ProjectDxfProjectSnapshot = Pick<Cut2KitProject, "files" | "sourceDocuments">;

export type ProjectDxfOption = {
  relativePath: string;
  fileName: string;
  classification: Cut2KitProject["sourceDocuments"][number]["classification"] | null;
  application: Cut2KitProject["sourceDocuments"][number]["application"];
  side: Cut2KitProject["sourceDocuments"][number]["side"];
  assignmentSource: Cut2KitProject["sourceDocuments"][number]["assignmentSource"] | null;
  source: "source-document" | "project-file";
};

const CLASSIFICATION_PRIORITY: Record<NonNullable<ProjectDxfOption["classification"]>, number> = {
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

function compareDxfOptions(left: ProjectDxfOption, right: ProjectDxfOption): number {
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

export function buildProjectDxfOptions(project: ProjectDxfProjectSnapshot): ProjectDxfOption[] {
  const optionsByPath = new Map<string, ProjectDxfOption>();

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
    if (file.kind !== "file" || file.classification !== "dxf") {
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

  return [...optionsByPath.values()].toSorted(compareDxfOptions);
}

export function resolveSelectedProjectDxf(
  options: ReadonlyArray<ProjectDxfOption>,
  preferredPath: string | null | undefined,
): string | null {
  if (preferredPath && options.some((option) => option.relativePath === preferredPath)) {
    return preferredPath;
  }
  return options[0]?.relativePath ?? null;
}

export function describeProjectDxfOption(option: ProjectDxfOption): string {
  const tags = [
    option.classification,
    option.application,
    option.side,
    option.source === "source-document" ? option.assignmentSource : null,
  ].filter((value): value is string => value !== null);

  return tags.length > 0 ? `${tags.join(" · ")} · ${option.relativePath}` : option.relativePath;
}

export function findProjectDxfOption(
  options: ReadonlyArray<ProjectDxfOption>,
  relativePath: string | null | undefined,
): ProjectDxfOption | null {
  if (!relativePath) {
    return null;
  }
  return options.find((option) => option.relativePath === relativePath) ?? null;
}

export function fallbackProjectDxfFileName(relativePath: string | null | undefined): string | null {
  return relativePath ? fileNameFromPath(relativePath) : null;
}
