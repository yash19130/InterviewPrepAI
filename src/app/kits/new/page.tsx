"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { ProtectedRoute } from "@/components/protected-route";
import { apiFetch } from "@/lib/client/api";

export default function NewKitPage() {
  const router = useRouter();
  const [jd, setJd] = useState("");
  const [companyUrl, setCompanyUrl] = useState("");
  const [days, setDays] = useState(5);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const result = await apiFetch<{ id: string }>("/api/kits/generate", {
        method: "POST",
        body: JSON.stringify({
          jd,
          company_url: companyUrl,
          days,
        }),
      });
      router.push(`/kits/${result.id}`);
    } catch (generateError) {
      setError(
        generateError instanceof Error ? generateError.message : "Could not generate kit.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <ProtectedRoute>
      <AppShell>
        <form onSubmit={handleSubmit} className="mx-auto max-w-4xl">
          <div>
            <h1 className="text-2xl font-semibold">New interview kit</h1>
            <p className="mt-1 text-sm text-slate-600">
              Paste the JD, company URL, and timeline. Generation can fall back safely if
              research or Gemini is unavailable.
            </p>
          </div>

          <div className="mt-6 grid gap-5 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <label className="block text-sm font-medium text-slate-700">
              Company URL
              <input
                value={companyUrl}
                onChange={(event) => setCompanyUrl(event.target.value)}
                required
                placeholder="https://example.com"
                className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
              />
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Days until interview
              <input
                value={days}
                onChange={(event) => setDays(Number(event.target.value))}
                required
                min={1}
                max={60}
                type="number"
                className="mt-2 w-32 rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
              />
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Job description
              <textarea
                value={jd}
                onChange={(event) => setJd(event.target.value)}
                required
                rows={14}
                className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
              />
            </label>

            {error ? (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            <div>
              <button
                type="submit"
                disabled={loading}
                className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Generating..." : "Generate kit"}
              </button>
            </div>
          </div>
        </form>
      </AppShell>
    </ProtectedRoute>
  );
}
