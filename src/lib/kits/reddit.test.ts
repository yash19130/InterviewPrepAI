import { describe, expect, it } from "vitest";
import { buildMockKit } from "@/lib/pipeline/mock";
import { getRedditInsight } from "./reddit";

describe("getRedditInsight", () => {
  it("reports no Reddit interview experiences when no Reddit source exists", () => {
    const kit = buildMockKit({
      jd: "Engineer\nMust know React.",
      company_url: "https://example.com",
      days: 1,
    });

    expect(getRedditInsight(kit)).toEqual({
      found: false,
      sources: [],
      message: "Didn't find interview experiences on Reddit.",
    });
  });

  it("returns deduplicated Reddit sources when discussion links exist", () => {
    const kit = buildMockKit({
      jd: "Engineer\nMust know React.",
      company_url: "https://example.com",
      days: 1,
    });
    const redditUrl = "https://www.reddit.com/r/interviews/comments/1/acme/";

    expect(
      getRedditInsight({
        ...kit,
        source: {
          ...kit.source,
          pages_used: [redditUrl],
        },
        company_brief: {
          ...kit.company_brief,
          sources: [redditUrl],
        },
      }),
    ).toEqual({
      found: true,
      sources: [redditUrl],
      message: "Found public Reddit interview discussion sources.",
    });
  });
});
