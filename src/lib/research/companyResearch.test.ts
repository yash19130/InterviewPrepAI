import { describe, expect, it, vi } from "vitest";
import { researchCompany } from "./companyResearch";

describe("researchCompany", () => {
  it("treats invalid company URLs as non-fatal research failures", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const result = await researchCompany("not a url", { fetchImpl });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.sources).toEqual([]);
    expect(result.errors).toEqual(["Invalid company URL."]);
    expect(result.notes).toBe("Could not retrieve company data.");
  });

  it("blocks localhost and private IP hosts before fetching", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const result = await researchCompany("http://localhost:8099/acme/", {
      fetchImpl,
    });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.sources).toEqual([]);
    expect(result.errors[0]).toContain("blocked private or local host");
  });

  it("times out slow fetches without throwing", async () => {
    const fetchImpl: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("Aborted");
          error.name = "AbortError";
          reject(error);
        });
      });

    const result = await researchCompany("https://example.com", {
      fetchImpl,
      timeoutMs: 1,
    });

    expect(result.sources).toEqual([]);
    expect(result.errors[0]).toContain("timed out");
  });

  it("returns homepage notes when no relevant internal pages are found", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        "<html><head><title>Acme</title></head><body>Acme builds tools.<a href=\"/privacy\">Privacy</a></body></html>",
        {
          headers: { "content-type": "text/html" },
        },
      ),
    );

    const result = await researchCompany("https://example.com", { fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]?.title).toBe("Acme");
    expect(result.notes).toContain("Acme builds tools.");
  });

  it("ranks relevant internal links before generic pages", async () => {
    const pages = new Map([
      [
        "https://example.com/",
        "<html><head><title>Home</title></head><body><a href=\"/privacy\">Privacy</a><a href=\"/careers\">Careers</a><a href=\"/about\">About</a></body></html>",
      ],
      [
        "https://example.com/careers",
        "<html><head><title>Careers</title></head><body>Hiring process and roles.</body></html>",
      ],
      [
        "https://example.com/about",
        "<html><head><title>About</title></head><body>About Acme.</body></html>",
      ],
    ]);
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const body = pages.get(input.toString()) ?? "";
      return new Response(body, { headers: { "content-type": "text/html" } });
    });

    const result = await researchCompany("https://example.com/", { fetchImpl });

    expect(result.sources.map((source) => source.url)).toEqual([
      "https://example.com/",
      "https://example.com/careers",
      "https://example.com/about",
    ]);
  });
});
