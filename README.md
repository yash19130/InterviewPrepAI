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

Set `GEMINI_API_KEY` in `.env.local` to enable real Gemini JSON generation. Without it, the shared pipeline returns a valid deterministic kit.

## Commands

```bash
npm run lint
npm test
npm run build
npm run evaluate -- --input cases.json --output kits.json
```

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

Company research is implemented in `src/lib/research/companyResearch.ts`. It validates URLs, allows only `http` and `https`, blocks local/private hosts, ranks same-origin links by relevance, limits pages and response size, and returns concise notes with source URLs. Research enriches generated questions but never blocks kit creation.

## Environment

Gemini is installed for the later generation phase, but the foundation does not call it yet. Future real generation will read credentials from environment variables documented in `.env.example`.
