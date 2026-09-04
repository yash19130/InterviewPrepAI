import { describe, expect, it } from "vitest";
import { buildMockKit } from "@/lib/pipeline/mock";
import {
  emptyEditMetadata,
  markFlashcardEdited,
  markQuestionEdited,
  markScheduleEdited,
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

  it("keeps user-edited flashcards and schedule days across regeneration", () => {
    const original = buildMockKit({
      jd: "Senior Engineer\nRequired: 5+ years with React",
      company_url: "https://example.com",
      days: 2,
    });
    const current = {
      ...original,
      flashcards: original.flashcards.map((flashcard) =>
        flashcard.id === "f1" ? { ...flashcard, front: "My edited flashcard" } : flashcard,
      ),
      schedule: {
        ...original.schedule,
        days: original.schedule.days.map((day) =>
          day.day === 1 ? { ...day, focus: "My edited focus" } : day,
        ),
      },
    };
    const regenerated = {
      ...original,
      flashcards: original.flashcards.map((flashcard) =>
        flashcard.id === "f1" ? { ...flashcard, front: "Generated flashcard" } : flashcard,
      ),
      schedule: {
        ...original.schedule,
        days: original.schedule.days.map((day) =>
          day.day === 1 ? { ...day, focus: "Generated focus" } : day,
        ),
      },
    };
    const metadata = markScheduleEdited(
      markFlashcardEdited(emptyEditMetadata, "f1", "front"),
      1,
    );
    const merged = mergeRegeneratedKit({
      currentKit: current,
      regeneratedKit: regenerated,
      metadata,
    });

    expect(merged.kit.flashcards[0]?.front).toBe("My edited flashcard");
    expect(merged.kit.schedule.days[0]?.focus).toBe("My edited focus");
    expect(merged.metadata.skippedGeneratedIds).toEqual(
      expect.arrayContaining(["f1", "schedule.day.1"]),
    );
  });
});
