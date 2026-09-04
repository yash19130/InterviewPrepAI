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

  const [fileError, setFileError] = useState("");
  const [batchStatus, setBatchStatus] = useState<string>("");

  async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setFileError("");
    setBatchStatus(`Parsing ${file.name}...`);

    try {
      const text = await file.text();
      const items = JSON.parse(text) as Array<{ jd?: string; companyUrl?: string; days?: number; company_url?: string }>;
      
      if (!Array.isArray(items)) {
        throw new Error("JSON must be an array of objects.");
      }

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        setBatchStatus(`Generating kit ${i + 1} of ${items.length}...`);
        
        await apiFetch<{ id: string }>("/api/kits/generate", {
          method: "POST",
          body: JSON.stringify({
            jd: item.jd || "",
            company_url: item.companyUrl || item.company_url || "",
            days: item.days || 5,
          }),
        });
      }
      
      setBatchStatus("Batch generation complete! Redirecting to dashboard...");
      setTimeout(() => router.push("/dashboard"), 1500);
    } catch (e) {
      setFileError(e instanceof Error ? e.message : "Error processing file.");
      setLoading(false);
    }
  }

  return (
    <ProtectedRoute>
      <AppShell>
        <div className="mx-auto max-w-4xl">
          <div>
            <h1 className="text-2xl font-semibold">New interview kit</h1>
            <p className="mt-1 text-sm text-slate-600">
              Paste the JD, company URL, and timeline. Generation can fall back safely if
              research or Gemini is unavailable.
            </p>
          </div>

          <div className="mt-6 p-5 border border-slate-200 rounded-lg bg-slate-50 mb-6">
            <h2 className="text-lg font-semibold mb-2">Bulk upload (JSON)</h2>
            <p className="text-sm text-slate-600 mb-4">Upload a JSON array with `jd`, `companyUrl`, and `days` to generate multiple kits sequentially.</p>
            <input 
              type="file" 
              accept=".json"
              onChange={handleFileUpload} 
              disabled={loading}
              className="text-sm"
            />
            {fileError ? <p className="text-red-600 text-sm mt-2">{fileError}</p> : null}
            {batchStatus ? <p className="text-blue-600 text-sm mt-2 font-medium">{batchStatus}</p> : null}
          </div>

          <form onSubmit={handleSubmit} className="grid gap-5 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
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
          </form>
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
