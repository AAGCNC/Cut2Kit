import { FileCodeIcon, TriangleAlertIcon } from "lucide-react";

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty";
import { Spinner } from "~/components/ui/spinner";

import type { DxfViewportPresentation } from "../lib/dxfViewportPresentation";

export function DxfViewportState({ presentation }: { presentation: DxfViewportPresentation }) {
  if (presentation.kind === "ready") {
    return null;
  }

  const media =
    presentation.kind === "loading" ? (
      <Spinner className="size-5 text-foreground" />
    ) : presentation.kind === "error" ? (
      <TriangleAlertIcon className="size-5 text-amber-500" />
    ) : (
      <FileCodeIcon className="size-5 text-foreground" />
    );

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-[linear-gradient(180deg,rgba(12,18,26,0.94),rgba(12,18,26,0.88))]">
      <Empty className="gap-4">
        <EmptyHeader>
          <EmptyMedia variant="icon">{media}</EmptyMedia>
          <EmptyTitle>{presentation.title}</EmptyTitle>
          <EmptyDescription>{presentation.description}</EmptyDescription>
        </EmptyHeader>
        {presentation.kind === "loading" ? (
          <EmptyContent>Preparing the DXF viewport.</EmptyContent>
        ) : null}
      </Empty>
    </div>
  );
}
