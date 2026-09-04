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
import type { Kit, Question, Flashcard, CompanyBrief } from "@/lib/schemas";

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
  const [currentFlashcardIndex, setCurrentFlashcardIndex] = useState(0);
  const [isAnswerRevealed, setIsAnswerRevealed] = useState(false);
  const kitRef = useRef<Kit | null>(null);
  const metadataRef = useRef<KitEditMetadata | null>(null);

  function applyKit(nextKit: Kit | null) {
    kitRef.current = nextKit;
    setKit(nextKit);
  }

  function applyMetadata(nextMetadata: KitEditMetadata | null) {
    metadataRef.current = nextMetadata;
    setMetadata(nextMetadata);
    if (nextMetadata?.flashcardConfidence) {
      setConfidence(nextMetadata.flashcardConfidence);
    }
  }

  useEffect(() => {
    apiFetch<KitResponse>(`/api/kits/${params.id}`, { cache: "no-store" })
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
  const coveredMustCount = useMemo(
    () => mustRequirements.filter((requirement) => coveredRequirementIds.has(requirement.id)).length,
    [coveredRequirementIds, mustRequirements],
  );
  const sortedPracticeFlashcards = useMemo(() => {
    if (!kit) {
      return [];
    }

    const weight: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };

    return [...kit.flashcards].sort((left, right) => {
      const leftScore = weight[confidence[left.id] ?? "low"];
      const rightScore = weight[confidence[right.id] ?? "low"];

      if (leftScore !== rightScore) {
        return leftScore - rightScore;
      }

      return left.id.localeCompare(right.id);
    });
  }, [confidence, kit]);
  const redditInsight = useMemo(() => kit ? getRedditInsight(kit) : null, [kit]);

  function updateConfidence(flashcardId: string, value: Confidence) {
    setConfidence((current) => ({ ...current, [flashcardId]: value }));
    
    if (!metadataRef.current) return;
    const nextMetadata = {
      ...metadataRef.current,
      flashcardConfidence: {
        ...(metadataRef.current.flashcardConfidence || {}),
        [flashcardId]: value,
      }
    };
    applyMetadata(nextMetadata);
    // Auto-save confidence
    saveKit(kitRef.current, nextMetadata);
  }

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

  async function regenerateKit(section?: string) {
    setRegenerating(true);
    setError("");

    try {
      const response = await apiFetch<KitResponse>(`/api/kits/${params.id}/regenerate`, {
        method: "POST",
        body: section ? JSON.stringify({ section }) : undefined,
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

  function updateQuestion<K extends keyof Question>(
    questionId: string,
    field: K,
    value: Question[K],
  ) {
    if (!kitRef.current || !metadataRef.current) {
      return;
    }

    const currentKit = kitRef.current;
    const currentMetadata = metadataRef.current;

    const nextKit = {
      ...currentKit,
      questions: currentKit.questions.map((question) =>
        question.id === questionId ? { ...question, [field]: value } : question,
      ),
    };
    
    const nextMetadata = markQuestionEdited(currentMetadata, questionId, field as any);

    applyKit(nextKit);
    applyMetadata(nextMetadata);
  }

  function updateFlashcard<K extends keyof Flashcard>(
    flashcardId: string,
    field: K,
    value: Flashcard[K],
  ) {
    if (!kitRef.current || !metadataRef.current) {
      return;
    }

    const currentKit = kitRef.current;
    const currentMetadata = metadataRef.current;

    const nextKit = {
      ...currentKit,
      flashcards: currentKit.flashcards.map((flashcard) =>
        flashcard.id === flashcardId ? { ...flashcard, [field]: value } : flashcard,
      ),
    };
    const nextMetadata = markFlashcardEdited(currentMetadata, flashcardId, field as any);

    applyKit(nextKit);
    applyMetadata(nextMetadata);
  }

  function moveQuestion(index: number, direction: -1 | 1) {
    if (!kitRef.current || !metadataRef.current) return;
    const currentKit = kitRef.current;
    if (index + direction < 0 || index + direction >= currentKit.questions.length) return;
    
    const newQuestions = [...currentKit.questions];
    const temp = newQuestions[index];
    newQuestions[index] = newQuestions[index + direction];
    newQuestions[index + direction] = temp;
    
    applyKit({ ...currentKit, questions: newQuestions });
  }
  
  function deleteQuestion(id: string) {
    if (!kitRef.current || !metadataRef.current) return;
    const currentKit = kitRef.current;
    
    applyKit({
      ...currentKit,
      questions: currentKit.questions.filter(q => q.id !== id),
      schedule: {
        ...currentKit.schedule,
        days: currentKit.schedule.days.map(day => ({
          ...day,
          question_ids: day.question_ids.filter(qid => qid !== id)
        }))
      }
    });
  }

  function addQuestion() {
    if (!kitRef.current || !metadataRef.current) return;
    const currentKit = kitRef.current;
    
    const category = currentKit.questions[0]?.category ?? "technical";
    const reqId = currentKit.role.requirements[0]?.id;
    
    const newQuestion: Question = {
      id: `q_manual_${Date.now()}`,
      requirement_ids: reqId ? [reqId] : [],
      category,
      prompt: "",
      answer_outline: "",
      difficulty: 2,
    };
    
    const nextMetadata = markQuestionEdited(metadataRef.current, newQuestion.id, "prompt");
    
    applyKit({ ...currentKit, questions: [...currentKit.questions, newQuestion] });
    applyMetadata(nextMetadata);
  }

  function deleteFlashcard(id: string) {
    if (!kitRef.current || !metadataRef.current) return;
    applyKit({
      ...kitRef.current,
      flashcards: kitRef.current.flashcards.filter(f => f.id !== id)
    });
  }

  function addFlashcard() {
    if (!kitRef.current || !metadataRef.current) return;
    const currentKit = kitRef.current;
    const reqId = currentKit.role.requirements[0]?.id;
    
    const newFlashcard = {
      id: `f_manual_${Date.now()}`,
      requirement_ids: reqId ? [reqId] : [],
      front: "",
      back: "",
    };
    
    const nextMetadata = markFlashcardEdited(metadataRef.current, newFlashcard.id, "front");
    
    applyKit({ ...currentKit, flashcards: [...currentKit.flashcards, newFlashcard] });
    applyMetadata(nextMetadata);
  }

  function updateSchedule(day: number, focus: string) {
    if (!kitRef.current || !metadataRef.current) {
      return;
    }

    const currentKit = kitRef.current;
    const currentMetadata = metadataRef.current;

    const nextKit = {
      ...currentKit,
      schedule: {
        ...currentKit.schedule,
        days: currentKit.schedule.days.map((scheduleDay) =>
          scheduleDay.day === day ? { ...scheduleDay, focus } : scheduleDay,
        ),
      },
    };
    const nextMetadata = markScheduleEdited(currentMetadata, day);

    applyKit(nextKit);
    applyMetadata(nextMetadata);
  }

  function updateCompanyBrief(field: "summary" | "what_they_do", value: string) {
    if (!kitRef.current || !metadataRef.current) return;
    const currentKit = kitRef.current;
    
    applyKit({
      ...currentKit,
      company_brief: { ...currentKit.company_brief, [field]: value }
    });
    
    applyMetadata({
      ...metadataRef.current,
      editedFields: { ...metadataRef.current.editedFields, [`company_brief.${field}`]: true }
    });
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
                      onClick={() => regenerateKit()}
                      disabled={regenerating}
                      className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-100 disabled:opacity-60"
                    >
                      {regenerating ? "Regenerating..." : "Regenerate whole kit"}
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
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Company brief</h2>
                  <button
                    type="button"
                    onClick={() => regenerateKit("company_brief")}
                    disabled={regenerating}
                    className="text-sm font-medium text-slate-600 hover:text-slate-900 disabled:opacity-50"
                  >
                    Regenerate brief
                  </button>
                </div>
                <div className="mt-4 grid gap-4">
                  <textarea
                    value={kit.company_brief.summary}
                    onChange={(event) => updateCompanyBrief("summary", event.target.value)}
                    rows={2}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-medium outline-none focus:border-slate-900"
                  />
                  <textarea
                    value={kit.company_brief.what_they_do}
                    onChange={(event) => updateCompanyBrief("what_they_do", event.target.value)}
                    rows={4}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
                  />
                </div>
              </section>

              <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                  <div>
                    <h2 className="text-lg font-semibold">Coverage</h2>
                    <p className="mt-1 text-sm text-slate-600">
                      {coveredMustCount} of {mustRequirements.length} must-have requirements covered
                    </p>
                  </div>
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">
                    {kit.coverage.uncovered_requirement_ids.length === 0 ? "Complete" : "Needs review"}
                  </span>
                </div>
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm font-medium text-slate-700">
                    View requirement details
                  </summary>
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
                </details>
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
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Questions</h2>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => regenerateKit("questions")}
                      disabled={regenerating}
                      className="text-sm font-medium text-slate-600 hover:text-slate-900 disabled:opacity-50"
                    >
                      Regenerate questions
                    </button>
                    <button
                      type="button"
                      onClick={addQuestion}
                      className="text-sm font-medium text-slate-600 hover:text-slate-900 disabled:opacity-50"
                    >
                      + Add question
                    </button>
                  </div>
                </div>
                <div className="mt-4 grid gap-4">
                  {kit.questions.map((question, index) => (
                    <article key={question.id} className="rounded-md border border-slate-200 p-4 relative group">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 flex items-center">
                          {question.id} ·
                          <select
                            value={question.category}
                            onChange={(e) => updateQuestion(question.id, "category", e.target.value as any)}
                            className="bg-transparent outline-none mx-1 cursor-pointer hover:bg-slate-100 rounded"
                          >
                            <option value="technical">Technical</option>
                            <option value="behavioural">Behavioural</option>
                            <option value="system-design">System Design</option>
                            <option value="company-fit">Company Fit</option>
                          </select>
                           · difficulty {question.difficulty}
                        </span>
                        
                        <div className="flex items-center gap-1 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={() => moveQuestion(index, -1)}
                            disabled={index === 0}
                            className="hover:text-slate-700 disabled:opacity-30 p-1"
                            title="Move up"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            onClick={() => moveQuestion(index, 1)}
                            disabled={index === kit.questions.length - 1}
                            className="hover:text-slate-700 disabled:opacity-30 p-1"
                            title="Move down"
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteQuestion(question.id)}
                            className="hover:text-red-600 ml-2 p-1"
                            title="Delete question"
                          >
                            ✕
                          </button>
                        </div>
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
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Flashcards</h2>
                  <button
                    type="button"
                    onClick={addFlashcard}
                    className="text-sm font-medium text-slate-600 hover:text-slate-900"
                  >
                    + Add flashcard
                  </button>
                </div>
                <div className="mt-4 grid gap-4">
                  {kit.flashcards.map((flashcard) => (
                    <article key={flashcard.id} className="rounded-md border border-slate-200 p-4 relative group">
                      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => deleteFlashcard(flashcard.id)}
                          className="text-xs text-red-500 hover:text-red-700 font-semibold p-1"
                          title="Delete flashcard"
                        >
                          ✕
                        </button>
                      </div>
                      <input
                        value={flashcard.front}
                        onChange={(event) =>
                          updateFlashcard(flashcard.id, "front", event.target.value)
                        }
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-medium outline-none focus:border-slate-900 pr-8"
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
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Schedule</h2>
                  <button
                    type="button"
                    onClick={() => regenerateKit("schedule")}
                    disabled={regenerating}
                    className="text-sm font-medium text-slate-600 hover:text-slate-900 disabled:opacity-50"
                  >
                    Regenerate schedule
                  </button>
                </div>
                <div className="mt-4 grid gap-3">
                  {kit.schedule.days.map((day) => (
                    <div
                      key={day.day}
                      className="flex flex-col gap-3 rounded-md border border-slate-200 p-3"
                    >
                      <div className="grid gap-3 md:grid-cols-[90px_minmax(0,1fr)_100px] items-center">
                        <div className="text-sm font-medium">Day {day.day}</div>
                        <input
                          value={day.focus}
                          onChange={(event) => updateSchedule(day.day, event.target.value)}
                          className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
                        />
                        <div className="text-sm text-slate-600 md:text-right">{day.minutes} min</div>
                      </div>
                      {day.question_ids && day.question_ids.length > 0 && (
                        <div className="mt-1 space-y-2 border-t border-slate-100 pt-3">
                          {day.question_ids.map((qid) => {
                            const q = kit.questions.find((q) => q.id === qid);
                            return q ? (
                              <div key={qid} className="text-sm text-slate-600 flex items-start gap-2">
                                <span className="inline-block mt-[2px] h-1.5 w-1.5 rounded-full bg-slate-300 shrink-0"></span>
                                <span>{q.prompt}</span>
                              </div>
                            ) : null;
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <aside className="space-y-6">
              <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold">Practice</h2>
                <div className="mt-4">
                  {sortedPracticeFlashcards.length > 0 ? (
                    <div className="rounded-md border border-slate-200 p-4 min-h-[200px] flex flex-col justify-between">
                      <div className="text-center mb-4">
                        <span className="text-xs font-semibold text-slate-500">
                          Card {currentFlashcardIndex + 1} of {sortedPracticeFlashcards.length}
                        </span>
                      </div>
                      
                      <div className="text-center flex-grow flex items-center justify-center">
                        <p className="text-base font-medium">
                          {sortedPracticeFlashcards[currentFlashcardIndex].front}
                        </p>
                      </div>

                      {isAnswerRevealed ? (
                        <div className="mt-6 border-t border-slate-200 pt-4 text-center">
                          <p className="text-sm text-slate-700 whitespace-pre-wrap">
                            {sortedPracticeFlashcards[currentFlashcardIndex].back}
                          </p>
                          <div className="mt-4">
                            <p className="text-xs font-semibold text-slate-500 mb-2">How confident were you?</p>
                            <div className="flex justify-center gap-2">
                              {(["low", "medium", "high"] as const).map((value) => (
                                <button
                                  key={value}
                                  type="button"
                                  onClick={() => {
                                    updateConfidence(sortedPracticeFlashcards[currentFlashcardIndex].id, value);
                                    setIsAnswerRevealed(false);
                                    setCurrentFlashcardIndex((prev) => (prev + 1) % sortedPracticeFlashcards.length);
                                  }}
                                  className={`rounded-md border px-3 py-1 text-sm font-medium ${
                                    confidence[sortedPracticeFlashcards[currentFlashcardIndex].id] === value
                                      ? "border-slate-950 bg-slate-950 text-white"
                                      : "border-slate-300 hover:bg-slate-100"
                                  }`}
                                >
                                  {value}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-6 text-center">
                          <button
                            type="button"
                            onClick={() => setIsAnswerRevealed(true)}
                            className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                          >
                            Reveal Answer
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-600">No flashcards available.</p>
                  )}
                </div>
              </section>
            </aside>
          </div>
        ) : null}
      </AppShell>
    </ProtectedRoute>
  );
}
