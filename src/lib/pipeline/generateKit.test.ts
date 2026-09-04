import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { createCoverage } from "../deterministic/coverage";
import type { GenerateJsonInput, JsonLlmAdapter } from "../llm/types";
import {
  BatchOutputSchema,
  KitSchema,
  type BatchCaseInput,
  type BatchOutput,
} from "../schemas";
import { generateKit } from "./generateKit";
import invalidUrlCase from "../../../fixtures/invalid-url-like-input.json";
import richCase from "../../../fixtures/rich-jd.json";
import thinCase from "../../../fixtures/thin-jd.json";

const execFileAsync = promisify(execFile);
const noResearch = {
  companyUrl: "https://example.com",
  sources: [],
  notes: "Could not retrieve company data.",
  errors: [],
};

describe("generateKit", () => {
  it("generates a schema-valid rich kit with complete must-have coverage", async () => {
    const kit = await generateKit({
      ...(richCase as BatchCaseInput),
      now: new Date("2026-09-01T09:12:44Z"),
      research: noResearch,
    });

    expect(() => KitSchema.parse(kit)).not.toThrow();
    expect(kit.role.requirements.length).toBeGreaterThan(1);
    expect(kit.coverage.uncovered_requirement_ids).toEqual([]);
    expect(kit.questions.every((question) => question.requirement_ids.length > 0)).toBe(
      true,
    );
  });

  it("preserves the exact requested day count for thin 60-day inputs", async () => {
    const kit = await generateKit({
      ...(thinCase as BatchCaseInput),
      research: noResearch,
    });

    expect(kit.role.requirements).toHaveLength(1);
    expect(kit.schedule.days_available).toBe(60);
    expect(kit.schedule.days).toHaveLength(60);
    expect(kit.schedule.days[0]?.question_ids).toEqual(["q1"]);
    expect(kit.schedule.days.slice(1).every((day) => day.question_ids.length === 0)).toBe(
      true,
    );
  });

  it("keeps invalid URL-like input as a partial but valid kit", async () => {
    const kit = await generateKit(invalidUrlCase as BatchCaseInput);

    expect(kit.source.company_url).toBe("not a url");
    expect(kit.source.company).toBe("");
    expect(kit.company_brief.what_they_do).toBe("Could not retrieve company data.");
    expect(kit.schedule.days).toHaveLength(1);
  });

  it("adds gap-pass questions when the adapter misses must-have coverage", async () => {
    const emptyAdapter: JsonLlmAdapter = {
      async generateJson<T>({ schema }: GenerateJsonInput<T>) {
        return schema.parse([]);
      },
    };

    const kit = await generateKit({
      ...(richCase as BatchCaseInput),
      llm: emptyAdapter,
      research: noResearch,
    });
    const coverage = createCoverage(kit.role.requirements, kit.questions, 2);

    expect(coverage.uncovered_requirement_ids).toEqual([]);
    expect(kit.coverage.passes).toBe(2);
    expect(kit.questions.length).toBeGreaterThan(0);
  });

  it("falls back to a valid deterministic kit when LLM JSON is malformed", async () => {
    const malformedAdapter: JsonLlmAdapter = {
      async generateJson() {
        throw new Error("Malformed JSON");
      },
    };

    const kit = await generateKit({
      ...(richCase as BatchCaseInput),
      llm: malformedAdapter,
      research: noResearch,
    });

    expect(() => KitSchema.parse(kit)).not.toThrow();
    expect(kit.coverage.uncovered_requirement_ids).toEqual([]);
    expect(kit.schedule.days).toHaveLength(richCase.days);
  });

  it("falls back to a valid deterministic kit when the LLM is quota limited", async () => {
    const quotaAdapter: JsonLlmAdapter = {
      async generateJson() {
        throw new Error("429 quota exceeded");
      },
    };

    const kit = await generateKit({
      ...(thinCase as BatchCaseInput),
      llm: quotaAdapter,
      research: noResearch,
    });

    expect(() => KitSchema.parse(kit)).not.toThrow();
    expect(kit.coverage.uncovered_requirement_ids).toEqual([]);
    expect(kit.schedule.days).toHaveLength(thinCase.days);
  });

  it("keeps stable requirement, question, and flashcard IDs across repeated runs", async () => {
    const first = await generateKit({
      ...(richCase as BatchCaseInput),
      now: new Date("2026-09-01T09:12:44Z"),
      research: noResearch,
    });
    const second = await generateKit({
      ...(richCase as BatchCaseInput),
      now: new Date("2026-09-02T09:12:44Z"),
      research: noResearch,
    });

    expect(first.role.requirements.map((requirement) => requirement.id)).toEqual(
      second.role.requirements.map((requirement) => requirement.id),
    );
    expect(first.questions.map((question) => question.id)).toEqual(
      second.questions.map((question) => question.id),
    );
    expect(first.flashcards.map((flashcard) => flashcard.id)).toEqual(
      second.flashcards.map((flashcard) => flashcard.id),
    );
  });

  it("writes CLI output that validates against Appendix B and nested Appendix A schemas", async () => {
    const dir = await mkdtemp(join(tmpdir(), "interviewprepai-"));
    const inputPath = join(dir, "cases.json");
    const outputPath = join(dir, "kits.json");
    const cases = [richCase, thinCase, invalidUrlCase].map((testCase) => ({
      ...testCase,
      company_url: "not a url",
    }));

    await writeFile(inputPath, `${JSON.stringify(cases, null, 2)}\n`);
    await execFileAsync("npm", [
      "run",
      "evaluate",
      "--",
      "--input",
      inputPath,
      "--output",
      outputPath,
    ]);

    const output = JSON.parse(await readFile(outputPath, "utf8")) as BatchOutput;

    expect(() => BatchOutputSchema.parse(output)).not.toThrow();
    expect(output.kits).toHaveLength(3);
    expect(output.kits.every((kitResult) => kitResult.status === "ok")).toBe(true);
  });
});
