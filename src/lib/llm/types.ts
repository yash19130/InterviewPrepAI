import type { z } from "zod";

export type LlmRetryOptions = {
  maxRetries?: number;
  initialDelayMs?: number;
  requestTimeoutMs?: number;
};

export type GenerateJsonInput<T> = {
  model?: string;
  prompt: string;
  schemaName: string;
  schema: z.ZodType<T>;
  retry?: LlmRetryOptions;
};

export interface JsonLlmAdapter {
  generateJson<T>(input: GenerateJsonInput<T>): Promise<T>;
}

export class LlmAdapterError extends Error {
  constructor(
    message: string,
    readonly code: "MISSING_API_KEY" | "PROVIDER_ERROR" | "INVALID_JSON",
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "LlmAdapterError";
  }
}
