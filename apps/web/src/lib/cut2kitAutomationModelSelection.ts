import { type Cut2KitProject, type ModelSelection, type ServerProvider } from "@t3tools/contracts";
import { resolveCut2KitAutomationModelSelection } from "@t3tools/shared/cut2kit";

import { getDefaultServerModel, getProviderSnapshot } from "../providerModels";

const DEFAULT_CUT2KIT_CODEX_REASONING_EFFORT = "xhigh";

function isProviderUsable(
  providers: ReadonlyArray<ServerProvider>,
  provider: ModelSelection["provider"],
): boolean {
  const snapshot = getProviderSnapshot(providers, provider);
  if (!snapshot) {
    return true;
  }
  return snapshot.enabled && snapshot.status !== "disabled" && snapshot.status !== "error";
}

export function resolveCut2KitAutomationModelSelectionForApp(
  project: Pick<Cut2KitProject, "settings">,
  fallbackModelSelection: ModelSelection | null | undefined,
  providers: ReadonlyArray<ServerProvider>,
): ModelSelection {
  const configuredSelection = resolveCut2KitAutomationModelSelection(
    project,
    fallbackModelSelection,
  );
  if (configuredSelection.provider !== "opencode") {
    return configuredSelection;
  }
  if (isProviderUsable(providers, "opencode")) {
    return configuredSelection;
  }
  if (!isProviderUsable(providers, "codex")) {
    return configuredSelection;
  }

  const reasoningEffort =
    project.settings?.ai?.reasoningEffort ??
    (fallbackModelSelection?.provider === "codex"
      ? fallbackModelSelection.options?.reasoningEffort
      : undefined) ??
    DEFAULT_CUT2KIT_CODEX_REASONING_EFFORT;

  return {
    provider: "codex",
    model: getDefaultServerModel(providers, "codex"),
    options: {
      reasoningEffort,
    },
  };
}
