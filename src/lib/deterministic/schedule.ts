import type { Question, Requirement, Schedule } from "../schemas";

type ScheduleInput = {
  daysAvailable: number;
  requirements: Requirement[];
  questions: Question[];
};

export function createSchedule({
  daysAvailable,
  requirements,
  questions,
}: ScheduleInput): Schedule {
  if (!Number.isInteger(daysAvailable) || daysAvailable < 1) {
    throw new Error("daysAvailable must be a positive integer.");
  }

  const mustRequirementIds = new Set(
    requirements
      .filter((requirement) => requirement.priority === "must")
      .map((requirement) => requirement.id),
  );

  const orderedQuestions = [...questions].sort((left, right) => {
    const leftMust = coversAny(left, mustRequirementIds) ? 1 : 0;
    const rightMust = coversAny(right, mustRequirementIds) ? 1 : 0;

    if (leftMust !== rightMust) {
      return rightMust - leftMust;
    }

    if (left.difficulty !== right.difficulty) {
      return right.difficulty - left.difficulty;
    }

    return left.id.localeCompare(right.id);
  });

  const dayQuestionIds = Array.from({ length: daysAvailable }, () => [] as string[]);

  orderedQuestions.forEach((question, index) => {
    dayQuestionIds[index % daysAvailable].push(question.id);
  });

  return {
    days_available: daysAvailable,
    days: dayQuestionIds.map((questionIds, index) => ({
      day: index + 1,
      focus: buildFocus(questionIds, questions),
      question_ids: questionIds,
      minutes: questionIds.length > 0 ? 60 : 0,
    })),
  };
}

function coversAny(question: Question, requirementIds: Set<string>): boolean {
  return question.requirement_ids.some((id) => requirementIds.has(id));
}

function buildFocus(questionIds: string[], questions: Question[]): string {
  if (questionIds.length === 0) {
    return "Review and rest";
  }

  const categories = new Set(
    questionIds
      .map((id) => questions.find((question) => question.id === id)?.category)
      .filter(Boolean),
  );

  return Array.from(categories).join(", ");
}
