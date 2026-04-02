import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DxfViewportState } from "./DxfViewportState";

describe("DxfViewportState", () => {
  it("renders the loading state copy", () => {
    const markup = renderToStaticMarkup(
      <DxfViewportState
        presentation={{
          kind: "loading",
          title: "Loading DXF",
          description: "Parsing elevations/front-wall.dxf for viewport rendering.",
        }}
      />,
    );

    expect(markup).toContain("Loading DXF");
    expect(markup).toContain("Preparing the DXF viewport.");
  });

  it("renders the error state copy", () => {
    const markup = renderToStaticMarkup(
      <DxfViewportState
        presentation={{
          kind: "error",
          title: "DXF render failed",
          description: "Invalid DXF header",
        }}
      />,
    );

    expect(markup).toContain("DXF render failed");
    expect(markup).toContain("Invalid DXF header");
  });
});
