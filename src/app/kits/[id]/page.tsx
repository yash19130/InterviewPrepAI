"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { ProtectedRoute } from "@/components/protected-route";
import { apiFetch, type KitResponse } from "@/lib/client/api";
import {
  markFlashcardEdited,
  markQuestionEdited,
  markScheduleEdited,
  type KitEditMetadata,
} from "@/lib/kits/preservation";
import { getRedditInsight } from "@/lib/kits/reddit";
import type { Kit, Question } from "@/lib/schemas";

type Confidence = "low" | "medium" | "high";

export default function KitDetailPage() {
  const params = useParams<{ id: string }>();
  const [kit, setKit] = useState<Kit | null>(null);
  const [metadata, setMetadata] = useState<KitEditMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState("");
  const [confidence, setConfidence] = useState<Record<string, Confidence>>({});
  const kitRef = useRef<Kit | null>(null);
  const metadataRef = useRef<KitEditMetadata | null>(null);

  function applyKit(nextKit: Kit | null) {
    kitRef.current = nextKit;
    setKit(nextKit);
  }

  function applyMetadata(nextMetadata: KitEditMetadata | null) {
    metadataRef.current = nextMetadata;
    setMetadata(nextMetadata);
  }

  useEffect(() => {
    apiFetch<KitResponse>(`/api/kits/${params.id}`)
      .then((response) => {
        applyKit(response.currentKit);
        applyMetadata(response.metadata);
      })
      .catch((loadError) =>
        setError(loadError instanceof Error ? loadError.message : "Could not load kit."),
      )
      .finally(() => setLoading(false));
  }, [params.id]);

  const mustRequirements = useMemo(
    () => kit?.role.requirements.filter((requirement) => requirement.priority === "must") ?? [],
    [kit],
  );
  const coveredRequirementIds = useMemo(
    () => new Set(kit?.questions.flatMap((question) => question.requirement_ids) ?? []),
    [kit],
  );
  const sortedPracticeQuestions = useMemo(() => {
    if (!kit) {
      return [];
    }

    const weight: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };

    return [...kit.questions].sort((left, right) => {
      const leftScore = weight[confidence[left.id] ?? "low"];
      const rightScore = weight[confidence[right.id] ?? "low"];

      if (leftScore !== rightScore) {
        return leftScore - rightScore;
      }

      return left.id.localeCompare(right.id);
    });
  }, [confidence, kit]);
  const redditInsight = useMemo(() => kit ? getRedditInsight(kit) : null, [kit]);

  async function saveKit(nextKit?: Kit | null, nextMetadata?: KitEditMetadata | null) {
    const kitToSave = nextKit ?? kitRef.current;
    const metadataToSave = nextMetadata ?? metadataRef.current;

    if (!kitToSave || !metadataToSave) {
      return;
    }

    setSaving(true);
    setError("");

    try {
      const response = await apiFetch<KitResponse>(`/api/kits/${params.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          kit: kitToSave,
          metadata: metadataToSave,
        }),
      });
      applyKit(response.currentKit);
      applyMetadata(response.metadata);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save kit.");
    } finally {
      setSaving(false);
    }
  }

  async function regenerateKit() {
    setRegenerating(true);
    setError("");

    try {
      const response = await apiFetch<KitResponse>(`/api/kits/${params.id}/regenerate`, {
        method: "POST",
      });
      applyKit(response.currentKit);
      applyMetadata(response.metadata);
    } catch (regenerateError) {
      setError(
        regenerateError instanceof Error ? regenerateError.message : "Could not regenerate kit.",
      );
    } finally {
      setRegenerating(false);
    }
  }

  function updateQuestion(
    questionId: string,
    field: keyof Pick<Question, "prompt" | "answer_outline">,
    value: string,
  ) {
    if (!kit || !metadata) {
      return;
    }

    const nextKit = {
      ...kit,
      questions: kit.questions.map((question) =>
        question.id === questionId ? { ...question, [field]: value } : question,
      ),
    };
    const nextMetadata = markQuestionEdited(metadata, questionId, field);

    applyKit(nextKit);
    applyMetadata(nextMetadata);
  }

  function updateFlashcard(
    flashcardId: string,
    field: "front" | "back",
    value: string,
  ) {
    if (!kit || !metadata) {
      return;
    }

    const nextKit = {
      ...kit,
      flashcards: kit.flashcards.map((flashcard) =>
        flashcard.id === flashcardId ? { ...flashcard, [field]: value } : flashcard,
      ),
    };
    const nextMetadata = markFlashcardEdited(metadata, flashcardId, field);

    applyKit(nextKit);
    applyMetadata(nextMetadata);
  }

  function updateSchedule(day: number, focus: string) {
    if (!kit || !metadata) {
      return;
    }

    const nextKit = {
      ...kit,
      schedule: {
        ...kit.schedule,
        days: kit.schedule.days.map((scheduleDay) =>
          scheduleDay.day === day ? { ...scheduleDay, focus } : scheduleDay,
        ),
      },
    };
    const nextMetadata = markScheduleEdited(metadata, day);

    applyKit(nextKit);
    applyMetadata(nextMetadata);
  }

  function downloadJson() {
    if (!kit) {
      return;
    }

    const blob = new Blob([`${JSON.stringify(kit, null, 2)}\n`], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "interview-kit.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <ProtectedRoute>
      <AppShell>
        {loading ? <p className="text-sm text-slate-600">Loading kit...</p> : null}
        {error ? (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}
        {kit && metadata ? (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="min-w-0 space-y-6">
              <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                  <div>
                    <h1 className="text-2xl font-semibold">
                      {kit.role.title || "Interview kit"}
                    </h1>
                    <p className="mt-1 text-sm text-slate-600">
                      {kit.source.company_url} · {kit.schedule.days_available} days
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => saveKit()}
                      disabled={saving}
                      className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-100 disabled:opacity-60"
                    >
                      {saving ? "Saving..." : "Save edits"}
                    </button>
                    <button
                      type="button"
                      onClick={regenerateKit}
                      disabled={regenerating}
                      className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-100 disabled:opacity-60"
                    >
                      {regenerating ? "Regenerating..." : "Regenerate"}
                    </button>
                    <button
                      type="button"
                      onClick={downloadJson}
                      className="rounded-md bg-slate-950 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                    >
                      Export JSON
                    </button>
                  </div>
                </div>
              </section>

              <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold">Coverage</h2>
                <div className="mt-3 grid gap-2">
                  {mustRequirements.map((requirement) => (
                    <div
                      key={requirement.id}
                      className="flex items-start justify-between gap-3 rounded-md border border-slate-200 p-3"
                    >
                      <div>
                        <p className="text-sm font-medium">{requirement.text}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {requirement.id} · {requirement.kind}
                        </p>
                      </div>
                      <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                        {coveredRequirementIds.has(requirement.id) ? "Covered" : "Open"}
                      </span>
                    </div>
                  ))}
                  {mustRequirements.length === 0 ? (
                    <p className="text-sm text-slate-600">No must-have requirements found.</p>
                  ) : null}
                </div>
              </section>

              <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold">What people on Reddit say</h2>
                {redditInsight?.found ? (
                  <div className="mt-3 grid gap-2">
                    <p className="text-sm text-slate-600">{redditInsight.message}</p>
                    {redditInsight.sources.map((source) => (
                      <a
                        key={source}
                        href={source}
                        target="_blank"
                        rel="noreferrer"
                        className="break-all rounded-md border border-slate-200 p-3 text-sm text-slate-700 underline hover:bg-slate-50"
                      >
                        {source}
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-slate-600">
                    {redditInsight?.message ?? "Didn't find interview experiences on Reddit."}
                  </p>
                )}
              </section>

              <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold">Questions</h2>
                <div className="mt-4 grid gap-4">
                  {kit.questions.map((question) => (
                    <article key={question.id} className="rounded-md border border-slate-200 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          {question.id} · {question.category} · difficulty {question.difficulty}
                        </span>
                      </div>
                      <textarea
                        value={question.prompt}
                        onChange={(event) =>
                          updateQuestion(question.id, "prompt", event.target.value)
                        }
                        rows={2}
                        className="mt-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
                      />
                      <textarea
                        value={question.answer_outline}
                        onChange={(event) =>
                          updateQuestion(question.id, "answer_outline", event.target.value)
                        }
                        rows={4}
                        className="mt-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
                      />
                    </article>
                  ))}
                </div>
              </section>

              <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold">Flashcards</h2>
                <div className="mt-4 grid gap-4">
                  {kit.flashcards.map((flashcard) => (
                    <article key={flashcard.id} className="rounded-md border border-slate-200 p-4">
                      <input
                        value={flashcard.front}
                        onChange={(event) =>
                          updateFlashcard(flashcard.id, "front", event.target.value)
                        }
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-medium outline-none focus:border-slate-900"
                      />
                      <textarea
                        value={flashcard.back}
                        onChange={(event) =>
                          updateFlashcard(flashcard.id, "back", event.target.value)
                        }
                        rows={3}
                        className="mt-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
                      />
                    </article>
                  ))}
                </div>
              </section>

              <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold">Schedule</h2>
                <div className="mt-4 grid gap-3">
                  {kit.schedule.days.map((day) => (
                    <div
                      key={day.day}
                      className="grid gap-3 rounded-md border border-slate-200 p-3 md:grid-cols-[90px_minmax(0,1fr)_100px]"
                    >
                      <div className="text-sm font-medium">Day {day.day}</div>
                      <input
                        value={day.focus}
                        onChange={(event) => updateSchedule(day.day, event.target.value)}
                        className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
                      />
                      <div className="text-sm text-slate-600">{day.minutes} min</div>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <aside className="space-y-6">
              <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold">Practice</h2>
                <div className="mt-4 grid gap-3">
                  {sortedPracticeQuestions.map((question) => (
                    <PracticeQuestion
                      key={question.id}
                      question={question}
                      confidence={confidence[question.id] ?? "low"}
                      onChange={(value) =>
                        setConfidence((current) => ({ ...current, [question.id]: value }))
                      }
                    />
                  ))}
                </div>
              </section>
            </aside>
          </div>
        ) : null}
      </AppShell>
    </ProtectedRoute>
  );
}

function PracticeQuestion({
  question,
  confidence,
  onChange,
}: {
  question: Question;
  confidence: Confidence;
  onChange: (confidence: Confidence) => void;
}) {
  return (
    <article className="rounded-md border border-slate-200 p-3">
      <p className="text-sm font-medium">{question.prompt}</p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {(["low", "medium", "high"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => onChange(value)}
            className={`rounded-md border px-2 py-1 text-xs font-medium ${
              confidence === value
                ? "border-slate-950 bg-slate-950 text-white"
                : "border-slate-300 hover:bg-slate-100"
            }`}
          >
            {value}
          </button>
        ))}
      </div>
    </article>
  );
}
