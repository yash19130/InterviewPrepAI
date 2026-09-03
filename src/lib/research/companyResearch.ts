import * as cheerio from "cheerio";

export type CompanyResearchOptions = {
  fetchImpl?: typeof fetch;
  maxPages?: number;
  timeoutMs?: number;
  maxBytes?: number;
  maxLinksToRank?: number;
  maxResearchCharsPerPage?: number;
  maxTotalResearchChars?: number;
};

export type CompanyResearchSource = {
  url: string;
  title: string;
  notes: string;
};

export type CompanyResearchResult = {
  companyUrl: string;
  sources: CompanyResearchSource[];
  notes: string;
  errors: string[];
};

const DEFAULT_LIMITS = {
  maxPages: 4,
  timeoutMs: 5000,
  maxBytes: 500_000,
  maxLinksToRank: 80,
  maxResearchCharsPerPage: 3000,
  maxTotalResearchChars: 9000,
};

const POSITIVE_WEIGHTS: Array<[RegExp, number]> = [
  [/careers?|jobs?|hiring|interview/i, 10],
  [/about|company|team/i, 7],
  [/product|platform|customers?|case-studies/i, 5],
  [/engineering|blog|docs|handbook/i, 4],
];

const NEGATIVE_PATTERN =
  /login|signup|privacy|terms|legal|\/assets?\/|\.(?:png|jpe?g|gif|svg|webp|ico|css|js|pdf|zip|gz)$/i;

export async function researchCompany(
  companyUrl: string,
  options: CompanyResearchOptions = {},
): Promise<CompanyResearchResult> {
  const limits = { ...DEFAULT_LIMITS, ...options };
  const fetchImpl = options.fetchImpl ?? fetch;
  const errors: string[] = [];
  const sources: CompanyResearchSource[] = [];
  const validated = validatePublicHttpUrl(companyUrl);

  if (!validated.ok) {
    return {
      companyUrl,
      sources,
      notes: "Could not retrieve company data.",
      errors: [validated.error],
    };
  }

  const firstPage = await fetchPage(validated.url, fetchImpl, limits).catch((error) => {
    errors.push(error instanceof Error ? error.message : "Could not fetch company URL.");
    return null;
  });

  if (!firstPage) {
    return {
      companyUrl,
      sources,
      notes: "Could not retrieve company data.",
      errors,
    };
  }

  sources.push(toSource(firstPage, limits.maxResearchCharsPerPage));

  const rankedLinks = rankLinks(firstPage.html, firstPage.url)
    .slice(0, limits.maxLinksToRank)
    .slice(0, Math.max(0, limits.maxPages - 1));

  for (const link of rankedLinks) {
    const page = await fetchPage(link.url, fetchImpl, limits).catch((error) => {
      errors.push(error instanceof Error ? error.message : `Could not fetch ${link.url}.`);
      return null;
    });

    if (page) {
      sources.push(toSource(page, limits.maxResearchCharsPerPage));
    }
  }

  const notes = sources
    .map((source) => `${source.title}\n${source.notes}`)
    .join("\n\n")
    .slice(0, limits.maxTotalResearchChars);

  return {
    companyUrl,
    sources,
    notes: notes || "Could not retrieve company data.",
    errors,
  };
}

type ValidatedUrl =
  | { ok: true; url: URL }
  | { ok: false; error: string };

function validatePublicHttpUrl(input: string): ValidatedUrl {
  let url: URL;

  try {
    url = new URL(input);
  } catch {
    return { ok: false, error: "Invalid company URL." };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: "Company URL must use http or https." };
  }

  if (isBlockedHost(url.hostname)) {
    return { ok: false, error: "Company URL points to a blocked private or local host." };
  }

  return { ok: true, url };
}

function isBlockedHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (normalized === "localhost" || normalized === "::1") {
    return true;
  }

  if (normalized.startsWith("fc") || normalized.startsWith("fd")) {
    return true;
  }

  const parts = normalized.split(".").map(Number);

  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
    return false;
  }

  const [first, second] = parts;

  return (
    first === 10 ||
    first === 127 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 169 && second === 254)
  );
}

type FetchLimits = typeof DEFAULT_LIMITS;

type FetchedPage = {
  url: string;
  title: string;
  html: string;
  text: string;
};

async function fetchPage(
  url: URL | string,
  fetchImpl: typeof fetch,
  limits: FetchLimits,
): Promise<FetchedPage> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), limits.timeoutMs);

  try {
    const response = await fetchImpl(url.toString(), {
      redirect: "follow",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Fetch failed for ${url.toString()} with status ${response.status}.`);
    }

    const contentType = response.headers.get("content-type") ?? "";

    if (contentType && !/text\/html|application\/xhtml\+xml|text\/plain/i.test(contentType)) {
      throw new Error(`Unsupported content type for ${url.toString()}: ${contentType}.`);
    }

    const html = (await response.text()).slice(0, limits.maxBytes);
    const $ = cheerio.load(html);
    const title = $("title").first().text().trim() || url.toString();
    const text = $("body").text().replace(/\s+/g, " ").trim();

    return {
      url: url.toString(),
      title,
      html,
      text,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Fetch timed out for ${url.toString()}.`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

type RankedLink = {
  url: string;
  score: number;
};

function rankLinks(html: string, baseUrl: string): RankedLink[] {
  const $ = cheerio.load(html);
  const origin = new URL(baseUrl).origin;
  const seen = new Set<string>();
  const links: RankedLink[] = [];

  $("a[href]").each((_, element) => {
    const href = $(element).attr("href");

    if (!href) {
      return;
    }

    let url: URL;

    try {
      url = new URL(href, baseUrl);
    } catch {
      return;
    }

    if (url.origin !== origin || url.protocol !== "http:" && url.protocol !== "https:") {
      return;
    }

    url.hash = "";
    const normalized = url.toString();

    if (seen.has(normalized)) {
      return;
    }

    seen.add(normalized);

    const linkText = $(element).text();
    const scoreText = `${url.pathname} ${linkText}`;
    const score = scoreLink(scoreText);

    if (score <= 0) {
      return;
    }

    links.push({ url: normalized, score });
  });

  return links.sort((left, right) => {
    if (left.score !== right.score) {
      return right.score - left.score;
    }

    return left.url.localeCompare(right.url);
  });
}

function scoreLink(text: string): number {
  const penalty = NEGATIVE_PATTERN.test(text) ? -10 : 0;
  const positive = POSITIVE_WEIGHTS.reduce(
    (score, [pattern, weight]) => score + (pattern.test(text) ? weight : 0),
    0,
  );

  return positive + penalty;
}

function toSource(page: FetchedPage, maxChars: number): CompanyResearchSource {
  return {
    url: page.url,
    title: page.title,
    notes: page.text.slice(0, maxChars),
  };
}
