import type { Coverage, Question, Requirement } from "../schemas";

export function getUncoveredMustRequirementIds(
  requirements: Requirement[],
  questions: Question[],
): string[] {
  const coveredRequirementIds = new Set(
    questions.flatMap((question) => question.requirement_ids),
  );

  return requirements
    .filter((requirement) => requirement.priority === "must")
    .filter((requirement) => !coveredRequirementIds.has(requirement.id))
    .map((requirement) => requirement.id);
}

export function createCoverage(
  requirements: Requirement[],
  questions: Question[],
  passes: number,
): Coverage {
  return {
    uncovered_requirement_ids: getUncoveredMustRequirementIds(
      requirements,
      questions,
    ),
    passes,
  };
}
