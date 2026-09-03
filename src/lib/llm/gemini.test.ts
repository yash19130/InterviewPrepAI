import { describe, expect, it } from "vitest";
import { parseJsonLike } from "./gemini";

describe("parseJsonLike", () => {
  it("parses direct JSON", () => {
    expect(parseJsonLike("{\"ok\":true}")).toEqual({ ok: true });
  });

  it("repairs fenced JSON responses locally", () => {
    expect(parseJsonLike("```json\n{\"ok\":true}\n```")).toEqual({ ok: true });
  });

  it("extracts JSON from prose wrappers", () => {
    expect(parseJsonLike("Here is the JSON: [{\"id\":\"r1\"}] Thanks")).toEqual([
      { id: "r1" },
    ]);
  });
});
