# AI Interview Prep Kit

A full-stack, AI-powered interview preparation platform built for the Trao engineering assessment. The application analyzes job descriptions, researches companies, and generates structured, personalized interview preparation kits with interactive flashcard practice modes.

## Tech Stack
- **Frontend & Framework:** Next.js App Router, React, Tailwind CSS, TypeScript
- **Backend & API:** Next.js Serverless Routes, Node.js
- **Database & Auth:** Firebase (Firestore, Authentication)
- **AI & Data Enrichment:** Google Gemini API (gemini-3.6-flash), Apify (reddit-scraper-lite), Zod (Schema Validation)

## High-Level Design & Architecture

1. **Shared Generation Pipeline (`src/lib/pipeline/generateKit.ts`)**: 
   A robust, fault-tolerant orchestrator that blends LLM intelligence with deterministic constraints. It extracts JD requirements, synthesizes company research, and invokes Gemini via structured JSON schema to generate questions and flashcards.
2. **Deterministic Fallbacks (`src/lib/deterministic/`)**: 
   Regardless of LLM availability or quality, the system guarantees 100% coverage of "must-have" requirements. The scheduler algorithmically maps questions to exactly the number of days requested, sorting by difficulty and priority without LLM hallucinations.
3. **Company Research Engine (`src/lib/research/`)**:
   Scrapes company domains (with SSRF protection against loopback/private IPs) and queries Reddit via Apify to pull real interview experiences.
4. **Resilient Data Store (`src/lib/kits/`)**:
   Firestore architecture separates the original generated kit from user-modified metadata (pinned items, edits, confidence scores). This allows for partial regeneration (e.g., regenerating just the schedule or just the questions) without wiping out user modifications.

## User Flow

1. **Authentication:** Users register/login securely via Firebase Auth.
2. **Dashboard & Kit Creation:** Users can paste a single Job Description + URL, or use the **Bulk Upload (JSON)** feature to sequentially generate multiple kits from an array of roles.
3. **Generation Phase:** 
   - The backend scrapes the provided company URL and searches for interview experiences.
   - Gemini models extract strict, structured requirements (Must-Have vs. Nice-to-Have).
   - Questions and Flashcards are generated dynamically based on the JD and research.
   - The Deterministic Scheduler distributes the workload exactly across the user's available days.
4. **Interactive Preparation:** 
   - Users review the "Company Brief" and "Schedule".
   - The **Practice Mode** offers a step-through Flashcard UI. Users reveal answers and rate their confidence (Low, Medium, High).
   - Flashcards are re-sorted dynamically so users are tested on their weakest spots first.
5. **Iterative Refinement:**
   - Users can manually edit, add, or delete questions.
   - Entire sections (Questions, Schedule, Brief) can be regenerated with a single click while preserving manual edits elsewhere.

## Setup & Local Development

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env.local
```

### Environment Variables
Set the following inside `.env.local`:
- `GEMINI_API_KEY`: Enables AI generation (defaults to `gemini-3.6-flash`).
- **Firebase config:** Needed for Auth and Firestore (`NEXT_PUBLIC_FIREBASE_API_KEY`, `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, etc.).
- `APIFY_API_KEY`: (Optional) Enables Reddit scraping for interview experiences.
- `NODE_ENV`: Set to `production` to test strict SSRF protections on the research engine.

### Running the App
```bash
# Start the web app
npm run dev

# Run tests
npm test

# Run the CLI batch evaluator
npm run evaluate -- --input cases.json --output kits.json
```

## Core Features

- **SSRF Protection:** Web scraper blocks loopback (`127.0.0.1`, `localhost`) and private CIDRs in production.
- **Strict Schedule Allocation:** Questions are sorted by requirement priority and difficulty, then allocated modulo `days_available`. Exactly the requested number of days are populated.
- **Flashcard Spaced-Repetition:** Confidence ratings persist to Firestore. Low-confidence cards jump to the front of the queue.
- **Single-Section Regeneration:** Users can fix one bad section of a kit without throwing out the entire generated kit.
