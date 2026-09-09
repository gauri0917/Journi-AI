"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, ErrorList } from "@/components/ui";

export function PublishButton({
  journeyId,
  canPublish,
  pendingCount,
  isOwner,
  ownerName,
}: {
  journeyId: string;
  canPublish: boolean;
  pendingCount: number;
  isOwner: boolean;
  ownerName: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  async function publish() {
    setLoading(true);
    setErrors([]);
    try {
      const res = await fetch(`/api/journeys/${journeyId}/publish`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        setErrors([body.error ?? "Could not publish"]);
        return;
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (!isOwner) {
    return <p className="text-xs text-neutral-400">Only {ownerName} (who created this journey) can publish it.</p>;
  }

  return (
    <div>
      <Button type="button" onClick={publish} disabled={!canPublish || loading}>
        {loading ? "Publishing…" : "Publish"}
      </Button>
      {!canPublish && pendingCount > 0 && (
        <p className="mt-1 text-xs text-amber-700">{pendingCount} reviewer{pendingCount === 1 ? "" : "s"} still pending.</p>
      )}
      <ErrorList errors={errors} />
    </div>
  );
}

export function ArchiveButton({
  journeyId,
  isOwner,
  ownerName,
}: {
  journeyId: string;
  isOwner: boolean;
  ownerName: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  async function archive() {
    if (!confirm("Archive this journey? This cannot be undone.")) return;
    setLoading(true);
    setErrors([]);
    try {
      const res = await fetch(`/api/journeys/${journeyId}/archive`, { method: "POST" });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setErrors([body?.error ?? "Could not archive"]);
        return;
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (!isOwner) {
    return <p className="text-xs text-neutral-400">Only {ownerName} (who created this journey) can archive it.</p>;
  }

  return (
    <div>
      <Button type="button" variant="danger" onClick={archive} disabled={loading}>
        {loading ? "Archiving…" : "Archive"}
      </Button>
      <ErrorList errors={errors} />
    </div>
  );
}
