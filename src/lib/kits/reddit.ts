import type { Kit } from "@/lib/schemas";

export type RedditInsight = {
  found: boolean;
  sources: string[];
  message: string;
};

export function getRedditInsight(kit: Kit): RedditInsight {
  const sources = Array.from(
    new Set(
      [...kit.company_brief.sources, ...kit.source.pages_used].filter((url) =>
        /(^https?:\/\/)?(www\.)?reddit\.com\//i.test(url),
      ),
    ),
  );

  if (sources.length === 0) {
    return {
      found: false,
      sources,
      message: "Didn't find interview experiences on Reddit.",
    };
  }

  return {
    found: true,
    sources,
    message: "Found public Reddit interview discussion sources.",
  };
}
