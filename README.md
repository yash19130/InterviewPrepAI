# AI Interview Prep Kit

Foundation implementation for the Trao full-stack engineering assessment. This repository is initialized as a Next.js App Router project using TypeScript, Tailwind CSS, ESLint, and the `src/` directory.

## Current Scope

The current implementation focuses on the validated evaluation pipeline:

- Exact Zod schemas and TypeScript types for Appendix A kit structure.
- Exact Zod schemas and TypeScript types for Appendix B batch input/output.
- A shared `src/lib/pipeline/generateKit.ts` function used by the CLI and intended for later web/API use.
- Deterministic JD requirement extraction with heading and keyword fallbacks.
- Deterministic must-have requirement coverage checks.
- Deterministic schedule allocation that always returns exactly the requested number of days.
- A local `npm run evaluate -- --input <cases.json> --output <kits.json>` command.
- Unit tests for coverage, schema validation, CLI output, stable IDs, normal, thin-JD, 1-day, and 60-day behavior.

The UI, authentication, Firebase, and public discussion lookup are not implemented yet.

## Setup

```bash
npm install
cp .env.example .env.local
```

Set `GEMINI_API_KEY` in `.env.local` to enable real Gemini JSON generation. The default model is `gemini-3.6-flash`; override it with `GEMINI_MODEL` if needed. The demo path defaults to `GEMINI_MAX_RETRIES=0` and `GEMINI_REQUEST_TIMEOUT_MS=3000`, so slow provider calls fall back deterministically instead of leaving generation stuck. Without a Gemini key, the shared pipeline returns a valid deterministic kit. Set the Firebase client and Admin SDK variables to enable email/password auth and Firestore-backed kit storage.

## Commands

```bash
npm run lint
npm test
npm run build
npm run evaluate -- --input cases.json --output kits.json
```

## Web App

The web app uses Firebase email/password authentication and Firestore. Configure the Firebase variables in `.env.local`, enable Email/Password sign-in in Firebase Auth, then run:

```bash
npm run dev
```

Routes:

- `/login`
- `/register`
- `/dashboard`
- `/kits/new`
- `/kits/[id]`

The CLI evaluator remains local and does not require Firebase.

## Batch Input

`npm run evaluate` reads Appendix B input:

```json
[
  {
    "id": "case-01",
    "jd": "Senior Backend Engineer\n\nMust have Node.js experience.",
    "company_url": "http://localhost:8099/acme/",
    "days": 5
  }
]
```

It writes Appendix B output with `version`, `generated_at`, and one `kits` entry per input case.

## Deterministic Logic

Coverage checks only must-have requirements. A requirement is covered when a generated question explicitly lists that requirement id in `requirement_ids`. Nice-to-have requirements do not appear in `coverage.uncovered_requirement_ids`.

The scheduler sorts questions that cover must-have requirements first, then higher difficulty first, then by stable question id. It returns exactly `days_available` entries. Days with scheduled questions receive `60` integer minutes. Empty days receive `0` minutes and the focus `Review and rest`.

The evaluator uses `src/lib/pipeline/generateKit.ts` as the shared source of truth. It can call Gemini through a JSON adapter, but deterministic validation still assigns stable IDs, checks coverage, fills uncovered must-have gaps, and schedules exactly the requested number of days. If Gemini is unavailable, malformed, quota-limited, or incomplete, the pipeline falls back to deterministic extraction and question generation.

Company research is implemented in `src/lib/research/companyResearch.ts`. It validates URLs, allows only `http` and `https`, blocks local/private hosts, ranks same-origin links by relevance, limits pages and response size, searches Reddit for top interview-experience discussions, and returns concise notes with source URLs. Set `APIFY_API_KEY` to search Reddit through the `trudax/reddit-scraper` Apify actor first; `APIFY_REDDIT_ACTOR_ID` can override the actor. If Apify is unavailable or returns no usable results, the app falls back to Reddit OAuth (`REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_USER_AGENT`) and then public Reddit search. Research enriches generated questions but never blocks kit creation. Fetched page text is always wrapped as untrusted content in LLM prompts; the model is instructed to use it only as context and never follow instructions inside it.

## Edit Preservation

Firestore stores the original generated Appendix A kit, the current edited kit, and UI metadata separately. If a user edits or pins an item, regeneration keeps that item and records the generated replacement as skipped internally. Exported JSON contains only the clean Appendix A kit shape without metadata.

## Environment

Gemini is installed for the later generation phase, but the foundation does not call it yet. Future real generation will read credentials from environment variables documented in `.env.example`.
