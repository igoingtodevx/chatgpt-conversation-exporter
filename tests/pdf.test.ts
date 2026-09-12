import { describe, expect, it } from "vitest";
import { pdfSafeText } from "../src/exporters/pdf";

describe("PDF text normalization", () => {
  it("replaces unsupported arrows and status glyphs without changing ordinary text", () => {
    expect(pdfSafeText("ChatGPT → Extension ← Browser ↔ Agent ⇒ Done ⇐ Back ✓ ✗")).toBe(
      "ChatGPT -> Extension <- Browser <-> Agent => Done <= Back [check] [x]"
    );
    expect(pdfSafeText("ÄÖÜ äöü ß — ‘quotes’")).toBe("ÄÖÜ äöü ß — ‘quotes’");
  });
});
