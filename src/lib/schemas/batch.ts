import { z } from "zod";
import { KitSchema } from "./kit";

export const BatchCaseInputSchema = z
  .object({
    id: z.string().min(1),
    jd: z.string(),
    company_url: z.string(),
    days: z.number().int().positive(),
  })
  .strict();

export const BatchInputSchema = z.array(BatchCaseInputSchema);

export const BatchErrorSchema = z
  .object({
    code: z.string().min(1),
    message: z.string(),
  })
  .strict();

export const BatchOkResultSchema = z
  .object({
    id: z.string().min(1),
    status: z.literal("ok"),
    kit: KitSchema,
    error: z.null(),
  })
  .strict();

export const BatchFailedResultSchema = z
  .object({
    id: z.string().min(1),
    status: z.literal("failed"),
    kit: z.null(),
    error: BatchErrorSchema,
  })
  .strict();

export const BatchKitResultSchema = z.discriminatedUnion("status", [
  BatchOkResultSchema,
  BatchFailedResultSchema,
]);

export const BatchOutputSchema = z
  .object({
    version: z.literal("1.0"),
    generated_at: z.iso.datetime(),
    kits: z.array(BatchKitResultSchema),
  })
  .strict();

export type BatchCaseInput = z.infer<typeof BatchCaseInputSchema>;
export type BatchInput = z.infer<typeof BatchInputSchema>;
export type BatchError = z.infer<typeof BatchErrorSchema>;
export type BatchOkResult = z.infer<typeof BatchOkResultSchema>;
export type BatchFailedResult = z.infer<typeof BatchFailedResultSchema>;
export type BatchKitResult = z.infer<typeof BatchKitResultSchema>;
export type BatchOutput = z.infer<typeof BatchOutputSchema>;
