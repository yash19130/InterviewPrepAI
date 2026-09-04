import { describe, expect, it } from "vitest";
import { createSchedule } from "./schedule";
import type { Question, Requirement } from "@/lib/schemas";

const requirements: Requirement[] = [
  {
    id: "r1",
    text: "Required React experience",
    kind: "technical",
    priority: "must",
  },
  {
    id: "r2",
    text: "Must collaborate with product managers",
    kind: "behavioural",
    priority: "must",
  },
  {
    id: "r3",
    text: "GraphQL is a plus",
    kind: "technical",
    priority: "nice",
  },
];

const questions: Question[] = [
  {
    id: "q1",
    requirement_ids: ["r1"],
    category: "technical",
    prompt: "Explain React rendering tradeoffs.",
    answer_outline: "Discuss memoization and state boundaries.",
    difficulty: 3,
  },
  {
    id: "q2",
    requirement_ids: ["r2"],
    category: "behavioural",
    prompt: "Tell me about cross-functional collaboration.",
    answer_outline: "Use a concise STAR example.",
    difficulty: 2,
  },
  {
    id: "q3",
    requirement_ids: ["r3"],
    category: "technical",
    prompt: "Where does GraphQL fit?",
    answer_outline: "Compare with REST.",
    difficulty: 3,
  },
];

describe("schedule", () => {
  it("creates a normal multi-day schedule with must-have material first", () => {
    const schedule = createSchedule({
      daysAvailable: 3,
      requirements,
      questions,
    });

    expect(schedule.days_available).toBe(3);
    expect(schedule.days).toHaveLength(3);
    expect(schedule.days[0]?.question_ids).toEqual(["q1"]);
    expect(schedule.days[1]?.question_ids).toEqual(["q2"]);
    expect(schedule.days[2]?.question_ids).toEqual(["q3"]);
    expect(schedule.days[0]?.focus).toBe("Technical depth prep");
    expect(schedule.days[1]?.focus).toBe("Behavioral stories prep");
  });

  it("handles a thin JD with one requirement", () => {
    const schedule = createSchedule({
      daysAvailable: 5,
      requirements: [requirements[0]],
      questions: [questions[0]],
    });

    expect(schedule.days).toHaveLength(5);
    expect(schedule.days[0]?.question_ids).toEqual(["q1"]);
    expect(schedule.days.slice(1).every((day) => day.question_ids.length === 0)).toBe(
      true,
    );
  });

  it("puts all scheduled questions into one day for a 1-day plan", () => {
    const schedule = createSchedule({
      daysAvailable: 1,
      requirements,
      questions,
    });

    expect(schedule.days).toHaveLength(1);
    expect(schedule.days[0]?.question_ids).toEqual(["q1", "q2", "q3"]);
  });

  it("creates exactly 60 days and schedules every must-have requirement", () => {
    const schedule = createSchedule({
      daysAvailable: 60,
      requirements,
      questions,
    });

    const scheduledQuestionIds = new Set(
      schedule.days.flatMap((day) => day.question_ids),
    );

    expect(schedule.days).toHaveLength(60);
    expect(scheduledQuestionIds.has("q1")).toBe(true);
    expect(scheduledQuestionIds.has("q2")).toBe(true);
    expect(schedule.days[59]?.day).toBe(60);
  });
});
