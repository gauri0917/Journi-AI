"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, TextInput, ErrorList } from "@/components/ui";

export function StartDealForm({ journeyId }: { journeyId: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  async function start() {
    if (!name.trim()) return;
    setLoading(true);
    setErrors([]);
    try {
      const res = await fetch(`/api/journeys/${journeyId}/deals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const body = await res.json();
      if (!res.ok) {
        setErrors([body.error ?? "Could not start a deal"]);
        return;
      }
      router.push(`/deals/${body.deal.id}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <TextInput
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Acme Corp deal"
      />
      <ErrorList errors={errors} />
      <Button type="button" onClick={start} disabled={!name.trim() || loading} className="w-full">
        {loading ? "Starting…" : "Start deal"}
      </Button>
    </div>
  );
}
