import { describe, expect, it } from "vitest";
import { buildMockKit } from "@/lib/pipeline/mock";
import {
  emptyEditMetadata,
  markQuestionEdited,
  mergeRegeneratedKit,
} from "./preservation";

describe("kit preservation", () => {
  it("keeps user-edited questions and tracks skipped generated replacements", () => {
    const original = buildMockKit({
      jd: "Senior Engineer\nRequired: 5+ years with React",
      company_url: "https://example.com",
      days: 2,
    });
    const current = {
      ...original,
      questions: original.questions.map((question) =>
        question.id === "q1"
          ? { ...question, prompt: "My edited prompt" }
          : question,
      ),
    };
    const regenerated = {
      ...original,
      questions: original.questions.map((question) =>
        question.id === "q1"
          ? { ...question, prompt: "New generated prompt" }
          : question,
      ),
    };
    const metadata = markQuestionEdited(emptyEditMetadata, "q1", "prompt");
    const merged = mergeRegeneratedKit({
      currentKit: current,
      regeneratedKit: regenerated,
      metadata,
    });

    expect(merged.kit.questions[0]?.prompt).toBe("My edited prompt");
    expect(merged.metadata.skippedGeneratedIds).toContain("q1");
  });
});
