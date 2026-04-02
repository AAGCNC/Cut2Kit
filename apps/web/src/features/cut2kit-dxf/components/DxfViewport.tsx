import type { RefObject } from "react";

export function DxfViewport({ containerRef }: { containerRef: RefObject<HTMLDivElement | null> }) {
  return (
    <div className="absolute inset-0 overflow-hidden rounded-b-2xl">
      <div
        ref={containerRef}
        className="h-full w-full bg-[radial-gradient(circle_at_top,rgba(42,58,72,0.24),transparent_40%),linear-gradient(180deg,#0d131b,#090d13)]"
        data-cut2kit-dxf-viewport="true"
      />
    </div>
  );
}
