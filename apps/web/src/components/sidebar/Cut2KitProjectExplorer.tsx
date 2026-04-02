import {
  FileCodeIcon,
  FileJsonIcon,
  FileTextIcon,
  FolderIcon,
  HammerIcon,
  ImageIcon,
} from "lucide-react";

import type { Cut2KitProject, ProjectFileRecord } from "@t3tools/contracts";

import { Badge } from "../ui/badge";

const MAX_VISIBLE_EXPLORER_ENTRIES = 200;

function fileIcon(entry: ProjectFileRecord) {
  if (entry.kind === "directory") {
    return <FolderIcon aria-hidden="true" className="size-3 shrink-0 text-muted-foreground/70" />;
  }
  if (
    entry.classification === "settings" ||
    entry.classification === "json" ||
    entry.classification === "manufacturing-plan"
  ) {
    return <FileJsonIcon aria-hidden="true" className="size-3 shrink-0 text-sky-500/80" />;
  }
  if (entry.classification === "nc") {
    return <FileCodeIcon aria-hidden="true" className="size-3 shrink-0 text-emerald-500/80" />;
  }
  if (entry.classification === "pdf") {
    return <FileTextIcon aria-hidden="true" className="size-3 shrink-0 text-rose-500/80" />;
  }
  if (entry.classification === "manifest") {
    return <HammerIcon aria-hidden="true" className="size-3 shrink-0 text-amber-500/80" />;
  }
  if (entry.classification === "image") {
    return <ImageIcon aria-hidden="true" className="size-3 shrink-0 text-pink-500/80" />;
  }
  return <FileTextIcon aria-hidden="true" className="size-3 shrink-0 text-muted-foreground/70" />;
}

function fileBadge(entry: ProjectFileRecord) {
  if (entry.kind === "directory") return null;
  if (entry.classification === "settings") {
    return (
      <Badge size="sm" variant="info">
        settings
      </Badge>
    );
  }
  if (entry.classification === "manufacturing-plan") {
    return (
      <Badge size="sm" variant="info">
        cam
      </Badge>
    );
  }
  if (entry.classification === "pdf") {
    return (
      <Badge size="sm" variant={entry.role === "source-pdf" ? "success" : "secondary"}>
        pdf
      </Badge>
    );
  }
  if (entry.classification === "manifest") {
    return (
      <Badge size="sm" variant="warning">
        manifest
      </Badge>
    );
  }
  if (entry.classification === "nc") {
    return (
      <Badge size="sm" variant="secondary">
        nc
      </Badge>
    );
  }
  return null;
}

export function Cut2KitProjectExplorer({ project }: { project: Cut2KitProject }) {
  const visibleEntries = project.files.slice(0, MAX_VISIBLE_EXPLORER_ENTRIES);

  return (
    <div className="space-y-1 px-2 pb-2">
      <div className="flex items-center justify-between px-2 text-[10px] text-muted-foreground/70">
        <span>
          {project.summary.totalFiles} files, {project.summary.totalDirectories} folders
        </span>
        <span>{project.summary.pdfCount} PDFs</span>
      </div>
      <div className="space-y-0.5">
        {visibleEntries.map((entry) => (
          <div
            key={`${entry.kind}:${entry.relativePath}`}
            className="flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1 text-[10px] text-foreground/85 hover:bg-accent/40"
            style={{ paddingLeft: `${8 + entry.depth * 12}px` }}
            title={entry.relativePath}
          >
            {fileIcon(entry)}
            <span className="min-w-0 flex-1 truncate">{entry.name}</span>
            {fileBadge(entry)}
          </div>
        ))}
      </div>
      {project.files.length > visibleEntries.length ? (
        <p className="px-2 text-[10px] text-muted-foreground/70">
          Showing first {MAX_VISIBLE_EXPLORER_ENTRIES} entries.
        </p>
      ) : null}
    </div>
  );
}
