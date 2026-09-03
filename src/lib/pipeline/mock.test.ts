import { describe, expect, it } from "vitest";
import { buildMockKit } from "./mock";

describe("mock foundation pipeline", () => {
  it("does not invent requirements when a JD has no requirement-like lines", () => {
    const kit = buildMockKit({
      jd: "Frontend Engineer\nSmall product team.",
      company_url: "not a url",
      days: 1,
    });

    expect(kit.role.requirements).toEqual([]);
    expect(kit.questions).toEqual([]);
    expect(kit.schedule.days).toHaveLength(1);
    expect(kit.schedule.days[0]?.question_ids).toEqual([]);
  });

  it("keeps a thin JD thin when one explicit requirement exists", () => {
    const kit = buildMockKit({
      jd: "Frontend Engineer\nMust know React.",
      company_url: "not a url",
      days: 60,
    });

    expect(kit.role.requirements).toHaveLength(1);
    expect(kit.role.requirements[0]?.text).toBe("Must know React.");
    expect(kit.questions).toHaveLength(1);
    expect(kit.schedule.days).toHaveLength(60);
  });
});
