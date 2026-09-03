import { describe, expect, it } from "vitest";
import { BatchInputSchema, BatchOutputSchema, KitSchema } from "@/lib/schemas";
import { buildMockKit } from "@/lib/pipeline/mock";

describe("schemas", () => {
  it("validates Appendix A kit structure", () => {
    const kit = buildMockKit({
      jd: "Senior Engineer\nRequired: 5+ years with React",
      company_url: "https://example.com",
      days: 2,
    });

    expect(() => KitSchema.parse(kit)).not.toThrow();
  });

  it("validates Appendix B batch input and output structures", () => {
    const input = BatchInputSchema.parse([
      {
        id: "case-01",
        jd: "Senior Backend Engineer\nMust have Node.js experience",
        company_url: "http://localhost:8099/acme/",
        days: 5,
      },
    ]);

    const output = {
      version: "1.0",
      generated_at: "2026-09-01T09:12:44Z",
      kits: [
        {
          id: input[0].id,
          status: "ok",
          kit: buildMockKit(input[0]),
          error: null,
        },
      ],
    };

    expect(() => BatchOutputSchema.parse(output)).not.toThrow();
  });

  it("rejects schedules that reference missing questions", () => {
    const kit = buildMockKit({
      jd: "Senior Engineer\nRequired: 5+ years with React",
      company_url: "https://example.com",
      days: 1,
    });

    expect(() =>
      KitSchema.parse({
        ...kit,
        schedule: {
          ...kit.schedule,
          days: [
            {
              day: 1,
              focus: "technical",
              question_ids: ["missing-question"],
              minutes: 60,
            },
          ],
        },
      }),
    ).toThrow();
  });
});
