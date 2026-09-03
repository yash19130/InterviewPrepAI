"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { loginWithEmail, registerWithEmail } from "@/lib/firebase/client";

type AuthFormProps = {
  mode: "login" | "register";
};

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const isLogin = mode === "login";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      if (isLogin) {
        await loginWithEmail(email, password);
      } else {
        await registerWithEmail(email, password);
      }

      router.replace(searchParams.get("next") || "/dashboard");
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Authentication failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h1 className="text-2xl font-semibold text-slate-950">
          {isLogin ? "Log in" : "Create account"}
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Use email and password to access your interview kits.
        </p>

        <label className="mt-6 block text-sm font-medium text-slate-700">
          Email
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            required
            className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
          />
        </label>

        <label className="mt-4 block text-sm font-medium text-slate-700">
          Password
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            required
            minLength={6}
            className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
          />
        </label>

        {error ? (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={loading}
          className="mt-6 w-full rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Please wait..." : isLogin ? "Log in" : "Register"}
        </button>

        <p className="mt-4 text-center text-sm text-slate-600">
          {isLogin ? "No account yet?" : "Already have an account?"}{" "}
          <Link
            href={isLogin ? "/register" : "/login"}
            className="font-medium text-slate-950 underline"
          >
            {isLogin ? "Register" : "Log in"}
          </Link>
        </p>
      </form>
    </main>
  );
}
