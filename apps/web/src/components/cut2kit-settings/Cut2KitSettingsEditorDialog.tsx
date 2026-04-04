import type { Cut2KitProject, ProjectId } from "@t3tools/contracts";
import { LoaderIcon, RefreshCwIcon, Undo2Icon } from "lucide-react";
import { useMemo } from "react";

import { useCut2KitSettingsEditor } from "~/hooks/useCut2KitSettingsEditor";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "~/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Cut2KitSettingsForm } from "./Cut2KitSettingsForm";

export function Cut2KitSettingsEditorDialog({
  open,
  projectId,
  snapshot,
  onOpenChange,
}: {
  open: boolean;
  projectId: ProjectId;
  snapshot: Cut2KitProject | null;
  onOpenChange: (open: boolean) => void;
}) {
  const project = useMemo(
    () =>
      snapshot
        ? {
            id: projectId,
            cwd: snapshot.cwd,
            name: snapshot.name,
            settingsFilePath: snapshot.settingsFilePath,
          }
        : null,
    [projectId, snapshot],
  );

  const editor = useCut2KitSettingsEditor({
    open,
    project,
  });

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      onOpenChange(true);
      return;
    }

    if (editor.isSaving) {
      return;
    }

    void editor.requestClose().then((confirmed) => {
      if (confirmed) {
        onOpenChange(false);
      }
    });
  };

  const primaryActionLabel = editor.state?.hasExistingFile
    ? "Save Settings"
    : "Create Settings File";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogPopup
        className="h-[min(92vh,980px)] max-w-[min(1280px,calc(100vw-2rem))]"
        showCloseButton={!editor.isSaving}
        bottomStickOnMobile={false}
      >
        <DialogHeader className="space-y-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={editor.state?.hasExistingFile ? "secondary" : "warning"}>
                  {editor.state?.hasExistingFile
                    ? "Existing settings file"
                    : "Create settings file"}
                </Badge>
                <Badge variant={editor.hasUnsavedChanges ? "warning" : "success"}>
                  {editor.hasUnsavedChanges ? "Unsaved changes" : "Saved"}
                </Badge>
                {editor.state?.validation.isValid ? (
                  <Badge variant="success">Schema valid</Badge>
                ) : (
                  <Badge variant="error">Validation issues</Badge>
                )}
              </div>
              <div>
                <DialogTitle>Cut2Kit Settings</DialogTitle>
                <DialogDescription>
                  Edit the project-local wall workflow settings, validate the draft live, and save
                  the resulting <code>{editor.settingsFilePath}</code> file back to the workspace.
                </DialogDescription>
              </div>
            </div>
            <div className="space-y-1 rounded-xl border border-border/70 bg-background/60 px-3 py-2 text-sm">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Resolved path
              </p>
              <p className="break-all font-mono text-foreground">{editor.settingsFilePath}</p>
            </div>
          </div>
        </DialogHeader>

        <DialogPanel className="space-y-6" scrollFade>
          {!snapshot ? (
            <Alert variant="error">
              <AlertTitle>Project unavailable</AlertTitle>
              <AlertDescription>
                The Cut2Kit project snapshot is not available, so the settings editor cannot load.
              </AlertDescription>
            </Alert>
          ) : editor.loadErrorMessage ? (
            <Alert variant="error">
              <AlertTitle>Could not load settings</AlertTitle>
              <AlertDescription>{editor.loadErrorMessage}</AlertDescription>
            </Alert>
          ) : editor.isLoading && !editor.state ? (
            <div className="flex min-h-64 items-center justify-center rounded-2xl border border-dashed border-border/70 bg-background/40 text-sm text-muted-foreground">
              <LoaderIcon className="mr-2 size-4 animate-spin" />
              Loading Cut2Kit settings...
            </div>
          ) : editor.state ? (
            <Cut2KitSettingsForm
              state={editor.state}
              advancedJsonText={editor.advancedJsonText}
              advancedJsonErrorMessage={editor.advancedJsonErrorMessage}
              isAdvancedJsonDirty={editor.isAdvancedJsonDirty}
              onValueChange={editor.updateDraftAtPath}
              onAdvancedJsonTextChange={editor.setAdvancedJsonText}
              onApplyAdvancedJson={editor.applyAdvancedJson}
              onResetAdvancedJsonToDraft={editor.resetAdvancedJsonToDraft}
            />
          ) : null}
        </DialogPanel>

        <DialogFooter>
          <div className="mr-auto flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {editor.state ? (
              <>
                <span>
                  {editor.state.isDirty ? "Draft differs from disk." : "Draft matches disk."}
                </span>
                {editor.state.parseErrorMessage ? (
                  <span>
                    The last on-disk file had JSON parse errors and will be replaced on save.
                  </span>
                ) : null}
              </>
            ) : null}
          </div>
          <Button
            variant="outline"
            onClick={editor.reloadFromDisk}
            disabled={!editor.state || editor.isLoading || editor.isSaving}
          >
            <RefreshCwIcon className="size-4" />
            Reload from Disk
          </Button>
          <Button
            variant="outline"
            onClick={() => void editor.revertDraft()}
            disabled={
              !editor.state || !editor.hasUnsavedChanges || editor.isLoading || editor.isSaving
            }
          >
            <Undo2Icon className="size-4" />
            Revert
          </Button>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={editor.isSaving}
          >
            Close
          </Button>
          <Button
            onClick={() => void editor.saveDraft()}
            disabled={
              !editor.state ||
              editor.isLoading ||
              editor.isSaving ||
              !editor.state.validation.isValid
            }
          >
            {editor.isSaving ? <LoaderIcon className="size-4 animate-spin" /> : null}
            {editor.isSaving ? "Saving..." : primaryActionLabel}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
