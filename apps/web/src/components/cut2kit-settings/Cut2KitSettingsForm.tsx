import type { ReactNode } from "react";
import { useMemo } from "react";

import type {
  Cut2KitPromptTemplateKey,
  Cut2KitSettingsEditorPath,
  Cut2KitSettingsEditorState,
} from "~/lib/cut2kitSettingsEditor";
import { getCut2KitDraftValue } from "~/lib/cut2kitSettingsEditor";
import { cn } from "~/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "~/components/ui/collapsible";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Switch } from "~/components/ui/switch";
import { Textarea } from "~/components/ui/textarea";
import { CheckIcon, ChevronDownIcon, PlusIcon, TriangleAlertIcon, XIcon } from "lucide-react";

const PROJECT_UNIT_OPTIONS = [
  { value: "imperial", label: "Imperial" },
  { value: "metric", label: "Metric" },
] as const;

const NC_UNIT_OPTIONS = [
  { value: "inch", label: "Inch" },
  { value: "metric", label: "Metric" },
] as const;

const PDF_CLASSIFICATION_OPTIONS = [
  { value: "elevation", label: "Elevation" },
  { value: "floor", label: "Floor" },
  { value: "roof", label: "Roof" },
  { value: "reference", label: "Reference" },
] as const;

const APPLICATION_OPTIONS = [
  { value: "siding", label: "Siding" },
  { value: "flooring", label: "Flooring" },
  { value: "roofing", label: "Roofing" },
] as const;

const WALL_EDGE_OPTIONS = [
  { value: "left", label: "Left" },
  { value: "right", label: "Right" },
] as const;

const WALL_DIRECTION_OPTIONS = [
  { value: "left_to_right", label: "Left to right" },
  { value: "right_to_left", label: "Right to left" },
] as const;

const DRAWING_ORIENTATION_OPTIONS = [
  { value: "flat", label: "Flat" },
  { value: "on_edge", label: "On edge" },
] as const;

const SHEET_ORIENTATION_OPTIONS = [
  { value: "vertical", label: "Vertical" },
  { value: "horizontal", label: "Horizontal" },
] as const;

const PAGE_SIZE_OPTIONS = [
  { value: "letter", label: "Letter" },
  { value: "a4", label: "A4" },
] as const;

const PAGE_ORIENTATION_OPTIONS = [
  { value: "landscape", label: "Landscape" },
  { value: "portrait", label: "Portrait" },
] as const;

const DIMENSION_FORMAT_OPTIONS = [
  { value: "feet-and-inches", label: "Feet and inches" },
  { value: "decimal-inch", label: "Decimal inch" },
] as const;

const OVERWRITE_POLICY_OPTIONS = [
  { value: "overwrite", label: "Overwrite" },
  { value: "skip_if_exists", label: "Skip if exists" },
  { value: "version_if_exists", label: "Version if exists" },
] as const;

const AI_RUNTIME_GENERATION_STEPS = [
  "extract_wall_geometry",
  "generate_framing_layout",
  "generate_sheathing_layout",
  "validate_and_package",
] as const;

const PROMPT_TEMPLATE_FIELDS = [
  {
    key: "geometrySystem",
    label: "Geometry system prompt",
    description: "System instructions for wall-geometry extraction.",
  },
  {
    key: "geometryUser",
    label: "Geometry user prompt",
    description: "Task prompt for wall-geometry extraction.",
  },
  {
    key: "framingSystem",
    label: "Framing system prompt",
    description: "System instructions for framing-layout generation.",
  },
  {
    key: "framingUser",
    label: "Framing user prompt",
    description: "Task prompt for framing-layout generation.",
  },
  {
    key: "sheathingSystem",
    label: "Sheathing system prompt",
    description: "System instructions for sheathing-layout generation.",
  },
  {
    key: "sheathingUser",
    label: "Sheathing user prompt",
    description: "Task prompt for sheathing-layout generation.",
  },
  {
    key: "validationChecklist",
    label: "Validation checklist",
    description: "Checklist injected into geometry, framing, and sheathing prompts.",
  },
] as const satisfies ReadonlyArray<{
  key: Cut2KitPromptTemplateKey;
  label: string;
  description: string;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readValue(state: Cut2KitSettingsEditorState, path: Cut2KitSettingsEditorPath) {
  return getCut2KitDraftValue(state.draft, path);
}

function readStringValue(state: Cut2KitSettingsEditorState, path: Cut2KitSettingsEditorPath) {
  const value = readValue(state, path);
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function readOptionalStringValue(
  state: Cut2KitSettingsEditorState,
  path: Cut2KitSettingsEditorPath,
) {
  const value = readValue(state, path);
  return typeof value === "string" ? value : "";
}

function readBooleanValue(state: Cut2KitSettingsEditorState, path: Cut2KitSettingsEditorPath) {
  return readValue(state, path) === true;
}

function readNumericInputValue(state: Cut2KitSettingsEditorState, path: Cut2KitSettingsEditorPath) {
  const value = readValue(state, path);
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "";
  }
  if (typeof value === "string") {
    return value;
  }
  return "";
}

function readSelectValue(
  state: Cut2KitSettingsEditorState,
  path: Cut2KitSettingsEditorPath,
  options: ReadonlyArray<{ value: string }>,
) {
  const value = readValue(state, path);
  if (typeof value !== "string") {
    return "";
  }
  return options.some((option) => option.value === value) ? value : "";
}

function readStringArrayValue(state: Cut2KitSettingsEditorState, path: Cut2KitSettingsEditorPath) {
  const value = readValue(state, path);
  if (!Array.isArray(value)) {
    return [] as string[];
  }
  return value.map((entry) => (typeof entry === "string" ? entry : ""));
}

function readObjectArrayValue(state: Cut2KitSettingsEditorState, path: Cut2KitSettingsEditorPath) {
  const value = readValue(state, path);
  return Array.isArray(value) ? value : [];
}

function validateRequiredString(value: unknown, label: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return `${label} is required.`;
  }
  return null;
}

function validateOptionalStringList(values: string[]) {
  for (const value of values) {
    if (value.trim().length === 0) {
      return "Blank rows are not allowed.";
    }
  }
  return null;
}

function validateEnumValue(
  value: unknown,
  label: string,
  options: ReadonlyArray<{ value: string }>,
) {
  if (typeof value !== "string" || !options.some((option) => option.value === value)) {
    return `Choose a valid ${label.toLowerCase()}.`;
  }
  return null;
}

function validateNumberValue(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return `${label} must be a number.`;
  }
  return null;
}

function validatePositiveInteger(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    return `${label} must be a positive whole number.`;
  }
  return null;
}

function parseNumberInput(value: string): number | string {
  if (value.trim().length === 0) {
    return "";
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : value;
}

function promptSourceBadgeLabel(state: Cut2KitSettingsEditorState, key: Cut2KitPromptTemplateKey) {
  const promptTemplate = state.promptTemplates[key];
  const configuredPath = readStringValue(state, ["ai", "promptTemplatePaths", key]);

  if (configuredPath !== promptTemplate.loadedConfiguredPath) {
    return "Path changed";
  }
  if (
    promptTemplate.loadedContents !== null &&
    promptTemplate.contents !== promptTemplate.loadedContents
  ) {
    return "Modified";
  }
  switch (promptTemplate.source) {
    case "workspace":
      return "Project override";
    case "repo_default":
      return "Repo default";
    case "external":
      return "External path";
    default:
      return "Unresolved";
  }
}

function promptSourceBadgeVariant(
  state: Cut2KitSettingsEditorState,
  key: Cut2KitPromptTemplateKey,
) {
  const promptTemplate = state.promptTemplates[key];
  const configuredPath = readStringValue(state, ["ai", "promptTemplatePaths", key]);

  if (configuredPath !== promptTemplate.loadedConfiguredPath) {
    return "warning" as const;
  }
  if (
    promptTemplate.loadedContents !== null &&
    promptTemplate.contents !== promptTemplate.loadedContents
  ) {
    return "warning" as const;
  }
  if (promptTemplate.source === "workspace") {
    return "secondary" as const;
  }
  if (promptTemplate.source === "repo_default") {
    return "outline" as const;
  }
  if (promptTemplate.source === "external") {
    return "outline" as const;
  }
  return "outline" as const;
}

function PromptTemplateEditor({
  state,
  templateKey,
  label,
  description,
  onValueChange,
  onPromptTemplateChange,
}: {
  state: Cut2KitSettingsEditorState;
  templateKey: Cut2KitPromptTemplateKey;
  label: string;
  description: string;
  onValueChange: (path: Cut2KitSettingsEditorPath, value: unknown) => void;
  onPromptTemplateChange: (key: Cut2KitPromptTemplateKey, value: string) => void;
}) {
  const promptTemplate = state.promptTemplates[templateKey];
  const configuredPath = readStringValue(state, ["ai", "promptTemplatePaths", templateKey]);
  const promptTemplateError = state.validation.promptTemplateErrors[templateKey] ?? null;
  const pathChanged = configuredPath !== promptTemplate.loadedConfiguredPath;
  const contentsChanged =
    promptTemplate.loadedContents !== null &&
    promptTemplate.contents !== promptTemplate.loadedContents;
  const pathError =
    validateRequiredString(
      readValue(state, ["ai", "promptTemplatePaths", templateKey]),
      `${label} path`,
    ) ?? (promptTemplateError?.includes("project-relative path") ? promptTemplateError : null);
  const contentsError =
    promptTemplateError && !promptTemplateError.includes("project-relative path")
      ? promptTemplateError
      : null;

  return (
    <div className="space-y-3 rounded-xl border border-border/70 bg-background/40 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">{label}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant={promptSourceBadgeVariant(state, templateKey)}>
            {promptSourceBadgeLabel(state, templateKey)}
          </Badge>
          {contentsChanged ? <Badge variant="warning">Unsaved content</Badge> : null}
        </div>
      </div>

      <Field
        label="Prompt path"
        description="Relative paths use a project-local file first, then fall back to the shared repo default."
        error={pathError}
      >
        <Input
          value={configuredPath}
          onChange={(event) =>
            onValueChange(["ai", "promptTemplatePaths", templateKey], event.target.value)
          }
        />
      </Field>

      <div className="grid gap-2 rounded-lg border border-dashed border-border/70 bg-background/50 p-3 text-xs text-muted-foreground">
        <p>
          Loaded from{" "}
          <span className="font-medium text-foreground">
            {promptTemplate.resolvedPath ?? promptTemplate.loadedConfiguredPath}
          </span>
        </p>
        <p>
          {pathChanged
            ? "Saving will write a project-local markdown file at the new configured path."
            : promptTemplate.source === "repo_default"
              ? "No project-local override exists yet. Saving modified content will create one in the workspace."
              : "Saving modified content updates the project-local markdown file."}
        </p>
      </div>

      <Field
        label="Prompt markdown"
        description="Edit the actual markdown used to trigger this action."
        error={contentsError}
      >
        <Textarea
          className="min-h-52 font-mono text-xs"
          value={promptTemplate.contents}
          onChange={(event) => onPromptTemplateChange(templateKey, event.target.value)}
        />
      </Field>
    </div>
  );
}

function SectionCard({
  id,
  title,
  description,
  aside,
  children,
}: {
  id: string;
  title: string;
  description: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="space-y-3 rounded-2xl border bg-card p-4 shadow-xs/5">
      <div className="flex flex-col gap-2 border-b border-border/70 pb-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <p className="max-w-3xl text-sm text-muted-foreground">{description}</p>
        </div>
        {aside ? <div className="shrink-0">{aside}</div> : null}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function FieldGrid({
  children,
  columns = "default",
}: {
  children: ReactNode;
  columns?: "default" | "compact";
}) {
  return (
    <div
      className={cn(
        "grid gap-4",
        columns === "default" && "lg:grid-cols-2",
        columns === "compact" && "md:grid-cols-2 xl:grid-cols-4",
      )}
    >
      {children}
    </div>
  );
}

function Field({
  label,
  description,
  error,
  children,
  className,
}: {
  label: string;
  description?: string;
  error?: string | null;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("grid gap-1.5", className)}>
      <span className="text-sm font-medium text-foreground">{label}</span>
      {description ? <span className="text-xs text-muted-foreground">{description}</span> : null}
      {children}
      {error ? <span className="text-destructive text-xs">{error}</span> : null}
    </label>
  );
}

function ToggleField({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-border/70 bg-background/50 p-3">
      <div className="space-y-1">
        <h3 className="text-sm font-medium text-foreground">{label}</h3>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={(value) => onCheckedChange(Boolean(value))} />
    </div>
  );
}

function ReadOnlyList({
  label,
  items,
  emptyLabel,
}: {
  label: string;
  items: ReadonlyArray<string>;
  emptyLabel: string;
}) {
  return (
    <div className="space-y-2 rounded-xl border border-dashed border-border/70 bg-background/40 p-3">
      <p className="text-sm font-medium text-foreground">{label}</p>
      <div className="flex flex-wrap gap-2">
        {items.length === 0 ? (
          <span className="text-xs text-muted-foreground">{emptyLabel}</span>
        ) : (
          items.map((item) => (
            <Badge key={item} variant="outline">
              {item}
            </Badge>
          ))
        )}
      </div>
    </div>
  );
}

function buildStableListKey(prefix: string, value: string, seenCounts: Map<string, number>) {
  const seenCount = seenCounts.get(value) ?? 0;
  seenCounts.set(value, seenCount + 1);
  return `${prefix}:${value}:${seenCount}`;
}

function StringListEditor({
  label,
  description,
  values,
  addLabel,
  itemLabel,
  error,
  onAdd,
  onRemove,
  onChange,
}: {
  label: string;
  description: string;
  values: string[];
  addLabel: string;
  itemLabel: string;
  error?: string | null;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onChange: (index: number, nextValue: string) => void;
}) {
  const seenKeys = new Map<string, number>();

  return (
    <div className="space-y-3 rounded-xl border border-border/70 bg-background/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">{label}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <Button variant="outline" size="sm" onClick={onAdd}>
          <PlusIcon className="size-4" />
          {addLabel}
        </Button>
      </div>
      <div className="space-y-2">
        {values.length === 0 ? (
          <p className="text-sm text-muted-foreground">No entries configured.</p>
        ) : (
          values.map((value, index) => (
            <div
              key={buildStableListKey(`${label}:${itemLabel}`, value, seenKeys)}
              className="flex items-start gap-2"
            >
              <Field
                label={`${itemLabel} ${index + 1}`}
                className="min-w-0 flex-1"
                error={value.trim().length === 0 ? `${itemLabel} cannot be blank.` : null}
              >
                <Input value={value} onChange={(event) => onChange(index, event.target.value)} />
              </Field>
              <Button
                variant="ghost"
                size="icon-sm"
                className="mt-7"
                aria-label={`Remove ${itemLabel.toLowerCase()} ${index + 1}`}
                onClick={() => onRemove(index)}
              >
                <XIcon className="size-4" />
              </Button>
            </div>
          ))
        )}
      </div>
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </div>
  );
}

function AssignmentCard({
  index,
  assignment,
  onChange,
  onRemove,
}: {
  index: number;
  assignment: unknown;
  onChange: (path: ReadonlyArray<string | number>, value: unknown) => void;
  onRemove: () => void;
}) {
  const row = isRecord(assignment) ? assignment : {};
  const pathPattern = typeof row.pathPattern === "string" ? row.pathPattern : "";
  const classification =
    typeof row.classification === "string" &&
    PDF_CLASSIFICATION_OPTIONS.some((option) => option.value === row.classification)
      ? row.classification
      : "";
  const side = typeof row.side === "string" ? row.side : "";
  const application =
    typeof row.application === "string" &&
    APPLICATION_OPTIONS.some((option) => option.value === row.application)
      ? row.application
      : "";

  return (
    <div className="space-y-3 rounded-xl border border-border/70 bg-background/50 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-foreground">Assignment {index + 1}</p>
        <Button variant="ghost" size="sm" onClick={onRemove}>
          <XIcon className="size-4" />
          Remove
        </Button>
      </div>
      <FieldGrid>
        <Field label="Path pattern" error={validateRequiredString(pathPattern, "Path pattern")}>
          <Input
            value={pathPattern}
            onChange={(event) => onChange([index, "pathPattern"], event.target.value)}
          />
        </Field>
        <Field
          label="Classification"
          error={validateEnumValue(classification, "classification", PDF_CLASSIFICATION_OPTIONS)}
        >
          <Select
            value={classification}
            onValueChange={(value) => onChange([index, "classification"], value)}
          >
            <SelectTrigger aria-label={`Classification for assignment ${index + 1}`}>
              <SelectValue>
                {PDF_CLASSIFICATION_OPTIONS.find((option) => option.value === classification)
                  ?.label ?? "Select classification"}
              </SelectValue>
            </SelectTrigger>
            <SelectPopup>
              {PDF_CLASSIFICATION_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        </Field>
        <Field label="Side" description="Optional site-facing side label.">
          <Input
            value={side}
            onChange={(event) => {
              const nextValue = event.target.value;
              onChange([index, "side"], nextValue.trim().length === 0 ? undefined : nextValue);
            }}
          />
        </Field>
        <Field
          label="Application"
          error={validateEnumValue(application, "application", APPLICATION_OPTIONS)}
        >
          <Select
            value={application}
            onValueChange={(value) => onChange([index, "application"], value)}
          >
            <SelectTrigger aria-label={`Application for assignment ${index + 1}`}>
              <SelectValue>
                {APPLICATION_OPTIONS.find((option) => option.value === application)?.label ??
                  "Select application"}
              </SelectValue>
            </SelectTrigger>
            <SelectPopup>
              {APPLICATION_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        </Field>
      </FieldGrid>
    </div>
  );
}

export function Cut2KitSettingsForm({
  state,
  advancedJsonText,
  advancedJsonErrorMessage,
  isAdvancedJsonDirty,
  onValueChange,
  onPromptTemplateChange,
  onAdvancedJsonTextChange,
  onApplyAdvancedJson,
  onResetAdvancedJsonToDraft,
}: {
  state: Cut2KitSettingsEditorState;
  advancedJsonText: string;
  advancedJsonErrorMessage: string | null;
  isAdvancedJsonDirty: boolean;
  onValueChange: (path: Cut2KitSettingsEditorPath, value: unknown) => void;
  onPromptTemplateChange: (key: Cut2KitPromptTemplateKey, value: string) => void;
  onAdvancedJsonTextChange: (value: string) => void;
  onApplyAdvancedJson: () => void;
  onResetAdvancedJsonToDraft: () => void;
}) {
  const validationAlert = useMemo(() => {
    if (state.parseErrorMessage) {
      return {
        description:
          "The file on disk could not be parsed as lenient JSON. The editor loaded defaults so you can repair or replace it. Saving will overwrite the broken file.",
        title: "Existing settings file has JSON errors",
        variant: "warning" as const,
      };
    }

    if (!state.validation.isValid) {
      return {
        description:
          state.validation.errorMessage ??
          "The draft has schema validation issues. Fix them before saving.",
        title: "Draft validation failed",
        variant: "error" as const,
      };
    }

    return {
      description: state.isDirty
        ? "The draft is schema-valid and has unsaved changes."
        : "The loaded draft matches the current schema and is in sync with disk.",
      title: state.isDirty ? "Draft ready to save" : "Draft is up to date",
      variant: state.isDirty ? ("warning" as const) : ("success" as const),
    };
  }, [
    state.isDirty,
    state.parseErrorMessage,
    state.validation.errorMessage,
    state.validation.isValid,
  ]);

  const preferredFolders = readStringArrayValue(state, ["discovery", "preferredFolders"]);
  const knownSettingsFileNames = readStringArrayValue(state, [
    "discovery",
    "knownSettingsFileNames",
  ]);
  const noteLines = readStringArrayValue(state, ["fastening", "noteLines"]);
  const fileAssignments = readObjectArrayValue(state, ["input", "fileAssignments"]);
  const runtimeGenerationOrder = readStringArrayValue(state, ["ai", "runtimeGenerationOrder"]);
  const geometrySourcePriority = readStringArrayValue(state, [
    "input",
    "elevationIntake",
    "geometrySourcePriority",
  ]);
  const assignmentKeyCounts = new Map<string, number>();

  return (
    <div className="space-y-6">
      <Alert variant={validationAlert.variant}>
        {validationAlert.variant === "success" ? (
          <CheckIcon className="size-4" />
        ) : (
          <TriangleAlertIcon className="size-4" />
        )}
        <AlertTitle>{validationAlert.title}</AlertTitle>
        <AlertDescription>{validationAlert.description}</AlertDescription>
      </Alert>

      <SectionCard
        id="cut2kit-settings-project"
        title="Project"
        description="Identity and unit settings used throughout the wall-layout workflow."
        aside={<Badge variant="outline">Schema {readStringValue(state, ["schemaVersion"])}</Badge>}
      >
        <FieldGrid>
          <Field
            label="Project ID"
            description="Stable identifier used in generated artifacts."
            error={validateRequiredString(readValue(state, ["project", "projectId"]), "Project ID")}
          >
            <Input
              value={readStringValue(state, ["project", "projectId"])}
              onChange={(event) => onValueChange(["project", "projectId"], event.target.value)}
            />
          </Field>
          <Field
            label="Job name"
            description="Human-readable name shown in reports and layouts."
            error={validateRequiredString(readValue(state, ["project", "jobName"]), "Job name")}
          >
            <Input
              value={readStringValue(state, ["project", "jobName"])}
              onChange={(event) => onValueChange(["project", "jobName"], event.target.value)}
            />
          </Field>
          <Field
            label="Customer"
            error={validateRequiredString(readValue(state, ["project", "customer"]), "Customer")}
          >
            <Input
              value={readStringValue(state, ["project", "customer"])}
              onChange={(event) => onValueChange(["project", "customer"], event.target.value)}
            />
          </Field>
          <Field
            label="Site"
            error={validateRequiredString(readValue(state, ["project", "site"]), "Site")}
          >
            <Input
              value={readStringValue(state, ["project", "site"])}
              onChange={(event) => onValueChange(["project", "site"], event.target.value)}
            />
          </Field>
          <Field
            label="Units"
            error={validateEnumValue(
              readValue(state, ["project", "units"]),
              "units",
              PROJECT_UNIT_OPTIONS,
            )}
          >
            <Select
              value={readSelectValue(state, ["project", "units"], PROJECT_UNIT_OPTIONS)}
              onValueChange={(value) => onValueChange(["project", "units"], value)}
            >
              <SelectTrigger aria-label="Project units">
                <SelectValue>
                  {PROJECT_UNIT_OPTIONS.find(
                    (option) =>
                      option.value ===
                      readSelectValue(state, ["project", "units"], PROJECT_UNIT_OPTIONS),
                  )?.label ?? "Select units"}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup>
                {PROJECT_UNIT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </Field>
          <Field label="Description" description="Optional summary for the project.">
            <Textarea
              value={readOptionalStringValue(state, ["project", "description"])}
              onChange={(event) =>
                onValueChange(
                  ["project", "description"],
                  event.target.value.trim().length === 0 ? undefined : event.target.value,
                )
              }
            />
          </Field>
        </FieldGrid>
      </SectionCard>

      <SectionCard
        id="cut2kit-settings-ai"
        title="AI"
        description="Codex/GPT-5.4 workflow controls, prompt template paths, and project-local prompt overrides."
        aside={
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{readStringValue(state, ["ai", "provider"])}</Badge>
            <Badge variant="outline">{readStringValue(state, ["ai", "model"])}</Badge>
            <Badge variant="outline">{readStringValue(state, ["ai", "reasoningEffort"])}</Badge>
          </div>
        }
      >
        <ToggleField
          label="Enable AI-first wall workflow"
          description="Turns the Codex-driven wall geometry, framing, and sheathing pipeline on or off."
          checked={readBooleanValue(state, ["ai", "enabled"])}
          onCheckedChange={(checked) => onValueChange(["ai", "enabled"], checked)}
        />

        <FieldGrid>
          <Field
            label="Agent name"
            error={validateRequiredString(readValue(state, ["ai", "agentName"]), "Agent name")}
          >
            <Input
              value={readStringValue(state, ["ai", "agentName"])}
              onChange={(event) => onValueChange(["ai", "agentName"], event.target.value)}
            />
          </Field>
          <Field label="Primary workflow">
            <Input value={readStringValue(state, ["ai", "primaryWorkflow"])} disabled />
          </Field>
        </FieldGrid>

        <div className="space-y-3">
          <div className="space-y-1 rounded-xl border border-border/70 bg-background/50 p-3">
            <p className="text-sm font-medium text-foreground">Prompt templates</p>
            <p className="text-xs text-muted-foreground">
              The app resolves these markdown prompts before each action run. Unchanged prompts
              continue to use the shared repo defaults. Edited prompts are saved as project-local
              markdown files and then used automatically.
            </p>
          </div>
          {PROMPT_TEMPLATE_FIELDS.map((field) => (
            <PromptTemplateEditor
              key={field.key}
              state={state}
              templateKey={field.key}
              label={field.label}
              description={field.description}
              onValueChange={onValueChange}
              onPromptTemplateChange={onPromptTemplateChange}
            />
          ))}
        </div>

        <ReadOnlyList
          label="Runtime generation order"
          items={runtimeGenerationOrder}
          emptyLabel="No runtime generation steps configured."
        />
        {!runtimeGenerationOrder.every((step) =>
          AI_RUNTIME_GENERATION_STEPS.includes(
            step as (typeof AI_RUNTIME_GENERATION_STEPS)[number],
          ),
        ) ? (
          <p className="text-destructive text-xs">
            Runtime generation order contains an unsupported step. Fix it in Advanced JSON.
          </p>
        ) : null}
      </SectionCard>

      <SectionCard
        id="cut2kit-settings-discovery"
        title="Discovery"
        description="Workspace scanning and settings-file discovery behavior."
      >
        <ToggleField
          label="Search recursively"
          description="Walk nested folders while building the project snapshot."
          checked={readBooleanValue(state, ["discovery", "searchRecursively"])}
          onCheckedChange={(checked) => onValueChange(["discovery", "searchRecursively"], checked)}
        />

        <StringListEditor
          label="Preferred folders"
          description="Folders Cut2Kit should look at first when scanning project inputs."
          values={preferredFolders}
          addLabel="Add folder"
          itemLabel="Folder"
          error={validateOptionalStringList(preferredFolders)}
          onAdd={() => onValueChange(["discovery", "preferredFolders"], [...preferredFolders, ""])}
          onRemove={(index) =>
            onValueChange(
              ["discovery", "preferredFolders"],
              preferredFolders.filter((_, candidateIndex) => candidateIndex !== index),
            )
          }
          onChange={(index, nextValue) =>
            onValueChange(
              ["discovery", "preferredFolders"],
              preferredFolders.map((value, candidateIndex) =>
                candidateIndex === index ? nextValue : value,
              ),
            )
          }
        />

        <StringListEditor
          label="Known settings file names"
          description="Recognized config file names for discovery and validation."
          values={knownSettingsFileNames}
          addLabel="Add file name"
          itemLabel="File name"
          error={validateOptionalStringList(knownSettingsFileNames)}
          onAdd={() =>
            onValueChange(["discovery", "knownSettingsFileNames"], [...knownSettingsFileNames, ""])
          }
          onRemove={(index) =>
            onValueChange(
              ["discovery", "knownSettingsFileNames"],
              knownSettingsFileNames.filter((_, candidateIndex) => candidateIndex !== index),
            )
          }
          onChange={(index, nextValue) =>
            onValueChange(
              ["discovery", "knownSettingsFileNames"],
              knownSettingsFileNames.map((value, candidateIndex) =>
                candidateIndex === index ? nextValue : value,
              ),
            )
          }
        />
      </SectionCard>

      <SectionCard
        id="cut2kit-settings-input"
        title="Input"
        description="Source document classification and elevation-intake behavior for the wall workflow."
      >
        <ToggleField
          label="Auto classify source PDFs"
          description="Allows Cut2Kit to classify files when an explicit assignment is not present."
          checked={readBooleanValue(state, ["input", "autoClassify"])}
          onCheckedChange={(checked) => onValueChange(["input", "autoClassify"], checked)}
        />

        <div className="space-y-3 rounded-xl border border-border/70 bg-background/40 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">File assignments</p>
              <p className="text-xs text-muted-foreground">
                Explicit rules for classifying elevation and reference PDFs.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                onValueChange(
                  ["input", "fileAssignments"],
                  [
                    ...fileAssignments,
                    {
                      pathPattern: "",
                      classification: "elevation",
                      side: "front",
                      application: "siding",
                    },
                  ],
                )
              }
            >
              <PlusIcon className="size-4" />
              Add assignment
            </Button>
          </div>
          {fileAssignments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No explicit file assignments configured. The wall workflow usually wants at least one
              elevation assignment.
            </p>
          ) : (
            fileAssignments.map((assignment, index) => (
              <AssignmentCard
                key={buildStableListKey(
                  "assignment",
                  JSON.stringify(assignment),
                  assignmentKeyCounts,
                )}
                index={index}
                assignment={assignment}
                onChange={(path, value) =>
                  onValueChange(["input", "fileAssignments", ...path], value)
                }
                onRemove={() =>
                  onValueChange(
                    ["input", "fileAssignments"],
                    fileAssignments.filter((_, candidateIndex) => candidateIndex !== index),
                  )
                }
              />
            ))
          )}
        </div>

        <FieldGrid>
          <Field label="Elevation intake units">
            <Select
              value={readSelectValue(state, ["input", "elevationIntake", "units"], NC_UNIT_OPTIONS)}
              onValueChange={(value) => onValueChange(["input", "elevationIntake", "units"], value)}
            >
              <SelectTrigger aria-label="Elevation intake units">
                <SelectValue>
                  {NC_UNIT_OPTIONS.find(
                    (option) =>
                      option.value ===
                      readSelectValue(
                        state,
                        ["input", "elevationIntake", "units"],
                        NC_UNIT_OPTIONS,
                      ),
                  )?.label ?? "Select units"}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup>
                {NC_UNIT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </Field>
          <ReadOnlyList
            label="Geometry source priority"
            items={geometrySourcePriority}
            emptyLabel="No geometry priorities configured."
          />
        </FieldGrid>

        <FieldGrid>
          <ToggleField
            label="Enable elevation intake"
            description="Use the elevation-intake pipeline for wall geometry extraction."
            checked={readBooleanValue(state, ["input", "elevationIntake", "enabled"])}
            onCheckedChange={(checked) =>
              onValueChange(["input", "elevationIntake", "enabled"], checked)
            }
          />
          <ToggleField
            label="Explicit dimensions are authoritative"
            description="Prefer labeled dimensions over inferred geometry when both exist."
            checked={readBooleanValue(state, [
              "input",
              "elevationIntake",
              "explicitDimensionsAreAuthoritative",
            ])}
            onCheckedChange={(checked) =>
              onValueChange(
                ["input", "elevationIntake", "explicitDimensionsAreAuthoritative"],
                checked,
              )
            }
          />
          <ToggleField
            label="Require common head height"
            description="Treat inconsistent opening head heights as ambiguous input."
            checked={readBooleanValue(state, [
              "input",
              "elevationIntake",
              "requireCommonHeadHeight",
            ])}
            onCheckedChange={(checked) =>
              onValueChange(["input", "elevationIntake", "requireCommonHeadHeight"], checked)
            }
          />
          <ToggleField
            label="Require common window sill height"
            description="Treat inconsistent sill heights as ambiguous input."
            checked={readBooleanValue(state, [
              "input",
              "elevationIntake",
              "requireCommonWindowSillHeight",
            ])}
            onCheckedChange={(checked) =>
              onValueChange(["input", "elevationIntake", "requireCommonWindowSillHeight"], checked)
            }
          />
          <ToggleField
            label="Stop on missing dimensions"
            description="Require explicit dimensions before the workflow continues."
            checked={readBooleanValue(state, [
              "input",
              "elevationIntake",
              "ambiguityHandling",
              "stopOnMissingDimensions",
            ])}
            onCheckedChange={(checked) =>
              onValueChange(
                ["input", "elevationIntake", "ambiguityHandling", "stopOnMissingDimensions"],
                checked,
              )
            }
          />
          <ToggleField
            label="Stop on conflicting dimensions"
            description="Require manual review when dimensions disagree."
            checked={readBooleanValue(state, [
              "input",
              "elevationIntake",
              "ambiguityHandling",
              "stopOnConflictingDimensions",
            ])}
            onCheckedChange={(checked) =>
              onValueChange(
                ["input", "elevationIntake", "ambiguityHandling", "stopOnConflictingDimensions"],
                checked,
              )
            }
          />
          <ToggleField
            label="Stop on incomplete openings"
            description="Require complete opening geometry for downstream framing and sheathing."
            checked={readBooleanValue(state, [
              "input",
              "elevationIntake",
              "ambiguityHandling",
              "stopOnIncompleteOpeningGeometry",
            ])}
            onCheckedChange={(checked) =>
              onValueChange(
                [
                  "input",
                  "elevationIntake",
                  "ambiguityHandling",
                  "stopOnIncompleteOpeningGeometry",
                ],
                checked,
              )
            }
          />
          <ToggleField
            label="Require user confirmation"
            description="Stop and request confirmation when the extractor still detects ambiguity."
            checked={readBooleanValue(state, [
              "input",
              "elevationIntake",
              "ambiguityHandling",
              "requireUserConfirmationToContinue",
            ])}
            onCheckedChange={(checked) =>
              onValueChange(
                [
                  "input",
                  "elevationIntake",
                  "ambiguityHandling",
                  "requireUserConfirmationToContinue",
                ],
                checked,
              )
            }
          />
        </FieldGrid>
      </SectionCard>

      <SectionCard
        id="cut2kit-settings-artifacts"
        title="Artifacts"
        description="Workspace-relative folders used for generated wall, framing, and sheathing layouts."
      >
        <FieldGrid>
          <Field
            label="Wall layouts directory"
            error={validateRequiredString(
              readValue(state, ["artifacts", "wallLayoutsDir"]),
              "Wall layouts directory",
            )}
          >
            <Input
              value={readStringValue(state, ["artifacts", "wallLayoutsDir"])}
              onChange={(event) =>
                onValueChange(["artifacts", "wallLayoutsDir"], event.target.value)
              }
            />
          </Field>
          <Field
            label="Framing layouts directory"
            error={validateRequiredString(
              readValue(state, ["artifacts", "framingLayoutsDir"]),
              "Framing layouts directory",
            )}
          >
            <Input
              value={readStringValue(state, ["artifacts", "framingLayoutsDir"])}
              onChange={(event) =>
                onValueChange(["artifacts", "framingLayoutsDir"], event.target.value)
              }
            />
          </Field>
          <Field
            label="Sheathing layouts directory"
            error={validateRequiredString(
              readValue(state, ["artifacts", "sheathingLayoutsDir"]),
              "Sheathing layouts directory",
            )}
          >
            <Input
              value={readStringValue(state, ["artifacts", "sheathingLayoutsDir"])}
              onChange={(event) =>
                onValueChange(["artifacts", "sheathingLayoutsDir"], event.target.value)
              }
            />
          </Field>
        </FieldGrid>
      </SectionCard>

      <SectionCard
        id="cut2kit-settings-framing"
        title="Framing"
        description="Stud, plate, and member settings used by the implemented wall framing workflow."
      >
        <ToggleField
          label="Enable framing generation"
          description="Allow Cut2Kit to produce framing layout JSON and rendered PDFs."
          checked={readBooleanValue(state, ["framing", "enabled"])}
          onCheckedChange={(checked) => onValueChange(["framing", "enabled"], checked)}
        />

        <FieldGrid>
          <Field
            label="Material label"
            error={validateRequiredString(
              readValue(state, ["framing", "material", "label"]),
              "Material label",
            )}
          >
            <Input
              value={readStringValue(state, ["framing", "material", "label"])}
              onChange={(event) =>
                onValueChange(["framing", "material", "label"], event.target.value)
              }
            />
          </Field>
          <Field
            label="Nominal size"
            error={validateRequiredString(
              readValue(state, ["framing", "material", "nominalSize"]),
              "Nominal size",
            )}
          >
            <Input
              value={readStringValue(state, ["framing", "material", "nominalSize"])}
              onChange={(event) =>
                onValueChange(["framing", "material", "nominalSize"], event.target.value)
              }
            />
          </Field>
          <Field
            label="Thickness"
            error={validateNumberValue(
              readValue(state, ["framing", "material", "thickness"]),
              "Thickness",
            )}
          >
            <Input
              type="number"
              value={readNumericInputValue(state, ["framing", "material", "thickness"])}
              onChange={(event) =>
                onValueChange(
                  ["framing", "material", "thickness"],
                  parseNumberInput(event.target.value),
                )
              }
            />
          </Field>
          <Field
            label="Depth"
            error={validateNumberValue(readValue(state, ["framing", "material", "depth"]), "Depth")}
          >
            <Input
              type="number"
              value={readNumericInputValue(state, ["framing", "material", "depth"])}
              onChange={(event) =>
                onValueChange(
                  ["framing", "material", "depth"],
                  parseNumberInput(event.target.value),
                )
              }
            />
          </Field>
        </FieldGrid>

        <FieldGrid>
          <Field label="Top plate orientation">
            <Select
              value={readSelectValue(
                state,
                ["framing", "plates", "top", "orientationInElevation"],
                DRAWING_ORIENTATION_OPTIONS,
              )}
              onValueChange={(value) =>
                onValueChange(["framing", "plates", "top", "orientationInElevation"], value)
              }
            >
              <SelectTrigger aria-label="Top plate orientation">
                <SelectValue>
                  {DRAWING_ORIENTATION_OPTIONS.find(
                    (option) =>
                      option.value ===
                      readSelectValue(
                        state,
                        ["framing", "plates", "top", "orientationInElevation"],
                        DRAWING_ORIENTATION_OPTIONS,
                      ),
                  )?.label ?? "Select orientation"}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup>
                {DRAWING_ORIENTATION_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </Field>
          <Field label="Bottom plate orientation">
            <Select
              value={readSelectValue(
                state,
                ["framing", "plates", "bottom", "orientationInElevation"],
                DRAWING_ORIENTATION_OPTIONS,
              )}
              onValueChange={(value) =>
                onValueChange(["framing", "plates", "bottom", "orientationInElevation"], value)
              }
            >
              <SelectTrigger aria-label="Bottom plate orientation">
                <SelectValue>
                  {DRAWING_ORIENTATION_OPTIONS.find(
                    (option) =>
                      option.value ===
                      readSelectValue(
                        state,
                        ["framing", "plates", "bottom", "orientationInElevation"],
                        DRAWING_ORIENTATION_OPTIONS,
                      ),
                  )?.label ?? "Select orientation"}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup>
                {DRAWING_ORIENTATION_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </Field>
          <Field label="Horizontal member orientation">
            <Select
              value={readSelectValue(
                state,
                ["framing", "horizontalMembers", "orientationInElevation"],
                DRAWING_ORIENTATION_OPTIONS,
              )}
              onValueChange={(value) =>
                onValueChange(["framing", "horizontalMembers", "orientationInElevation"], value)
              }
            >
              <SelectTrigger aria-label="Horizontal member orientation">
                <SelectValue>
                  {DRAWING_ORIENTATION_OPTIONS.find(
                    (option) =>
                      option.value ===
                      readSelectValue(
                        state,
                        ["framing", "horizontalMembers", "orientationInElevation"],
                        DRAWING_ORIENTATION_OPTIONS,
                      ),
                  )?.label ?? "Select orientation"}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup>
                {DRAWING_ORIENTATION_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </Field>
        </FieldGrid>

        <FieldGrid columns="compact">
          <Field
            label="Left end-stud count"
            error={validatePositiveInteger(
              readValue(state, ["framing", "endStuds", "leftCount"]),
              "Left end-stud count",
            )}
          >
            <Input
              type="number"
              value={readNumericInputValue(state, ["framing", "endStuds", "leftCount"])}
              onChange={(event) =>
                onValueChange(
                  ["framing", "endStuds", "leftCount"],
                  parseNumberInput(event.target.value),
                )
              }
            />
          </Field>
          <Field
            label="Right end-stud count"
            error={validatePositiveInteger(
              readValue(state, ["framing", "endStuds", "rightCount"]),
              "Right end-stud count",
            )}
          >
            <Input
              type="number"
              value={readNumericInputValue(state, ["framing", "endStuds", "rightCount"])}
              onChange={(event) =>
                onValueChange(
                  ["framing", "endStuds", "rightCount"],
                  parseNumberInput(event.target.value),
                )
              }
            />
          </Field>
          <Field
            label="Jamb studs per side"
            error={validatePositiveInteger(
              readValue(state, ["framing", "jambStuds", "countPerSide"]),
              "Jamb studs per side",
            )}
          >
            <Input
              type="number"
              value={readNumericInputValue(state, ["framing", "jambStuds", "countPerSide"])}
              onChange={(event) =>
                onValueChange(
                  ["framing", "jambStuds", "countPerSide"],
                  parseNumberInput(event.target.value),
                )
              }
            />
          </Field>
          <Field
            label="Left jamb offset"
            error={validateNumberValue(
              readValue(state, ["framing", "jambStuds", "leftOffset"]),
              "Left jamb offset",
            )}
          >
            <Input
              type="number"
              value={readNumericInputValue(state, ["framing", "jambStuds", "leftOffset"])}
              onChange={(event) =>
                onValueChange(
                  ["framing", "jambStuds", "leftOffset"],
                  parseNumberInput(event.target.value),
                )
              }
            />
          </Field>
        </FieldGrid>

        <FieldGrid>
          <Field
            label="Stud spacing"
            error={validatePositiveInteger(
              readValue(state, ["framing", "studLayout", "spacing"]),
              "Stud spacing",
            )}
          >
            <Input
              type="number"
              value={readNumericInputValue(state, ["framing", "studLayout", "spacing"])}
              onChange={(event) =>
                onValueChange(
                  ["framing", "studLayout", "spacing"],
                  parseNumberInput(event.target.value),
                )
              }
            />
          </Field>
          <Field label="Stud layout origin side">
            <Select
              value={readSelectValue(
                state,
                ["framing", "studLayout", "originSide"],
                WALL_EDGE_OPTIONS,
              )}
              onValueChange={(value) =>
                onValueChange(["framing", "studLayout", "originSide"], value)
              }
            >
              <SelectTrigger aria-label="Stud layout origin side">
                <SelectValue>
                  {WALL_EDGE_OPTIONS.find(
                    (option) =>
                      option.value ===
                      readSelectValue(
                        state,
                        ["framing", "studLayout", "originSide"],
                        WALL_EDGE_OPTIONS,
                      ),
                  )?.label ?? "Select origin side"}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup>
                {WALL_EDGE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </Field>
          <Field label="Stud layout direction">
            <Select
              value={readSelectValue(
                state,
                ["framing", "studLayout", "direction"],
                WALL_DIRECTION_OPTIONS,
              )}
              onValueChange={(value) =>
                onValueChange(["framing", "studLayout", "direction"], value)
              }
            >
              <SelectTrigger aria-label="Stud layout direction">
                <SelectValue>
                  {WALL_DIRECTION_OPTIONS.find(
                    (option) =>
                      option.value ===
                      readSelectValue(
                        state,
                        ["framing", "studLayout", "direction"],
                        WALL_DIRECTION_OPTIONS,
                      ),
                  )?.label ?? "Select direction"}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup>
                {WALL_DIRECTION_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </Field>
          <Field
            label="Stop-before threshold"
            description="Distance threshold before the next bearing stud."
            error={validatePositiveInteger(
              readValue(state, ["framing", "studLayout", "stopBeforeNextBearingStudWithinOrEqual"]),
              "Stop-before threshold",
            )}
          >
            <Input
              type="number"
              value={readNumericInputValue(state, [
                "framing",
                "studLayout",
                "stopBeforeNextBearingStudWithinOrEqual",
              ])}
              onChange={(event) =>
                onValueChange(
                  ["framing", "studLayout", "stopBeforeNextBearingStudWithinOrEqual"],
                  parseNumberInput(event.target.value),
                )
              }
            />
          </Field>
        </FieldGrid>

        <FieldGrid>
          <ToggleField
            label="Top plate enabled"
            description="Include the top plate in framing output."
            checked={readBooleanValue(state, ["framing", "plates", "top", "enabled"])}
            onCheckedChange={(checked) =>
              onValueChange(["framing", "plates", "top", "enabled"], checked)
            }
          />
          <ToggleField
            label="Bottom plate enabled"
            description="Include the bottom plate in framing output."
            checked={readBooleanValue(state, ["framing", "plates", "bottom", "enabled"])}
            onCheckedChange={(checked) =>
              onValueChange(["framing", "plates", "bottom", "enabled"], checked)
            }
          />
          <ToggleField
            label="Stud layout enabled"
            description="Automatically lay out common studs from the chosen origin and spacing."
            checked={readBooleanValue(state, ["framing", "studLayout", "enabled"])}
            onCheckedChange={(checked) =>
              onValueChange(["framing", "studLayout", "enabled"], checked)
            }
          />
          <ToggleField
            label="Preserve clear openings"
            description="Keep jamb stud placement from shrinking architectural openings."
            checked={readBooleanValue(state, ["framing", "jambStuds", "preserveClearOpenings"])}
            onCheckedChange={(checked) =>
              onValueChange(["framing", "jambStuds", "preserveClearOpenings"], checked)
            }
          />
          <ToggleField
            label="Clear architectural openings"
            description="Do not let framing members occupy the finished opening width and height."
            checked={readBooleanValue(state, ["framing", "openings", "clearArchitecturalOpenings"])}
            onCheckedChange={(checked) =>
              onValueChange(["framing", "openings", "clearArchitecturalOpenings"], checked)
            }
          />
          <ToggleField
            label="Add window head members"
            description="Place headers above window openings."
            checked={readBooleanValue(state, ["framing", "openings", "headMember", "windows"])}
            onCheckedChange={(checked) =>
              onValueChange(["framing", "openings", "headMember", "windows"], checked)
            }
          />
          <ToggleField
            label="Add door head members"
            description="Place headers above door openings."
            checked={readBooleanValue(state, ["framing", "openings", "headMember", "doors"])}
            onCheckedChange={(checked) =>
              onValueChange(["framing", "openings", "headMember", "doors"], checked)
            }
          />
          <ToggleField
            label="Add window sill members"
            description="Place sill members under window openings."
            checked={readBooleanValue(state, ["framing", "openings", "sillMember", "windows"])}
            onCheckedChange={(checked) =>
              onValueChange(["framing", "openings", "sillMember", "windows"], checked)
            }
          />
          <ToggleField
            label="Add door sill members"
            description="Place sill members under door openings when needed."
            checked={readBooleanValue(state, ["framing", "openings", "sillMember", "doors"])}
            onCheckedChange={(checked) =>
              onValueChange(["framing", "openings", "sillMember", "doors"], checked)
            }
          />
          <ToggleField
            label="Cripple studs above heads"
            description="Fill the space above headers with cripple studs."
            checked={readBooleanValue(state, ["framing", "crippleStuds", "aboveHeads"])}
            onCheckedChange={(checked) =>
              onValueChange(["framing", "crippleStuds", "aboveHeads"], checked)
            }
          />
          <ToggleField
            label="Cripple studs below sills"
            description="Fill the space below window sills with cripple studs."
            checked={readBooleanValue(state, ["framing", "crippleStuds", "belowWindowSills"])}
            onCheckedChange={(checked) =>
              onValueChange(["framing", "crippleStuds", "belowWindowSills"], checked)
            }
          />
          <ToggleField
            label="Split grid studs inside openings"
            description="Split common studs instead of drawing continuous members through openings."
            checked={readBooleanValue(state, [
              "framing",
              "crippleStuds",
              "splitGridStudsInsideOpenings",
            ])}
            onCheckedChange={(checked) =>
              onValueChange(["framing", "crippleStuds", "splitGridStudsInsideOpenings"], checked)
            }
          />
          <ToggleField
            label="Include member schedule"
            description="Render a member schedule on framing layouts."
            checked={readBooleanValue(state, ["framing", "labeling", "includeMemberSchedule"])}
            onCheckedChange={(checked) =>
              onValueChange(["framing", "labeling", "includeMemberSchedule"], checked)
            }
          />
          <ToggleField
            label="Include stud center schedule"
            description="Render common stud centerline positions on framing layouts."
            checked={readBooleanValue(state, ["framing", "labeling", "includeStudCenterSchedule"])}
            onCheckedChange={(checked) =>
              onValueChange(["framing", "labeling", "includeStudCenterSchedule"], checked)
            }
          />
        </FieldGrid>
      </SectionCard>

      <SectionCard
        id="cut2kit-settings-sheathing"
        title="Sheathing"
        description="Panel stock, sheet layout, and page-generation settings used for OSB layout output."
      >
        <ToggleField
          label="Enable sheathing generation"
          description="Allow Cut2Kit to produce OSB sheet layout artifacts and PDFs."
          checked={readBooleanValue(state, ["sheathing", "enabled"])}
          onCheckedChange={(checked) => onValueChange(["sheathing", "enabled"], checked)}
        />

        <FieldGrid>
          <Field
            label="Material label"
            error={validateRequiredString(
              readValue(state, ["sheathing", "materialLabel"]),
              "Material label",
            )}
          >
            <Input
              value={readStringValue(state, ["sheathing", "materialLabel"])}
              onChange={(event) =>
                onValueChange(["sheathing", "materialLabel"], event.target.value)
              }
            />
          </Field>
          <Field
            label="Panel thickness"
            error={validateNumberValue(
              readValue(state, ["sheathing", "panelThickness"]),
              "Panel thickness",
            )}
          >
            <Input
              type="number"
              value={readNumericInputValue(state, ["sheathing", "panelThickness"])}
              onChange={(event) =>
                onValueChange(["sheathing", "panelThickness"], parseNumberInput(event.target.value))
              }
            />
          </Field>
          <Field
            label="Sheet width"
            error={validatePositiveInteger(
              readValue(state, ["sheathing", "sheet", "nominalWidth"]),
              "Sheet width",
            )}
          >
            <Input
              type="number"
              value={readNumericInputValue(state, ["sheathing", "sheet", "nominalWidth"])}
              onChange={(event) =>
                onValueChange(
                  ["sheathing", "sheet", "nominalWidth"],
                  parseNumberInput(event.target.value),
                )
              }
            />
          </Field>
          <Field
            label="Sheet height"
            error={validatePositiveInteger(
              readValue(state, ["sheathing", "sheet", "nominalHeight"]),
              "Sheet height",
            )}
          >
            <Input
              type="number"
              value={readNumericInputValue(state, ["sheathing", "sheet", "nominalHeight"])}
              onChange={(event) =>
                onValueChange(
                  ["sheathing", "sheet", "nominalHeight"],
                  parseNumberInput(event.target.value),
                )
              }
            />
          </Field>
          <Field label="Installed orientation">
            <Select
              value={readSelectValue(
                state,
                ["sheathing", "sheet", "installedOrientation"],
                SHEET_ORIENTATION_OPTIONS,
              )}
              onValueChange={(value) =>
                onValueChange(["sheathing", "sheet", "installedOrientation"], value)
              }
            >
              <SelectTrigger aria-label="Installed orientation">
                <SelectValue>
                  {SHEET_ORIENTATION_OPTIONS.find(
                    (option) =>
                      option.value ===
                      readSelectValue(
                        state,
                        ["sheathing", "sheet", "installedOrientation"],
                        SHEET_ORIENTATION_OPTIONS,
                      ),
                  )?.label ?? "Select orientation"}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup>
                {SHEET_ORIENTATION_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </Field>
          <Field label="Run direction">
            <Select
              value={readSelectValue(
                state,
                ["sheathing", "sheet", "runDirection"],
                WALL_DIRECTION_OPTIONS,
              )}
              onValueChange={(value) =>
                onValueChange(["sheathing", "sheet", "runDirection"], value)
              }
            >
              <SelectTrigger aria-label="Sheathing run direction">
                <SelectValue>
                  {WALL_DIRECTION_OPTIONS.find(
                    (option) =>
                      option.value ===
                      readSelectValue(
                        state,
                        ["sheathing", "sheet", "runDirection"],
                        WALL_DIRECTION_OPTIONS,
                      ),
                  )?.label ?? "Select direction"}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup>
                {WALL_DIRECTION_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </Field>
          <Field
            label="Panel edge gap"
            error={validateNumberValue(
              readValue(state, ["sheathing", "notes", "panelEdgeGap"]),
              "Panel edge gap",
            )}
          >
            <Input
              type="number"
              value={readNumericInputValue(state, ["sheathing", "notes", "panelEdgeGap"])}
              onChange={(event) =>
                onValueChange(
                  ["sheathing", "notes", "panelEdgeGap"],
                  parseNumberInput(event.target.value),
                )
              }
            />
          </Field>
        </FieldGrid>

        <FieldGrid>
          <ToggleField
            label="Allow terminal rip"
            description="Permit the final sheet in a run to be ripped to width."
            checked={readBooleanValue(state, ["sheathing", "sheet", "allowTerminalRip"])}
            onCheckedChange={(checked) =>
              onValueChange(["sheathing", "sheet", "allowTerminalRip"], checked)
            }
          />
          <ToggleField
            label="Keep openings uncovered"
            description="Exclude door and window openings from panel coverage."
            checked={readBooleanValue(state, ["sheathing", "openingsRemainUncovered"])}
            onCheckedChange={(checked) =>
              onValueChange(["sheathing", "openingsRemainUncovered"], checked)
            }
          />
          <ToggleField
            label="Include overall layout page"
            description="Render a first-page overall sheathing layout."
            checked={readBooleanValue(state, ["sheathing", "pages", "includeOverallLayoutPage"])}
            onCheckedChange={(checked) =>
              onValueChange(["sheathing", "pages", "includeOverallLayoutPage"], checked)
            }
          />
          <ToggleField
            label="Include per-sheet cutout pages"
            description="Render detail pages for each sheet cutout."
            checked={readBooleanValue(state, ["sheathing", "pages", "includePerSheetCutoutPages"])}
            onCheckedChange={(checked) =>
              onValueChange(["sheathing", "pages", "includePerSheetCutoutPages"], checked)
            }
          />
          <ToggleField
            label="Include disclaimer note"
            description="Add the standard sheathing disclaimer to the generated notes."
            checked={readBooleanValue(state, ["sheathing", "notes", "includeDisclaimer"])}
            onCheckedChange={(checked) =>
              onValueChange(["sheathing", "notes", "includeDisclaimer"], checked)
            }
          />
        </FieldGrid>

        <div className="rounded-xl border border-dashed border-border/70 bg-background/40 p-3">
          <p className="text-sm font-medium text-foreground">Supported edge behavior</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {readStringValue(state, ["sheathing", "notes", "supportedEdgeBehavior"])}
          </p>
        </div>
      </SectionCard>

      <SectionCard
        id="cut2kit-settings-fastening"
        title="Fastening"
        description="Reference fastening notes that accompany the generated sheathing layouts."
      >
        <FieldGrid columns="compact">
          <Field
            label="Supported edge spacing"
            error={validatePositiveInteger(
              readValue(state, ["fastening", "supportedEdgeSpacing"]),
              "Supported edge spacing",
            )}
          >
            <Input
              type="number"
              value={readNumericInputValue(state, ["fastening", "supportedEdgeSpacing"])}
              onChange={(event) =>
                onValueChange(
                  ["fastening", "supportedEdgeSpacing"],
                  parseNumberInput(event.target.value),
                )
              }
            />
          </Field>
          <Field
            label="Field spacing"
            error={validatePositiveInteger(
              readValue(state, ["fastening", "fieldSpacing"]),
              "Field spacing",
            )}
          >
            <Input
              type="number"
              value={readNumericInputValue(state, ["fastening", "fieldSpacing"])}
              onChange={(event) =>
                onValueChange(["fastening", "fieldSpacing"], parseNumberInput(event.target.value))
              }
            />
          </Field>
          <Field
            label="Edge distance"
            error={validateNumberValue(
              readValue(state, ["fastening", "edgeDistance"]),
              "Edge distance",
            )}
          >
            <Input
              type="number"
              value={readNumericInputValue(state, ["fastening", "edgeDistance"])}
              onChange={(event) =>
                onValueChange(["fastening", "edgeDistance"], parseNumberInput(event.target.value))
              }
            />
          </Field>
        </FieldGrid>

        <FieldGrid>
          <ToggleField
            label="Enable fastening reference"
            description="Keep fastening notes active in the workflow."
            checked={readBooleanValue(state, ["fastening", "enabled"])}
            onCheckedChange={(checked) => onValueChange(["fastening", "enabled"], checked)}
          />
          <ToggleField
            label="Include fastening page"
            description="Render a dedicated fastening reference page."
            checked={readBooleanValue(state, ["fastening", "includePage"])}
            onCheckedChange={(checked) => onValueChange(["fastening", "includePage"], checked)}
          />
          <ToggleField
            label="Typical reference only"
            description="Treat the fastening page as guidance, not an engineered fastening plan."
            checked={readBooleanValue(state, ["fastening", "typicalReferenceOnly"])}
            onCheckedChange={(checked) =>
              onValueChange(["fastening", "typicalReferenceOnly"], checked)
            }
          />
          <ToggleField
            label="Include overdriving warning"
            description="Add a note warning against overdriven fasteners."
            checked={readBooleanValue(state, ["fastening", "includeOverdrivingWarning"])}
            onCheckedChange={(checked) =>
              onValueChange(["fastening", "includeOverdrivingWarning"], checked)
            }
          />
        </FieldGrid>

        <Field
          label="Disclaimer text"
          error={validateRequiredString(
            readValue(state, ["fastening", "disclaimerText"]),
            "Disclaimer text",
          )}
        >
          <Textarea
            value={readStringValue(state, ["fastening", "disclaimerText"])}
            onChange={(event) => onValueChange(["fastening", "disclaimerText"], event.target.value)}
          />
        </Field>

        <StringListEditor
          label="Note lines"
          description="Short fastening notes rendered on the fastening page."
          values={noteLines}
          addLabel="Add note"
          itemLabel="Note"
          error={validateOptionalStringList(noteLines)}
          onAdd={() => onValueChange(["fastening", "noteLines"], [...noteLines, ""])}
          onRemove={(index) =>
            onValueChange(
              ["fastening", "noteLines"],
              noteLines.filter((_, candidateIndex) => candidateIndex !== index),
            )
          }
          onChange={(index, nextValue) =>
            onValueChange(
              ["fastening", "noteLines"],
              noteLines.map((value, candidateIndex) =>
                candidateIndex === index ? nextValue : value,
              ),
            )
          }
        />
      </SectionCard>

      <SectionCard
        id="cut2kit-settings-rendering"
        title="Rendering"
        description="Layout page, margin, and title-template settings for framing and sheathing PDFs."
      >
        <FieldGrid>
          <Field label="Rendering units">
            <Select
              value={readSelectValue(state, ["rendering", "units"], NC_UNIT_OPTIONS)}
              onValueChange={(value) => onValueChange(["rendering", "units"], value)}
            >
              <SelectTrigger aria-label="Rendering units">
                <SelectValue>
                  {NC_UNIT_OPTIONS.find(
                    (option) =>
                      option.value ===
                      readSelectValue(state, ["rendering", "units"], NC_UNIT_OPTIONS),
                  )?.label ?? "Select units"}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup>
                {NC_UNIT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </Field>
          <Field label="Dimension format">
            <Select
              value={readSelectValue(
                state,
                ["rendering", "dimensionFormat"],
                DIMENSION_FORMAT_OPTIONS,
              )}
              onValueChange={(value) => onValueChange(["rendering", "dimensionFormat"], value)}
            >
              <SelectTrigger aria-label="Dimension format">
                <SelectValue>
                  {DIMENSION_FORMAT_OPTIONS.find(
                    (option) =>
                      option.value ===
                      readSelectValue(
                        state,
                        ["rendering", "dimensionFormat"],
                        DIMENSION_FORMAT_OPTIONS,
                      ),
                  )?.label ?? "Select format"}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup>
                {DIMENSION_FORMAT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </Field>
        </FieldGrid>

        <div className="space-y-4 rounded-xl border border-border/70 bg-background/40 p-3">
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">Framing PDF</p>
            <p className="text-xs text-muted-foreground">
              Page size, margins, and title formatting for framing layout output.
            </p>
          </div>
          <FieldGrid>
            <Field label="Page size">
              <Select
                value={readSelectValue(
                  state,
                  ["rendering", "framing", "pageSize"],
                  PAGE_SIZE_OPTIONS,
                )}
                onValueChange={(value) =>
                  onValueChange(["rendering", "framing", "pageSize"], value)
                }
              >
                <SelectTrigger aria-label="Framing page size">
                  <SelectValue>
                    {PAGE_SIZE_OPTIONS.find(
                      (option) =>
                        option.value ===
                        readSelectValue(
                          state,
                          ["rendering", "framing", "pageSize"],
                          PAGE_SIZE_OPTIONS,
                        ),
                    )?.label ?? "Select page size"}
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup>
                  {PAGE_SIZE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            </Field>
            <Field label="Orientation">
              <Select
                value={readSelectValue(
                  state,
                  ["rendering", "framing", "pageOrientation"],
                  PAGE_ORIENTATION_OPTIONS,
                )}
                onValueChange={(value) =>
                  onValueChange(["rendering", "framing", "pageOrientation"], value)
                }
              >
                <SelectTrigger aria-label="Framing page orientation">
                  <SelectValue>
                    {PAGE_ORIENTATION_OPTIONS.find(
                      (option) =>
                        option.value ===
                        readSelectValue(
                          state,
                          ["rendering", "framing", "pageOrientation"],
                          PAGE_ORIENTATION_OPTIONS,
                        ),
                    )?.label ?? "Select orientation"}
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup>
                  {PAGE_ORIENTATION_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            </Field>
            <Field
              label="Margin left"
              error={validateNumberValue(
                readValue(state, ["rendering", "framing", "margins", "left"]),
                "Margin left",
              )}
            >
              <Input
                type="number"
                value={readNumericInputValue(state, ["rendering", "framing", "margins", "left"])}
                onChange={(event) =>
                  onValueChange(
                    ["rendering", "framing", "margins", "left"],
                    parseNumberInput(event.target.value),
                  )
                }
              />
            </Field>
            <Field
              label="Margin right"
              error={validateNumberValue(
                readValue(state, ["rendering", "framing", "margins", "right"]),
                "Margin right",
              )}
            >
              <Input
                type="number"
                value={readNumericInputValue(state, ["rendering", "framing", "margins", "right"])}
                onChange={(event) =>
                  onValueChange(
                    ["rendering", "framing", "margins", "right"],
                    parseNumberInput(event.target.value),
                  )
                }
              />
            </Field>
            <Field
              label="Margin top"
              error={validateNumberValue(
                readValue(state, ["rendering", "framing", "margins", "top"]),
                "Margin top",
              )}
            >
              <Input
                type="number"
                value={readNumericInputValue(state, ["rendering", "framing", "margins", "top"])}
                onChange={(event) =>
                  onValueChange(
                    ["rendering", "framing", "margins", "top"],
                    parseNumberInput(event.target.value),
                  )
                }
              />
            </Field>
            <Field
              label="Margin bottom"
              error={validateNumberValue(
                readValue(state, ["rendering", "framing", "margins", "bottom"]),
                "Margin bottom",
              )}
            >
              <Input
                type="number"
                value={readNumericInputValue(state, ["rendering", "framing", "margins", "bottom"])}
                onChange={(event) =>
                  onValueChange(
                    ["rendering", "framing", "margins", "bottom"],
                    parseNumberInput(event.target.value),
                  )
                }
              />
            </Field>
          </FieldGrid>
          <FieldGrid>
            <ToggleField
              label="Include member schedule"
              description="Duplicate the framing member schedule setting in the rendered PDF output."
              checked={readBooleanValue(state, ["rendering", "framing", "includeMemberSchedule"])}
              onCheckedChange={(checked) =>
                onValueChange(["rendering", "framing", "includeMemberSchedule"], checked)
              }
            />
          </FieldGrid>
          <FieldGrid>
            <Field
              label="Title template"
              error={validateRequiredString(
                readValue(state, ["rendering", "framing", "titleTemplate"]),
                "Title template",
              )}
            >
              <Input
                value={readStringValue(state, ["rendering", "framing", "titleTemplate"])}
                onChange={(event) =>
                  onValueChange(["rendering", "framing", "titleTemplate"], event.target.value)
                }
              />
            </Field>
            <Field
              label="Subtitle template"
              error={validateRequiredString(
                readValue(state, ["rendering", "framing", "subtitleTemplate"]),
                "Subtitle template",
              )}
            >
              <Input
                value={readStringValue(state, ["rendering", "framing", "subtitleTemplate"])}
                onChange={(event) =>
                  onValueChange(["rendering", "framing", "subtitleTemplate"], event.target.value)
                }
              />
            </Field>
          </FieldGrid>
        </div>

        <div className="space-y-4 rounded-xl border border-border/70 bg-background/40 p-3">
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">Sheathing PDF</p>
            <p className="text-xs text-muted-foreground">
              Page size, margins, and title formatting for sheathing and fastening output.
            </p>
          </div>
          <FieldGrid>
            <Field label="Page size">
              <Select
                value={readSelectValue(
                  state,
                  ["rendering", "sheathing", "pageSize"],
                  PAGE_SIZE_OPTIONS,
                )}
                onValueChange={(value) =>
                  onValueChange(["rendering", "sheathing", "pageSize"], value)
                }
              >
                <SelectTrigger aria-label="Sheathing page size">
                  <SelectValue>
                    {PAGE_SIZE_OPTIONS.find(
                      (option) =>
                        option.value ===
                        readSelectValue(
                          state,
                          ["rendering", "sheathing", "pageSize"],
                          PAGE_SIZE_OPTIONS,
                        ),
                    )?.label ?? "Select page size"}
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup>
                  {PAGE_SIZE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            </Field>
            <Field label="Orientation">
              <Select
                value={readSelectValue(
                  state,
                  ["rendering", "sheathing", "pageOrientation"],
                  PAGE_ORIENTATION_OPTIONS,
                )}
                onValueChange={(value) =>
                  onValueChange(["rendering", "sheathing", "pageOrientation"], value)
                }
              >
                <SelectTrigger aria-label="Sheathing page orientation">
                  <SelectValue>
                    {PAGE_ORIENTATION_OPTIONS.find(
                      (option) =>
                        option.value ===
                        readSelectValue(
                          state,
                          ["rendering", "sheathing", "pageOrientation"],
                          PAGE_ORIENTATION_OPTIONS,
                        ),
                    )?.label ?? "Select orientation"}
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup>
                  {PAGE_ORIENTATION_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            </Field>
            <Field
              label="Margin left"
              error={validateNumberValue(
                readValue(state, ["rendering", "sheathing", "margins", "left"]),
                "Margin left",
              )}
            >
              <Input
                type="number"
                value={readNumericInputValue(state, ["rendering", "sheathing", "margins", "left"])}
                onChange={(event) =>
                  onValueChange(
                    ["rendering", "sheathing", "margins", "left"],
                    parseNumberInput(event.target.value),
                  )
                }
              />
            </Field>
            <Field
              label="Margin right"
              error={validateNumberValue(
                readValue(state, ["rendering", "sheathing", "margins", "right"]),
                "Margin right",
              )}
            >
              <Input
                type="number"
                value={readNumericInputValue(state, ["rendering", "sheathing", "margins", "right"])}
                onChange={(event) =>
                  onValueChange(
                    ["rendering", "sheathing", "margins", "right"],
                    parseNumberInput(event.target.value),
                  )
                }
              />
            </Field>
            <Field
              label="Margin top"
              error={validateNumberValue(
                readValue(state, ["rendering", "sheathing", "margins", "top"]),
                "Margin top",
              )}
            >
              <Input
                type="number"
                value={readNumericInputValue(state, ["rendering", "sheathing", "margins", "top"])}
                onChange={(event) =>
                  onValueChange(
                    ["rendering", "sheathing", "margins", "top"],
                    parseNumberInput(event.target.value),
                  )
                }
              />
            </Field>
            <Field
              label="Margin bottom"
              error={validateNumberValue(
                readValue(state, ["rendering", "sheathing", "margins", "bottom"]),
                "Margin bottom",
              )}
            >
              <Input
                type="number"
                value={readNumericInputValue(state, [
                  "rendering",
                  "sheathing",
                  "margins",
                  "bottom",
                ])}
                onChange={(event) =>
                  onValueChange(
                    ["rendering", "sheathing", "margins", "bottom"],
                    parseNumberInput(event.target.value),
                  )
                }
              />
            </Field>
            <Field
              label="Cutout details per page"
              error={validatePositiveInteger(
                readValue(state, ["rendering", "sheathing", "cutoutDetailsPerPage"]),
                "Cutout details per page",
              )}
            >
              <Input
                type="number"
                value={readNumericInputValue(state, [
                  "rendering",
                  "sheathing",
                  "cutoutDetailsPerPage",
                ])}
                onChange={(event) =>
                  onValueChange(
                    ["rendering", "sheathing", "cutoutDetailsPerPage"],
                    parseNumberInput(event.target.value),
                  )
                }
              />
            </Field>
          </FieldGrid>
          <FieldGrid>
            <ToggleField
              label="Scale to fit first page"
              description="Fit the overall sheathing layout onto the first page."
              checked={readBooleanValue(state, ["rendering", "sheathing", "scaleToFitFirstPage"])}
              onCheckedChange={(checked) =>
                onValueChange(["rendering", "sheathing", "scaleToFitFirstPage"], checked)
              }
            />
          </FieldGrid>
          <FieldGrid>
            <Field
              label="Title template"
              error={validateRequiredString(
                readValue(state, ["rendering", "sheathing", "titleTemplate"]),
                "Title template",
              )}
            >
              <Input
                value={readStringValue(state, ["rendering", "sheathing", "titleTemplate"])}
                onChange={(event) =>
                  onValueChange(["rendering", "sheathing", "titleTemplate"], event.target.value)
                }
              />
            </Field>
            <Field
              label="Subtitle template"
              error={validateRequiredString(
                readValue(state, ["rendering", "sheathing", "subtitleTemplate"]),
                "Subtitle template",
              )}
            >
              <Input
                value={readStringValue(state, ["rendering", "sheathing", "subtitleTemplate"])}
                onChange={(event) =>
                  onValueChange(["rendering", "sheathing", "subtitleTemplate"], event.target.value)
                }
              />
            </Field>
            <Field
              label="Fastening title template"
              error={validateRequiredString(
                readValue(state, ["rendering", "sheathing", "fasteningTitleTemplate"]),
                "Fastening title template",
              )}
            >
              <Input
                value={readStringValue(state, ["rendering", "sheathing", "fasteningTitleTemplate"])}
                onChange={(event) =>
                  onValueChange(
                    ["rendering", "sheathing", "fasteningTitleTemplate"],
                    event.target.value,
                  )
                }
              />
            </Field>
          </FieldGrid>
        </div>
      </SectionCard>

      <SectionCard
        id="cut2kit-settings-output"
        title="Output"
        description="Final output directories and overwrite policy for generated manufacturing assets."
      >
        <FieldGrid>
          <Field
            label="Output root"
            error={validateRequiredString(readValue(state, ["output", "root"]), "Output root")}
          >
            <Input
              value={readStringValue(state, ["output", "root"])}
              onChange={(event) => onValueChange(["output", "root"], event.target.value)}
            />
          </Field>
          <Field
            label="Manifests directory"
            error={validateRequiredString(
              readValue(state, ["output", "manifestsDir"]),
              "Manifests directory",
            )}
          >
            <Input
              value={readStringValue(state, ["output", "manifestsDir"])}
              onChange={(event) => onValueChange(["output", "manifestsDir"], event.target.value)}
            />
          </Field>
          <Field
            label="NC directory"
            error={validateRequiredString(readValue(state, ["output", "ncDir"]), "NC directory")}
          >
            <Input
              value={readStringValue(state, ["output", "ncDir"])}
              onChange={(event) => onValueChange(["output", "ncDir"], event.target.value)}
            />
          </Field>
          <Field
            label="Reports directory"
            error={validateRequiredString(
              readValue(state, ["output", "reportsDir"]),
              "Reports directory",
            )}
          >
            <Input
              value={readStringValue(state, ["output", "reportsDir"])}
              onChange={(event) => onValueChange(["output", "reportsDir"], event.target.value)}
            />
          </Field>
          <Field label="Overwrite policy">
            <Select
              value={readSelectValue(
                state,
                ["output", "overwritePolicy"],
                OVERWRITE_POLICY_OPTIONS,
              )}
              onValueChange={(value) => onValueChange(["output", "overwritePolicy"], value)}
            >
              <SelectTrigger aria-label="Overwrite policy">
                <SelectValue>
                  {OVERWRITE_POLICY_OPTIONS.find(
                    (option) =>
                      option.value ===
                      readSelectValue(
                        state,
                        ["output", "overwritePolicy"],
                        OVERWRITE_POLICY_OPTIONS,
                      ),
                  )?.label ?? "Select overwrite policy"}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup>
                {OVERWRITE_POLICY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </Field>
        </FieldGrid>
      </SectionCard>

      <SectionCard
        id="cut2kit-settings-advanced-json"
        title="Advanced JSON"
        description="Fallback editor for fields that are not yet represented cleanly in the v1 form."
      >
        <Collapsible defaultOpen={false}>
          <div className="rounded-xl border border-border/70 bg-background/40">
            <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">Open raw JSON draft</p>
                <p className="text-xs text-muted-foreground">
                  Edit the current in-memory draft directly, then apply it back into the form.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {isAdvancedJsonDirty ? <Badge variant="warning">Unsynced JSON edits</Badge> : null}
                <ChevronDownIcon className="size-4 text-muted-foreground transition-transform in-data-open:rotate-180" />
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="space-y-3 border-t border-border/70 px-4 py-4">
                <Textarea
                  className="min-h-64 font-mono text-sm"
                  value={advancedJsonText}
                  onChange={(event) => onAdvancedJsonTextChange(event.target.value)}
                />
                {advancedJsonErrorMessage ? (
                  <p className="text-destructive text-xs">{advancedJsonErrorMessage}</p>
                ) : null}
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" onClick={onResetAdvancedJsonToDraft}>
                    Reset JSON to Draft
                  </Button>
                  <Button onClick={onApplyAdvancedJson}>Apply JSON to Draft</Button>
                </div>
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>
      </SectionCard>
    </div>
  );
}
