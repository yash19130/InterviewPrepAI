import { describe, expect, it } from "vitest";
import { createCoverage, getUncoveredMustRequirementIds } from "./coverage";
import type { Question, Requirement } from "@/lib/schemas";

const requirements: Requirement[] = [
  {
    id: "r1",
    text: "5+ years with React",
    kind: "technical",
    priority: "must",
  },
  {
    id: "r2",
    text: "Mentor junior engineers",
    kind: "behavioural",
    priority: "must",
  },
  {
    id: "r3",
    text: "GraphQL experience preferred",
    kind: "technical",
    priority: "nice",
  },
];

const questions: Question[] = [
  {
    id: "q1",
    requirement_ids: ["r1"],
    category: "technical",
    prompt: "How do you structure a React application?",
    answer_outline: "Discuss component boundaries and state.",
    difficulty: 2,
  },
];

describe("coverage", () => {
  it("reports uncovered must-have requirements and ignores nice-to-haves", () => {
    expect(getUncoveredMustRequirementIds(requirements, questions)).toEqual([
      "r2",
    ]);
  });

  it("returns coverage with the supplied pass count", () => {
    expect(createCoverage(requirements, questions, 2)).toEqual({
      uncovered_requirement_ids: ["r2"],
      passes: 2,
    });
  });
});
