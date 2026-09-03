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

The UI, authentication, Firebase, crawler, public discussion lookup, and real LLM calls are not implemented yet.

## Setup

```bash
npm install
cp .env.example .env.local
```

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

The evaluator uses deterministic mocked generation through an `LlmAdapter` interface. Real Gemini generation can be plugged into that adapter later without changing the CLI or web entry points. The deterministic extractor preserves only requirement-like JD lines, creates one question and one flashcard per extracted requirement, and uses a gap pass to add targeted questions if a must-have requirement was missed by the adapter. It does not enrich thin job descriptions or invent requirements absent from the JD.

## Environment

Gemini is installed for the later generation phase, but the foundation does not call it yet. Future real generation will read credentials from environment variables documented in `.env.example`.
