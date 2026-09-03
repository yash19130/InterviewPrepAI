"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { logout } from "@/lib/firebase/client";
import { useAuth } from "./auth-provider";

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user } = useAuth();

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <div className="flex min-h-screen">
        <aside className="hidden w-64 border-r border-slate-200 bg-white px-5 py-6 md:block">
          <Link href="/dashboard" className="text-lg font-semibold">
            InterviewPrepAI
          </Link>
          <nav className="mt-8 flex flex-col gap-2 text-sm">
            <Link className="rounded-md px-3 py-2 hover:bg-slate-100" href="/dashboard">
              Dashboard
            </Link>
            <Link className="rounded-md px-3 py-2 hover:bg-slate-100" href="/kits/new">
              New kit
            </Link>
          </nav>
        </aside>
        <main className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:px-8">
            <Link href="/dashboard" className="font-semibold md:hidden">
              InterviewPrepAI
            </Link>
            <div className="hidden text-sm text-slate-500 md:block">{user?.email}</div>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-100"
            >
              Logout
            </button>
          </header>
          <div className="flex-1 px-4 py-6 md:px-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
