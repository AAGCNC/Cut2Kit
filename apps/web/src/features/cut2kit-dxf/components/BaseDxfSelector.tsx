import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";

import { describeProjectDxfOption, type ProjectDxfOption } from "../lib/projectDxfFiles";

export function BaseDxfSelector(props: {
  options: ReadonlyArray<ProjectDxfOption>;
  selectedPath: string | null;
  onChange: (relativePath: string | null) => void;
}) {
  const { onChange, options, selectedPath } = props;

  return (
    <Select
      value={selectedPath ?? undefined}
      onValueChange={(value) => onChange(typeof value === "string" ? value : null)}
    >
      <SelectTrigger
        className="min-w-72 max-w-full bg-background/80 sm:max-w-96"
        disabled={options.length === 0}
        size="sm"
      >
        <SelectValue
          placeholder={options.length === 0 ? "No DXFs in project" : "Select base DXF"}
        />
      </SelectTrigger>
      <SelectPopup>
        {options.map((option) => (
          <SelectItem key={option.relativePath} value={option.relativePath}>
            <div className="min-w-0">
              <div className="truncate font-medium">{option.fileName}</div>
              <div className="truncate text-muted-foreground text-xs">
                {describeProjectDxfOption(option)}
              </div>
            </div>
          </SelectItem>
        ))}
      </SelectPopup>
    </Select>
  );
}
