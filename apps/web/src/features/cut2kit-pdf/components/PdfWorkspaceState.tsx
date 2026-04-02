import { FileTextIcon, TriangleAlertIcon } from "lucide-react";

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty";
import { Spinner } from "~/components/ui/spinner";

export type PdfWorkspacePresentation =
  | {
      kind: "empty";
      title: string;
      description: string;
    }
  | {
      kind: "loading";
      title: string;
      description: string;
    }
  | {
      kind: "error";
      title: string;
      description: string;
    }
  | {
      kind: "ready";
    };

export function PdfWorkspaceState({ presentation }: { presentation: PdfWorkspacePresentation }) {
  if (presentation.kind === "ready") {
    return null;
  }

  const media =
    presentation.kind === "loading" ? (
      <Spinner className="size-5 text-foreground" />
    ) : presentation.kind === "error" ? (
      <TriangleAlertIcon className="size-5 text-amber-500" />
    ) : (
      <FileTextIcon className="size-5 text-foreground" />
    );

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-[linear-gradient(180deg,rgba(250,247,241,0.92),rgba(250,247,241,0.88))]">
      <Empty className="gap-4">
        <EmptyHeader>
          <EmptyMedia variant="icon">{media}</EmptyMedia>
          <EmptyTitle>{presentation.title}</EmptyTitle>
          <EmptyDescription>{presentation.description}</EmptyDescription>
        </EmptyHeader>
        {presentation.kind === "loading" ? (
          <EmptyContent>Preparing the selected PDF for inline review.</EmptyContent>
        ) : null}
      </Empty>
    </div>
  );
}
