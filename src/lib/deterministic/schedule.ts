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
      focus: buildFocus(questionIds, questions, requirements),
      question_ids: questionIds,
      minutes: questionIds.length > 0 ? 60 : 0,
    })),
  };
}

function coversAny(question: Question, requirementIds: Set<string>): boolean {
  return question.requirement_ids.some((id) => requirementIds.has(id));
}

function buildFocus(
  questionIds: string[],
  questions: Question[],
  requirements: Requirement[],
): string {
  if (questionIds.length === 0) {
    return "Review and rest";
  }

  const dayCategories = new Set(
    questionIds.map(id => questions.find(q => q.id === id)?.category).filter(Boolean)
  );

  const categories = Array.from(dayCategories);
  if (categories.length > 0) {
    const labels = categories.map(c => categoryLabel(c!));
    return labels.join(" & ") + " prep";
  }

  const question = questions.find((item) => item.id === questionIds[0]);
  if (!question) {
    return "Review and rest";
  }

  const requirement = requirements.find((item) => item.id === question.requirement_ids[0]);
  const topic = requirement ? topicFromRequirement(requirement.text) : categoryLabel(question.category);

  return `${categoryLabel(question.category)}: ${topic}`;
}

function categoryLabel(category: Question["category"]): string {
  if (category === "system-design") {
    return "System design";
  }

  if (category === "company-fit") {
    return "Company fit";
  }

  return category === "behavioural" ? "Behavioral stories" : "Technical depth";
}

function topicFromRequirement(text: string): string {
  const cleaned = text
    .replace(/\s+/g, " ")
    .replace(/\s*[.;]\s*$/, "")
    .trim();

  if (cleaned.length <= 58) {
    return cleaned;
  }

  return `${cleaned.slice(0, 55).trim()}...`;
}
