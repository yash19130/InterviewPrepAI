"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { ProtectedRoute } from "@/components/protected-route";
import { apiFetch, type KitListItem } from "@/lib/client/api";

export default function DashboardPage() {
  const [kits, setKits] = useState<KitListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch<{ kits: KitListItem[] }>("/api/kits")
      .then((response) => setKits(response.kits))
      .catch((loadError) =>
        setError(loadError instanceof Error ? loadError.message : "Could not load kits."),
      )
      .finally(() => setLoading(false));
  }, []);

  async function deleteKit(id: string) {
    if (!confirm("Are you sure you want to delete this kit?")) {
      return;
    }

    try {
      await apiFetch(`/api/kits/${id}`, { method: "DELETE" });
      setKits(kits.filter((kit) => kit.id !== id));
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not delete kit.");
    }
  }

  return (
    <ProtectedRoute>
      <AppShell>
        <div className="flex flex-col gap-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h1 className="text-2xl font-semibold">Dashboard</h1>
              <p className="mt-1 text-sm text-slate-600">
                Saved interview preparation kits.
              </p>
            </div>
            <Link
              href="/kits/new"
              className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              New kit
            </Link>
          </div>

          {loading ? <p className="text-sm text-slate-600">Loading kits...</p> : null}
          {error ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}
          {!loading && kits.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
              <h2 className="font-medium">No kits yet</h2>
              <p className="mt-2 text-sm text-slate-600">
                Create a kit from a job description and company URL.
              </p>
            </div>
          ) : null}

          <div className="grid gap-3">
            {kits.map((kit) => (
              <div
                key={kit.id}
                className="flex flex-col justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center"
              >
                <div className="flex-1">
                  <Link href={`/kits/${kit.id}`} className="block focus:outline-none hover:underline">
                    <h2 className="font-semibold text-slate-900">{kit.role}</h2>
                    <p className="mt-1 text-sm text-slate-600">
                      {kit.companyUrl} · {kit.days} days
                    </p>
                  </Link>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-slate-500">
                    Updated {new Date(kit.updatedAt).toLocaleDateString()}
                  </span>
                  <button
                    type="button"
                    onClick={() => deleteKit(kit.id)}
                    className="text-sm font-medium text-red-600 hover:text-red-700 focus:outline-none"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
