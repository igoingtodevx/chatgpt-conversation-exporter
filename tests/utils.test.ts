import { describe, expect, it } from "vitest";
import { exportBasename, sanitizeFilename } from "../src/shared/utils";

describe("filename utilities", () => {
  it("removes Windows-invalid characters", () => {
    expect(sanitizeFilename('A: chat / with * bad ? chars')).toBe("A- chat - with - bad - chars");
  });

  it("uses the requested dated ChatGPT filename", () => {
    expect(exportBasename("General Manager", "2026-09-12T16:10:00.000Z"))
      .toBe("2026-09-12 - ChatGPT - General Manager");
  });
});
