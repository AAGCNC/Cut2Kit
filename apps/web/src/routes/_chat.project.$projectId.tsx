import { ProjectId } from "@t3tools/contracts";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { Cut2KitProjectView } from "../components/Cut2KitProjectView";
import { SidebarInset } from "../components/ui/sidebar";
import { useStore } from "../store";

function ChatProjectRouteView() {
  const navigate = useNavigate();
  const bootstrapComplete = useStore((store) => store.bootstrapComplete);
  const projectId = Route.useParams({
    select: (params) => ProjectId.makeUnsafe(params.projectId),
  });
  const projectExists = useStore((store) =>
    store.projects.some((project) => project.id === projectId),
  );

  useEffect(() => {
    if (!bootstrapComplete) {
      return;
    }
    if (!projectExists) {
      void navigate({ to: "/", replace: true });
    }
  }, [bootstrapComplete, navigate, projectExists]);

  if (!bootstrapComplete || !projectExists) {
    return null;
  }

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground">
      <Cut2KitProjectView projectId={projectId} />
    </SidebarInset>
  );
}

export const Route = createFileRoute("/_chat/project/$projectId")({
  component: ChatProjectRouteView,
});
