import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PdfWorkspaceState } from "./PdfWorkspaceState";

describe("PdfWorkspaceState", () => {
  it("renders the loading state copy", () => {
    const markup = renderToStaticMarkup(
      <PdfWorkspaceState
        presentation={{
          kind: "loading",
          title: "Loading PDF",
          description: "Decoding elevations/front-wall.pdf for inline review.",
        }}
      />,
    );

    expect(markup).toContain("Loading PDF");
    expect(markup).toContain("Preparing the selected PDF for inline review.");
  });

  it("renders the error state copy", () => {
    const markup = renderToStaticMarkup(
      <PdfWorkspaceState
        presentation={{
          kind: "error",
          title: "Could not load PDF",
          description: "Invalid PDF header",
        }}
      />,
    );

    expect(markup).toContain("Could not load PDF");
    expect(markup).toContain("Invalid PDF header");
  });
});
