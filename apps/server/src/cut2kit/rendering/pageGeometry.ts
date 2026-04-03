export interface PageDimensions {
  width: number;
  height: number;
}

export interface Margins {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export function resolvePageDimensions(
  pageSize: "letter" | "a4",
  orientation: "landscape" | "portrait",
): PageDimensions {
  const portrait =
    pageSize === "a4" ? { width: 595.276, height: 841.89 } : { width: 612, height: 792 };
  return orientation === "landscape"
    ? { width: portrait.height, height: portrait.width }
    : portrait;
}

export function computeFitScale(input: {
  page: PageDimensions;
  margins: Margins;
  contentWidth: number;
  contentHeight: number;
}): number {
  const usableWidth = input.page.width - input.margins.left - input.margins.right;
  const usableHeight = input.page.height - input.margins.top - input.margins.bottom;
  return Math.min(usableWidth / input.contentWidth, usableHeight / input.contentHeight);
}

export function formatFeetAndInches(value: number): string {
  const whole = Math.round(value);
  const feet = Math.floor(whole / 12);
  const inches = whole % 12;
  return `${feet}'-${inches}"`;
}

export function formatDistance(
  value: number,
  dimensionFormat: "feet-and-inches" | "decimal-inch",
): string {
  if (dimensionFormat === "decimal-inch") {
    return `${value.toFixed(2)} in`;
  }
  return formatFeetAndInches(value);
}
