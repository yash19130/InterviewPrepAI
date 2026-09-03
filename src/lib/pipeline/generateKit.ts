import { createCoverage } from "../deterministic/coverage";
import { createSchedule } from "../deterministic/schedule";
import {
  KitSchema,
  type Flashcard,
  type Kit,
  type Question,
  type QuestionCategory,
  type Requirement,
  type RequirementKind,
  type RequirementPriority,
} from "../schemas";

export type GenerateKitInput = {
  jd: string;
  company_url: string;
  days: number;
  llm?: LlmAdapter;
  now?: Date;
};

export type NormalizedKitInput = {
  jd: string;
  companyUrl: string;
  days: number;
};

export type ExtractionBucket =
  | "skills"
  | "responsibilities"
  | "domain_company_context"
  | "behavioral_signals";

export type ExtractedRequirement = Requirement & {
  bucket: ExtractionBucket;
  source_line: string;
};

export type RequirementExtractionResult = {
  requirements: Requirement[];
  responsibilities: string[];
  diagnostics: {
    gaps: string[];
    buckets: Record<ExtractionBucket, string[]>;
  };
};

export type RequirementDraft = {
  text: string;
  kind: RequirementKind;
  priority: RequirementPriority;
  bucket: ExtractionBucket;
  source_line: string;
};

export type QuestionDraft = {
  requirementIds: string[];
  category: QuestionCategory;
  prompt: string;
  answerOutline: string;
  difficulty: 1 | 2 | 3;
};

export type FlashcardDraft = {
  requirementIds: string[];
  front: string;
  back: string;
};

export interface LlmAdapter {
  generateQuestions(requirements: Requirement[]): Promise<QuestionDraft[]>;
  generateFlashcards(requirements: Requirement[]): Promise<FlashcardDraft[]>;
}

type SectionName =
  | "requirements"
  | "qualifications"
  | "responsibilities"
  | "nice"
  | "about";

type LineWithContext = {
  text: string;
  section: SectionName | null;
};

export async function generateKit(input: GenerateKitInput): Promise<Kit> {
  const normalizedInput = normalizeInput(input);
  const extraction = extractRequirements(normalizedInput.jd);
  const adapter = input.llm ?? new MockLlmAdapter();

  const questionDrafts = await adapter.generateQuestions(extraction.requirements);
  const flashcardDrafts = await adapter.generateFlashcards(extraction.requirements);

  let questions = toQuestions(questionDrafts);
  const firstCoverage = createCoverage(extraction.requirements, questions, 1);

  if (firstCoverage.uncovered_requirement_ids.length > 0) {
    questions = addGapQuestions({
      questions,
      requirements: extraction.requirements,
      uncoveredRequirementIds: firstCoverage.uncovered_requirement_ids,
    });
  }

  const finalCoverage = createCoverage(extraction.requirements, questions, 2);
  const flashcards = toFlashcards(flashcardDrafts);

  const kit: Kit = {
    source: {
      company: inferCompanyName(normalizedInput.companyUrl),
      company_url: normalizedInput.companyUrl,
      role: inferRoleTitle(normalizedInput.jd),
      location: inferLocation(normalizedInput.jd),
      jd_chars: normalizedInput.jd.length,
      researched_at: (input.now ?? new Date()).toISOString(),
      pages_used: [],
    },
    company_brief: {
      summary: "Company research is not implemented in the deterministic foundation pipeline.",
      what_they_do: "Could not retrieve company data.",
      sources: [],
    },
    role: {
      title: inferRoleTitle(normalizedInput.jd),
      seniority: inferSeniority(normalizedInput.jd),
      responsibilities: extraction.responsibilities,
      requirements: extraction.requirements,
    },
    questions,
    flashcards,
    schedule: createSchedule({
      daysAvailable: normalizedInput.days,
      requirements: extraction.requirements,
      questions,
    }),
    coverage: finalCoverage,
  };

  return KitSchema.parse(kit);
}

export function normalizeInput(input: GenerateKitInput): NormalizedKitInput {
  const jd = input.jd.trim();
  const companyUrl = input.company_url.trim();

  if (!Number.isInteger(input.days) || input.days < 1) {
    throw new Error("days must be a positive integer.");
  }

  return {
    jd,
    companyUrl,
    days: input.days,
  };
}

export function extractRequirements(jd: string): RequirementExtractionResult {
  const gaps: string[] = [];
  const buckets: Record<ExtractionBucket, string[]> = {
    skills: [],
    responsibilities: [],
    domain_company_context: [],
    behavioral_signals: [],
  };

  if (jd.trim().length === 0) {
    gaps.push("Job description is empty.");
  }

  const drafts = collectRequirementDrafts(jd);
  const dedupedDrafts = dedupeDrafts(drafts).slice(0, 30);
  const extracted = dedupedDrafts.map<ExtractedRequirement>((draft, index) => {
    buckets[draft.bucket].push(draft.text);

    return {
      id: `r${index + 1}`,
      text: draft.text,
      kind: draft.kind,
      priority: draft.priority,
      bucket: draft.bucket,
      source_line: draft.source_line,
    };
  });

  if (extracted.length === 0) {
    gaps.push("No explicit requirement-like lines were found in the job description.");
  }

  return {
    requirements: extracted.map(({ id, text, kind, priority }) => ({
      id,
      text,
      kind,
      priority,
    })),
    responsibilities: extracted
      .filter((requirement) => requirement.bucket === "responsibilities")
      .map((requirement) => requirement.text),
    diagnostics: {
      gaps,
      buckets,
    },
  };
}

export class MockLlmAdapter implements LlmAdapter {
  async generateQuestions(requirements: Requirement[]): Promise<QuestionDraft[]> {
    return requirements.map((requirement) => ({
      requirementIds: [requirement.id],
      category: categoryForRequirement(requirement),
      prompt: questionPromptForRequirement(requirement),
      answerOutline: answerOutlineForRequirement(requirement),
      difficulty: difficultyForRequirement(requirement),
    }));
  }

  async generateFlashcards(requirements: Requirement[]): Promise<FlashcardDraft[]> {
    return requirements.map((requirement) => ({
      requirementIds: [requirement.id],
      front: requirement.text,
      back: `Prepare one concrete example, one tradeoff, and one follow-up risk for: ${requirement.text}`,
    }));
  }
}

function collectRequirementDrafts(jd: string): RequirementDraft[] {
  const lines = linesWithSections(jd);
  const drafts: RequirementDraft[] = [];

  for (const line of lines) {
    if (isHeading(line.text)) {
      continue;
    }

    if (!isRequirementLike(line)) {
      continue;
    }

    const text = cleanRequirementText(line.text);

    if (text.length === 0) {
      continue;
    }

    const bucket = bucketForText(text);

    drafts.push({
      text,
      kind: kindForBucket(bucket, text),
      priority: priorityForLine(line),
      bucket,
      source_line: line.text,
    });
  }

  return drafts;
}

function linesWithSections(jd: string): LineWithContext[] {
  const lines = jd
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const result: LineWithContext[] = [];
  let section: SectionName | null = null;

  for (const line of lines) {
    const maybeHeading = headingForLine(line);

    if (maybeHeading) {
      section = maybeHeading;
      result.push({ text: line, section });
      continue;
    }

    result.push({ text: line, section });
  }

  return result;
}

function headingForLine(line: string): SectionName | null {
  const normalized = line.replace(/:$/, "").toLowerCase();

  if (/^(requirements?|qualifications?|minimum qualifications?)$/.test(normalized)) {
    return "requirements";
  }

  if (/^(responsibilities|what you'?ll do|the role)$/.test(normalized)) {
    return "responsibilities";
  }

  if (/^(nice to have|bonus|preferred qualifications?)$/.test(normalized)) {
    return "nice";
  }

  if (/^(about you|who you are)$/.test(normalized)) {
    return "about";
  }

  return null;
}

function isHeading(line: string): boolean {
  return headingForLine(line) !== null;
}

function isRequirementLike(line: LineWithContext): boolean {
  if (
    line.section === "requirements" ||
    line.section === "qualifications" ||
    line.section === "responsibilities" ||
    line.section === "nice" ||
    line.section === "about"
  ) {
    return true;
  }

  return [
    /required/i,
    /requirement/i,
    /must/i,
    /need/i,
    /minimum/i,
    /responsible for/i,
    /you will/i,
    /experience/i,
    /proficient/i,
    /knowledge/i,
    /familiar/i,
    /\b\d+\+?\s+years?\b/i,
  ].some((pattern) => pattern.test(line.text));
}

function cleanRequirementText(text: string): string {
  return text
    .replace(/^[-*•]\s*/, "")
    .replace(/^(required|requirement|must have|must|need|required qualifications?)\s*:?\s*/i, "")
    .trim();
}

function dedupeDrafts(drafts: RequirementDraft[]): RequirementDraft[] {
  const seen = new Set<string>();
  const deduped: RequirementDraft[] = [];

  for (const draft of drafts) {
    const key = draft.text.toLowerCase();

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(draft);
  }

  return deduped;
}

function bucketForText(text: string): ExtractionBucket {
  if (/mentor|lead|collaborat|communicat|stakeholder|manage|ambigu/i.test(text)) {
    return "behavioral_signals";
  }

  if (/fintech|healthcare|payments|banking|domain|industry|compliance|security/i.test(text)) {
    return "domain_company_context";
  }

  if (/build|design|ship|own|maintain|responsible|deliver|support/i.test(text)) {
    return "responsibilities";
  }

  return "skills";
}

function kindForBucket(bucket: ExtractionBucket, text: string): RequirementKind {
  if (bucket === "behavioral_signals") {
    return "behavioural";
  }

  if (bucket === "domain_company_context") {
    return "domain";
  }

  if (/react|node|typescript|javascript|python|java|api|database|sql|aws|gcp|kubernetes|system|architecture/i.test(text)) {
    return "technical";
  }

  return bucket === "responsibilities" ? "behavioural" : "technical";
}

function priorityForLine(line: LineWithContext): RequirementPriority {
  if (
    line.section === "nice" ||
    /nice|bonus|preferred|plus|familiarity|familiar/i.test(line.text)
  ) {
    return "nice";
  }

  if (
    line.section === "requirements" ||
    line.section === "qualifications" ||
    line.section === "responsibilities" ||
    /required|must|need|minimum|responsible for|you will|experience with/i.test(line.text)
  ) {
    return "must";
  }

  return "nice";
}

function toQuestions(drafts: QuestionDraft[]): Question[] {
  return drafts.map((draft, index) => ({
    id: `q${index + 1}`,
    requirement_ids: draft.requirementIds,
    category: draft.category,
    prompt: draft.prompt,
    answer_outline: draft.answerOutline,
    difficulty: draft.difficulty,
  }));
}

function toFlashcards(drafts: FlashcardDraft[]): Flashcard[] {
  return drafts.map((draft, index) => ({
    id: `f${index + 1}`,
    front: draft.front,
    back: draft.back,
    requirement_ids: draft.requirementIds,
  }));
}

function addGapQuestions({
  questions,
  requirements,
  uncoveredRequirementIds,
}: {
  questions: Question[];
  requirements: Requirement[];
  uncoveredRequirementIds: string[];
}): Question[] {
  const nextQuestions = [...questions];

  for (const requirementId of uncoveredRequirementIds) {
    const requirement = requirements.find((item) => item.id === requirementId);

    if (!requirement) {
      continue;
    }

    nextQuestions.push({
      id: `q${nextQuestions.length + 1}`,
      requirement_ids: [requirement.id],
      category: categoryForRequirement(requirement),
      prompt: questionPromptForRequirement(requirement),
      answer_outline: `Gap-pass question. ${answerOutlineForRequirement(requirement)}`,
      difficulty: difficultyForRequirement(requirement),
    });
  }

  return nextQuestions;
}

function categoryForRequirement(requirement: Requirement): QuestionCategory {
  if (requirement.kind === "behavioural") {
    return "behavioural";
  }

  if (requirement.kind === "domain") {
    return "company-fit";
  }

  if (/architecture|system design|distributed|scal/i.test(requirement.text)) {
    return "system-design";
  }

  return "technical";
}

function questionPromptForRequirement(requirement: Requirement): string {
  if (requirement.kind === "behavioural") {
    return `Describe a concrete example that demonstrates: ${requirement.text}`;
  }

  if (requirement.kind === "domain") {
    return `How would you apply your experience with ${requirement.text} in this company context?`;
  }

  return `Explain your practical experience with: ${requirement.text}`;
}

function answerOutlineForRequirement(requirement: Requirement): string {
  return [
    `Requirement link: ${requirement.id}.`,
    `Rationale: this ${requirement.priority} requirement is explicitly present in the JD.`,
    `Prep notes: prepare a specific example, tradeoffs, failure modes, and follow-up questions for "${requirement.text}".`,
  ].join(" ");
}

function difficultyForRequirement(requirement: Requirement): 1 | 2 | 3 {
  if (requirement.priority === "nice") {
    return 1;
  }

  if (
    /senior|staff|principal|lead|architecture|system design|performance|security|distributed|scal|\b[5-9]\+?\s+years?\b|\b\d{2,}\+?\s+years?\b/i.test(
      requirement.text,
    )
  ) {
    return 3;
  }

  return 2;
}

function inferRoleTitle(jd: string): string {
  return (
    jd
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => /engineer|developer|manager|designer|analyst|architect/i.test(line)) ?? ""
  );
}

function inferSeniority(jd: string): string {
  if (/principal|staff/i.test(jd)) {
    return "staff";
  }

  if (/senior|lead/i.test(jd)) {
    return "senior";
  }

  if (/junior|entry|associate/i.test(jd)) {
    return "junior";
  }

  return "";
}

function inferLocation(jd: string): string {
  const locationLine = jd
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => /^location\s*:/i.test(line));

  return locationLine?.replace(/^location\s*:\s*/i, "").trim() ?? "";
}

function inferCompanyName(companyUrl: string): string {
  try {
    const hostname = new URL(companyUrl).hostname.replace(/^www\./, "");
    return hostname.split(".")[0] ?? "";
  } catch {
    return "";
  }
}
