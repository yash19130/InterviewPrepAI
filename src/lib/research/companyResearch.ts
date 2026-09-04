import * as cheerio from "cheerio";

export type CompanyResearchOptions = {
  fetchImpl?: typeof fetch;
  apifyClient?: ApifyRedditClient;
  maxPages?: number;
  maxDiscussionPages?: number;
  timeoutMs?: number;
  maxBytes?: number;
  maxLinksToRank?: number;
  maxResearchCharsPerPage?: number;
  maxTotalResearchChars?: number;
};

type RedditAuth = {
  accessToken: string;
  tokenType: string;
};

type ApifyRedditClient = {
  actor: (actorId: string) => {
    call: (input: Record<string, unknown>) => Promise<{ defaultDatasetId?: string }>;
  };
  dataset: (datasetId: string) => {
    listItems: () => Promise<{ items?: unknown[] }>;
  };
};

export type CompanyResearchSource = {
  url: string;
  title: string;
  notes: string;
  kind: "company" | "discussion";
};

export type CompanyResearchResult = {
  companyUrl: string;
  sources: CompanyResearchSource[];
  notes: string;
  errors: string[];
};

const DEFAULT_LIMITS = {
  maxPages: 4,
  maxDiscussionPages: 3,
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

export async function researchCompanyAndDiscussions(
  companyUrl: string,
  options: CompanyResearchOptions = {},
): Promise<CompanyResearchResult> {
  const companyResearch = await researchCompany(companyUrl, options);
  const discussionResearch = await researchInterviewDiscussions({
    companyName: inferCompanyName(companyUrl),
    fetchImpl: options.fetchImpl ?? fetch,
    apifyClient: options.apifyClient,
    timeoutMs: options.timeoutMs ?? DEFAULT_LIMITS.timeoutMs,
    maxBytes: options.maxBytes ?? DEFAULT_LIMITS.maxBytes,
    maxDiscussionPages: options.maxDiscussionPages ?? DEFAULT_LIMITS.maxDiscussionPages,
    maxResearchCharsPerPage:
      options.maxResearchCharsPerPage ?? DEFAULT_LIMITS.maxResearchCharsPerPage,
    maxTotalResearchChars: options.maxTotalResearchChars ?? DEFAULT_LIMITS.maxTotalResearchChars,
  });
  const sources = [...companyResearch.sources, ...discussionResearch.sources];
  const notes = sources
    .map((source) => `${source.title}\n${source.notes}`)
    .join("\n\n")
    .slice(0, options.maxTotalResearchChars ?? DEFAULT_LIMITS.maxTotalResearchChars);

  return {
    companyUrl,
    sources,
    notes: notes || companyResearch.notes,
    errors: [...companyResearch.errors, ...discussionResearch.errors],
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
    kind: "company",
  };
}

type DiscussionResearchInput = {
  companyName: string;
  fetchImpl: typeof fetch;
  apifyClient?: ApifyRedditClient;
  timeoutMs: number;
  maxBytes: number;
  maxDiscussionPages: number;
  maxResearchCharsPerPage: number;
  maxTotalResearchChars: number;
};

async function researchInterviewDiscussions({
  companyName,
  fetchImpl,
  apifyClient,
  timeoutMs,
  maxBytes,
  maxDiscussionPages,
  maxResearchCharsPerPage,
}: DiscussionResearchInput): Promise<Pick<CompanyResearchResult, "sources" | "errors">> {
  const errors: string[] = [];
  const sources: CompanyResearchSource[] = [];

  if (!companyName) {
    return {
      sources,
      errors: ["Could not infer company name for public discussion search."],
    };
  }

  const apifyResearch = await researchRedditViaApify({
    companyName,
    apifyClient,
    maxDiscussionPages,
    maxResearchCharsPerPage,
  });

  errors.push(...apifyResearch.errors);

  if (apifyResearch.sources.length > 0) {
    return {
      sources: apifyResearch.sources,
      errors,
    };
  }

  const auth = await getRedditAuth(fetchImpl, timeoutMs).catch((error) => {
    errors.push(error instanceof Error ? error.message : "Could not authenticate with Reddit.");
    return null;
  });
  const searchUrl = auth
    ? redditOauthSearchUrl(companyName)
    : redditPublicSearchUrl(companyName);
  const searchResponse = await fetchJson(searchUrl, fetchImpl, timeoutMs, auth).catch((error) => {
    errors.push(error instanceof Error ? error.message : "Could not search Reddit.");
    return null;
  });

  const posts = redditPostsFromSearch(searchResponse)
    .filter((post) => /interview|onsite|phone screen|take.?home/i.test(`${post.title} ${post.selftext}`))
    .slice(0, maxDiscussionPages);

  for (const post of posts) {
    const permalink = new URL(post.permalink, "https://www.reddit.com");
    const detailNotes = auth
      ? await fetchRedditPostDetails(post, auth, fetchImpl, timeoutMs).catch((error) => {
          errors.push(error instanceof Error ? error.message : `Could not fetch ${permalink}.`);
          return "";
        })
      : "";
    const page = detailNotes
      ? null
      : await fetchPage(permalink.toString(), fetchImpl, {
          ...DEFAULT_LIMITS,
          timeoutMs,
          maxBytes,
        }).catch((error) => {
          errors.push(error instanceof Error ? error.message : `Could not fetch ${permalink}.`);
          return null;
        });

    sources.push({
      url: permalink.toString(),
      title: post.title,
      notes: sanitizeUntrustedText(detailNotes || page?.text || post.selftext || post.title).slice(
        0,
        maxResearchCharsPerPage,
      ),
      kind: "discussion",
    });
  }

  return { sources, errors };
}

async function researchRedditViaApify({
  companyName,
  apifyClient,
  maxDiscussionPages,
  maxResearchCharsPerPage,
}: {
  companyName: string;
  apifyClient?: ApifyRedditClient;
  maxDiscussionPages: number;
  maxResearchCharsPerPage: number;
}): Promise<Pick<CompanyResearchResult, "sources" | "errors">> {
  const token = process.env.APIFY_API_KEY;

  if (!token && !apifyClient) {
    return { sources: [], errors: [] };
  }

  try {
    const client = apifyClient ?? await createApifyClient(token);
    const actorId = process.env.APIFY_REDDIT_ACTOR_ID || "trudax/reddit-scraper";
    const run = await client.actor(actorId).call({
      startUrls: [{ url: redditWebSearchUrl(companyName) }],
      maxItems: Math.max(1, maxDiscussionPages),
    });

    if (!run.defaultDatasetId) {
      throw new Error("Apify Reddit scraper did not return a dataset.");
    }

    const { items = [] } = await client.dataset(run.defaultDatasetId).listItems();
    const sources = apifyPostsFromItems(items)
      .filter((post) =>
        /interview|onsite|phone screen|take.?home/i.test(`${post.title} ${post.selftext}`),
      )
      .slice(0, maxDiscussionPages)
      .map((post) => ({
        url: new URL(post.permalink, "https://www.reddit.com").toString(),
        title: post.title,
        notes: sanitizeUntrustedText(post.selftext || post.title).slice(0, maxResearchCharsPerPage),
        kind: "discussion" as const,
      }));

    return { sources, errors: [] };
  } catch (error) {
    return {
      sources: [],
      errors: [error instanceof Error ? error.message : "Could not search Reddit via Apify."],
    };
  }
}

async function createApifyClient(token?: string): Promise<ApifyRedditClient> {
  if (!token) {
    throw new Error("APIFY_API_KEY is not configured.");
  }

  const { ApifyClient } = await import("apify-client");

  return new ApifyClient({ token });
}

async function fetchJson(
  url: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
  redditAuth?: RedditAuth | null,
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      headers: {
        accept: "application/json",
        "user-agent": process.env.REDDIT_USER_AGENT || "InterviewPrepAI/0.1 research bot",
        ...(redditAuth
          ? { authorization: `${redditAuth.tokenType} ${redditAuth.accessToken}` }
          : {}),
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Fetch failed for ${url} with status ${response.status}.`);
    }

    return response.json();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Fetch timed out for ${url}.`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

type RedditPost = {
  title: string;
  selftext: string;
  permalink: string;
};

function redditPostsFromSearch(response: unknown): RedditPost[] {
  if (!response || typeof response !== "object") {
    return [];
  }

  const children = (response as { data?: { children?: unknown[] } }).data?.children ?? [];

  return children.flatMap((child) => {
    const data = (child as { data?: Partial<RedditPost> }).data;

    if (!data?.title || !data.permalink) {
      return [];
    }

    return [
      {
        title: String(data.title),
        selftext: String(data.selftext ?? ""),
        permalink: String(data.permalink),
      },
    ];
  });
}

function redditPublicSearchUrl(companyName: string): string {
  const searchUrl = new URL("https://www.reddit.com/search.json");
  searchUrl.searchParams.set("q", `"${companyName}" interview experience`);
  searchUrl.searchParams.set("limit", "10");
  searchUrl.searchParams.set("sort", "relevance");
  searchUrl.searchParams.set("t", "all");

  return searchUrl.toString();
}

function redditWebSearchUrl(companyName: string): string {
  const searchUrl = new URL("https://www.reddit.com/search/");
  searchUrl.searchParams.set("q", `"${companyName}" interview experience`);
  searchUrl.searchParams.set("type", "link");

  return searchUrl.toString();
}

function redditOauthSearchUrl(companyName: string): string {
  const searchUrl = new URL("https://oauth.reddit.com/search");
  searchUrl.searchParams.set("q", `"${companyName}" interview experience`);
  searchUrl.searchParams.set("limit", "10");
  searchUrl.searchParams.set("sort", "relevance");
  searchUrl.searchParams.set("t", "all");
  searchUrl.searchParams.set("type", "link");

  return searchUrl.toString();
}

async function getRedditAuth(
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<RedditAuth | null> {
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded",
        "user-agent": process.env.REDDIT_USER_AGENT || "InterviewPrepAI/0.1 research bot",
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Reddit authentication failed with status ${response.status}.`);
    }

    const body = await response.json();

    if (!body.access_token || !body.token_type) {
      throw new Error("Reddit authentication response was incomplete.");
    }

    return {
      accessToken: body.access_token,
      tokenType: body.token_type,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Reddit authentication timed out.");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchRedditPostDetails(
  post: RedditPost,
  auth: RedditAuth,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<string> {
  const detailUrl = new URL(`https://oauth.reddit.com${post.permalink}.json`);
  detailUrl.searchParams.set("limit", "5");
  const response = await fetchJson(detailUrl.toString(), fetchImpl, timeoutMs, auth);

  return redditTextFromDetails(response) || post.selftext || post.title;
}

function redditTextFromDetails(response: unknown): string {
  if (!Array.isArray(response)) {
    return "";
  }

  const postText = (response[0] as { data?: { children?: unknown[] } })?.data?.children
    ?.map((child) => (child as { data?: { title?: string; selftext?: string } }).data)
    .map((data) => [data?.title, data?.selftext].filter(Boolean).join(" "))
    .join(" ");
  const comments = (response[1] as { data?: { children?: unknown[] } })?.data?.children
    ?.map((child) => (child as { data?: { body?: string } }).data?.body)
    .filter(Boolean)
    .slice(0, 5)
    .join(" ");

  return [postText, comments].filter(Boolean).join(" ");
}

function apifyPostsFromItems(items: unknown[]): RedditPost[] {
  return items.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const data = item as Record<string, unknown>;
    const title = firstString(data.title, data.name, data.postTitle);
    const permalink = firstString(data.url, data.permalink, data.postUrl, data.link);

    if (!title || !permalink) {
      return [];
    }

    return [
      {
        title,
        permalink,
        selftext: [
          firstString(data.body, data.text, data.selftext, data.content, data.description),
          firstString(data.subreddit, data.communityName),
        ]
          .filter(Boolean)
          .join(" "),
      },
    ];
  });
}

function firstString(...values: unknown[]): string {
  const value = values.find((candidate) => typeof candidate === "string" && candidate.trim());

  return typeof value === "string" ? value : "";
}

function sanitizeUntrustedText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function inferCompanyName(companyUrl: string): string {
  try {
    const hostname = new URL(companyUrl).hostname.replace(/^www\./, "");
    return hostname.split(".")[0] ?? "";
  } catch {
    return "";
  }
}
