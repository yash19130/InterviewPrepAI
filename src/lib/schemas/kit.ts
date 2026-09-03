import { z } from "zod";

export const RequirementKindSchema = z.enum([
  "technical",
  "behavioural",
  "domain",
]);

export const RequirementPrioritySchema = z.enum(["must", "nice"]);

export const QuestionCategorySchema = z.enum([
  "technical",
  "behavioural",
  "system-design",
  "company-fit",
]);

export const SourceSchema = z
  .object({
    company: z.string(),
    company_url: z.string(),
    role: z.string(),
    location: z.string(),
    jd_chars: z.number().int().nonnegative(),
    researched_at: z.string(),
    pages_used: z.array(z.string()),
  })
  .strict();

export const CompanyBriefSchema = z
  .object({
    summary: z.string(),
    what_they_do: z.string(),
    sources: z.array(z.string()),
  })
  .strict();

export const RequirementSchema = z
  .object({
    id: z.string().min(1),
    text: z.string(),
    kind: RequirementKindSchema,
    priority: RequirementPrioritySchema,
  })
  .strict();

export const RoleSchema = z
  .object({
    title: z.string(),
    seniority: z.string(),
    responsibilities: z.array(z.string()),
    requirements: z.array(RequirementSchema),
  })
  .strict();

export const QuestionSchema = z
  .object({
    id: z.string().min(1),
    requirement_ids: z.array(z.string()),
    category: QuestionCategorySchema,
    prompt: z.string(),
    answer_outline: z.string(),
    difficulty: z.number().int().min(1).max(3),
  })
  .strict();

export const FlashcardSchema = z
  .object({
    id: z.string().min(1),
    front: z.string(),
    back: z.string(),
    requirement_ids: z.array(z.string()),
  })
  .strict();

export const ScheduleDaySchema = z
  .object({
    day: z.number().int().positive(),
    focus: z.string(),
    question_ids: z.array(z.string()),
    minutes: z.number().int().nonnegative(),
  })
  .strict();

export const ScheduleSchema = z
  .object({
    days_available: z.number().int().positive(),
    days: z.array(ScheduleDaySchema),
  })
  .strict();

export const CoverageSchema = z
  .object({
    uncovered_requirement_ids: z.array(z.string()),
    passes: z.number().int().nonnegative(),
  })
  .strict();

export const KitSchema = z
  .object({
    source: SourceSchema,
    company_brief: CompanyBriefSchema,
    role: RoleSchema,
    questions: z.array(QuestionSchema),
    flashcards: z.array(FlashcardSchema),
    schedule: ScheduleSchema,
    coverage: CoverageSchema,
  })
  .strict()
  .superRefine((kit, context) => {
    if (kit.schedule.days.length !== kit.schedule.days_available) {
      context.addIssue({
        code: "custom",
        message: "schedule.days length must equal schedule.days_available",
        path: ["schedule", "days"],
      });
    }

    const requirementIds = new Set(
      kit.role.requirements.map((requirement) => requirement.id),
    );
    const questionIds = new Set(kit.questions.map((question) => question.id));

    kit.questions.forEach((question, questionIndex) => {
      question.requirement_ids.forEach((requirementId, requirementIdIndex) => {
        if (!requirementIds.has(requirementId)) {
          context.addIssue({
            code: "custom",
            message: "question requirement_ids entries must refer to existing requirements",
            path: [
              "questions",
              questionIndex,
              "requirement_ids",
              requirementIdIndex,
            ],
          });
        }
      });
    });

    kit.flashcards.forEach((flashcard, flashcardIndex) => {
      flashcard.requirement_ids.forEach((requirementId, requirementIdIndex) => {
        if (!requirementIds.has(requirementId)) {
          context.addIssue({
            code: "custom",
            message: "flashcard requirement_ids entries must refer to existing requirements",
            path: [
              "flashcards",
              flashcardIndex,
              "requirement_ids",
              requirementIdIndex,
            ],
          });
        }
      });
    });

    kit.schedule.days.forEach((day, dayIndex) => {
      day.question_ids.forEach((questionId, questionIdIndex) => {
        if (!questionIds.has(questionId)) {
          context.addIssue({
            code: "custom",
            message: "schedule question_ids entries must refer to existing questions",
            path: ["schedule", "days", dayIndex, "question_ids", questionIdIndex],
          });
        }
      });
    });
  });

export type RequirementKind = z.infer<typeof RequirementKindSchema>;
export type RequirementPriority = z.infer<typeof RequirementPrioritySchema>;
export type QuestionCategory = z.infer<typeof QuestionCategorySchema>;
export type Source = z.infer<typeof SourceSchema>;
export type CompanyBrief = z.infer<typeof CompanyBriefSchema>;
export type Requirement = z.infer<typeof RequirementSchema>;
export type Role = z.infer<typeof RoleSchema>;
export type Question = z.infer<typeof QuestionSchema>;
export type Flashcard = z.infer<typeof FlashcardSchema>;
export type ScheduleDay = z.infer<typeof ScheduleDaySchema>;
export type Schedule = z.infer<typeof ScheduleSchema>;
export type Coverage = z.infer<typeof CoverageSchema>;
export type Kit = z.infer<typeof KitSchema>;
