"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/guest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), role: role.trim() }),
      });
      if (!res.ok) throw new Error("failed");
      router.push("/");
      router.refresh();
    } catch {
      setError("Something went wrong — try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-lg border border-neutral-200 bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <span className="font-mono text-xl font-semibold tracking-tight text-route-700">
            journi<span className="text-route-400">/</span>
          </span>
          <p className="mt-1 text-sm text-neutral-500">Self-serve B2B deal journey configuration</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">Your name</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Jordan"
              maxLength={60}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-route-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">
              Your role <span className="font-normal text-neutral-400">(optional)</span>
            </label>
            <input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="e.g. legal_counsel — matches the roles set up in Reviewer roles"
              maxLength={60}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-route-500"
            />
            <p className="mt-1 text-xs text-neutral-400">
              Only used to show you review requests assigned to that role on your dashboard's "Action needed" tab —
              skip it if you're just browsing.
            </p>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={!name.trim() || loading}
            className="w-full rounded-md bg-route-600 px-4 py-2 text-sm font-medium text-white hover:bg-route-700 disabled:opacity-40"
          >
            {loading ? "Continuing…" : "Continue as guest"}
          </button>
        </form>
        <p className="mt-4 text-center text-xs text-neutral-400">
          No password needed — this just labels who created/reviewed things. Not real authentication.
        </p>
      </div>
    </div>
  );
}
