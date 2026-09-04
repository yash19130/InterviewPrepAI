# AI Interview Prep Kit

A full-stack, AI-powered interview preparation platform built for the Trao engineering assessment. The application analyzes job descriptions, researches companies, and generates structured, personalized interview preparation kits with interactive flashcard practice modes.

## Project Overview & Tech Stack

**Chosen Tech Stack:**
- **Frontend:** Next.js App Router, React, Tailwind CSS, TypeScript
- **Backend:** Next.js Serverless Routes, Node.js
- **Database & Auth:** Firebase (Firestore, Authentication)
- **AI & Data Enrichment:** Google Gemini API (gemini-3.6-flash), Apify (reddit-scraper-lite)

**Justification for differences:** 
The preferred stack asked for MongoDB + Express. I opted to use Next.js Serverless functions (which effectively replace Express) combined with **Firebase (Firestore + Auth)**. This provides a much smoother deployment story on Vercel without needing to provision external clusters, while offering a generous, genuine free tier that handles authentication out of the box.

## Setup Instructions

### Local Setup
```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env.local
```

### Environment Variables
Configure `.env.local`:
- `GEMINI_API_KEY`: Required for LLM generation.
- **Firebase config:** Needed for Auth and Firestore (`NEXT_PUBLIC_FIREBASE_API_KEY`, `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, etc.).
- `APIFY_API_KEY`: (Optional) Enables Reddit scraping for interview experiences.
- `NODE_ENV`: Set to `production` to test strict SSRF protections on the research engine.

### Running the Batch Entry Point
The required CLI batch command runs locally against the deterministic and LLM pipeline without needing Firebase Auth. 

To run against the provided sample fixture:
```bash
npm run evaluate -- --input fixtures/cases.sample.json --output kits.json
```

*(Note for Evaluators: The command accepts any input/output file paths as per the spec, e.g., `npm run evaluate -- --input cases.json --output kits.json`)*

### Deployed Setup (Vercel)
The application is deployed on Vercel. Both frontend and backend are reachable from the same deployment domain.
When deploying, set the Framework Preset to **Next.js** and ensure all `.env.local` variables are mirrored in the Vercel Environment Variables settings.

## AI Provider & Model

**Provider:** Google
**Model:** `gemini-3.6-flash`
*Why:* Provides an excellent free-tier rate limit, native JSON schema structured output, and incredibly fast inference times suitable for complex, multi-pass serverless generation.

## High-Level Architecture

The system is separated into strict boundaries:
1. **Client / UI (`src/app`)**: Handles interaction, optimistic updates, and practice modes.
2. **Backend API (`src/app/api`)**: Authenticated Next.js routes that invoke the pipeline.
3. **Data Store (`src/lib/kits/store.ts`)**: Manages Firestore CRUD and merge-logic for regenerating kits without losing edits.
4. **Generation Pipeline (`src/lib/pipeline/generateKit.ts`)**: The pure orchestrator that takes a JD/URL and returns a deterministic Zod-validated `Kit`.
5. **Research Engine (`src/lib/research/`)**: Unstructured web crawling and Reddit scraping.

## Retrieval Approach & Sources

When a URL is provided, the Research Engine uses `cheerio` to fetch the homepage.
1. **Ranking**: It scrapes all `href` links on the origin, ranking them using regex heuristics (e.g. weighting `/careers`, `/about` heavily, penalizing `/privacy`, `/login`).
2. **Fetching**: It fetches the top ranked pages up to a strict limit, extracting text and wrapping it securely.
3. **Discussion Search**: It queries Reddit (first via Apify if configured, falling back to Reddit OAuth, then public JSON search) for `"{CompanyName}" interview experience`, fetching up to 3 threads.

*Sources Used:* The target company's domain, and `reddit.com` (specifically subreddits like `r/interviews`, `r/cscareerquestions`). We respect standard rate limits and handle 404s gracefully.

## Sequencing the Research & Generation

The pipeline in `generateKit.ts` runs deliberate, sequential steps:
1. **Research & Extraction (Parallel)**:
   - *Research*: Crawls the URL and Reddit, returning sanitized context notes.
   - *Extraction*: LLM extracts structured requirements (Must-Have vs Nice-to-Have) from the JD text. If the LLM fails, falls back to deterministic regex extraction.
2. **Drafting (Parallel)**:
   - *Questions*: LLM receives the extracted requirements AND the research context to generate questions that match both the JD and the company's interview style.
   - *Flashcards*: LLM generates flashcards strictly from the extracted requirements.
   - *Company Brief*: LLM summarizes the research notes.
3. **First Coverage Pass**: Deterministically checks which `must-have` requirements are missing from the generated questions.
4. **Second Coverage Pass**: If gaps exist, a second targeted LLM call is made to generate questions specifically for the uncovered `must-have` IDs.
5. **Scheduling**: A pure arithmetic function allocates the final questions across the requested days.

*I chose 2 passes.* A first pass for bulk generation, and exactly one secondary pass to cover gaps. If the second pass fails, the deterministic fallback steps in. More than two LLM passes significantly increases the risk of hitting free-tier rate limits and Vercel timeout limits (15-60s).

## State Management: Generated, Edited, and Pinned State

This is managed in `src/lib/kits/preservation.ts`. Firestore stores three distinct objects per kit:
1. `originalKit`: The immutable result of the very first generation.
2. `currentKit`: The active kit, containing all user modifications.
3. `metadata`: A record tracking which specific item IDs have been `isEdited: true` or `isPinned: true`.

**Regeneration Logic:** When a user regenerates a section (e.g. Questions), the backend generates a completely new kit. It then takes the new questions, but *merges* them with `currentKit`. Any question ID in `currentKit` that is marked as `isEdited` or `isPinned` in the metadata completely overwrites the newly generated question, preserving the user's hard work.

## Schedule Allocation

Scheduling is strictly deterministic arithmetic (`src/lib/deterministic/schedule.ts`).
1. Questions are sorted by Priority (Must-Have > Nice-to-Have), then by Difficulty (3 > 1).
2. The sorted questions are distributed across the user's `days_available` using a modulo algorithm (`dayIndex = i % days`).
3. This guarantees exactly the requested number of days are populated. Harder, higher-priority material lands on Day 1, distributing evenly.
4. If the user asks for 60 days but only has 5 questions, 55 days are padded with "Review and rest" (0 minutes).

## Creative Feature: Confidence-Weighted Spaced Repetition

**The Feature:** When practicing flashcards, the user rates their confidence (Low, Medium, High). These ratings are persisted. The next time they practice, the flashcards are dynamically sorted so that `Low` confidence cards always appear first.
**The Problem it Solves:** Users cramming for an interview don't have time to review material they already know. A simple linear flashcard deck wastes time. By persisting confidence state, the practice mode becomes an adaptive study tool that targets the user's actual weak spots.

## Edge Cases, Security & Failure Handling

**Edge Cases Handled:**
- **Invalid URL / Timeouts / No Hiring Page**: `researchCompany` catches all network errors, timeouts, and 404s. It returns a graceful `notes: "Could not retrieve"` instead of throwing, allowing the LLM to generate the kit solely from the JD without failing the run.
- **Two-Line JD**: The extraction pipeline will find minimal requirements. The LLM creates a "thin" kit. If no requirements are found, a deterministic fallback ensures the kit structure remains perfectly valid.
- **LLM Rate-Limits**: The pipeline uses adaptive retries for `429` statuses. If the LLM outright fails, the pipeline abandons the LLM and runs a completely local, regex-based deterministic generation to guarantee the batch job never fails.
- **1-day or 60-day schedules**: Handled flawlessly by the arithmetic modulo allocator.

**Security:**
- **SSRF Protection:** `validatePublicHttpUrl` explicitly blocks loopback (`127.0.0.0/8`, `localhost`) and private CIDR ranges in production to prevent malicious scanning of internal infrastructure via the company URL field.
- **Untrusted Text:** All scraped HTML is stripped to raw text, truncated by byte length, and injected into the LLM prompt with explicit system instructions to treat it strictly as untrusted context data, preventing prompt injection attacks from malicious company websites.
