import { createCoverage } from "../deterministic/coverage";
import { createSchedule } from "../deterministic/schedule";
import { KitSchema, type Kit, type QuestionCategory, type Requirement } from "../schemas";

type BuildMockKitInput = {
  jd: string;
  company_url: string;
  days: number;
};

export function buildMockKit({ jd, company_url, days }: BuildMockKitInput): Kit {
  const requirements = extractRequirementsFromJd(jd);
  const questions = requirements.map((requirement, index) => ({
    id: `q${index + 1}`,
    requirement_ids: [requirement.id],
    category: categoryForRequirement(requirement),
    prompt: `Explain your experience with: ${requirement.text}`,
    answer_outline: `Cover concrete examples related to "${requirement.text}".`,
    difficulty: requirement.priority === "must" ? 2 : 1,
  }));
  const flashcards = requirements.map((requirement, index) => ({
    id: `f${index + 1}`,
    front: requirement.text,
    back: `Prepare a concise example for ${requirement.text}.`,
    requirement_ids: [requirement.id],
  }));

  const kit: Kit = {
    source: {
      company: "",
      company_url,
      role: inferRoleTitle(jd),
      location: "",
      jd_chars: jd.length,
      researched_at: new Date().toISOString(),
      pages_used: [],
    },
    company_brief: {
      summary: "Company research is not implemented in the foundation pipeline.",
      what_they_do: "Could not retrieve company data.",
      sources: [],
    },
    role: {
      title: inferRoleTitle(jd),
      seniority: inferSeniority(jd),
      responsibilities: [],
      requirements,
    },
    questions,
    flashcards,
    schedule: createSchedule({
      daysAvailable: days,
      requirements,
      questions,
    }),
    coverage: createCoverage(requirements, questions, 2),
  };

  return KitSchema.parse(kit);
}

function extractRequirementsFromJd(jd: string): Requirement[] {
  const lines = jd
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^[-*•]\s*/, ""))
    .filter(Boolean);

  return lines
    .filter(isRequirementLine)
    .slice(0, 20)
    .map((text, index) => ({
      id: `r${index + 1}`,
      text,
      kind: inferKind(text),
      priority: inferPriority(text),
    }));
}

function isRequirementLine(line: string): boolean {
  return [
    /required/i,
    /requirement/i,
    /must/i,
    /need/i,
    /experience/i,
    /proficient/i,
    /knowledge/i,
    /familiar/i,
    /\b\d+\+?\s+years?\b/i,
  ].some((pattern) => pattern.test(line));
}

function inferKind(text: string): Requirement["kind"] {
  if (/mentor|lead|collaborat|communicat|stakeholder|manage/i.test(text)) {
    return "behavioural";
  }

  if (/fintech|healthcare|payments|banking|domain|industry/i.test(text)) {
    return "domain";
  }

  return "technical";
}

function inferPriority(text: string): Requirement["priority"] {
  if (/nice|bonus|preferred|plus|familiar/i.test(text)) {
    return "nice";
  }

  return "must";
}

function categoryForRequirement(requirement: Requirement): QuestionCategory {
  if (requirement.kind === "behavioural") {
    return "behavioural";
  }

  return "technical";
}

function inferRoleTitle(jd: string): string {
  return (
    jd
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => /engineer|developer|manager|designer|analyst/i.test(line)) ?? ""
  );
}

function inferSeniority(jd: string): string {
  if (/senior|staff|principal|lead/i.test(jd)) {
    return "senior";
  }

  if (/junior|entry|associate/i.test(jd)) {
    return "junior";
  }

  return "";
}
