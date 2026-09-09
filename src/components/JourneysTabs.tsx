"use client";

import { useState } from "react";
import Link from "next/link";
import { StatusBadge, Card } from "@/components/ui";

type JourneyRow = {
  id: string;
  name: string;
  status: string;
  productType: string;
  currentVersion: { versionNumber: number; schemaSnapshot: unknown } | null;
  pendingReviewCount: number;
};

type ActionRow = JourneyRow & { reasons: string[] };

type DealActionRow = { dealId: string; dealName: string; journeyName: string; reason: string };

function stageCountOf(row: JourneyRow): number {
  const stages = (row.currentVersion?.schemaSnapshot as any)?.stages;
  return Array.isArray(stages) ? stages.length : 0;
}

export function JourneyList({ journeys, emptyLabel }: { journeys: JourneyRow[]; emptyLabel: string }) {
  if (journeys.length === 0) {
    return (
      <Card className="px-8 py-14 text-center">
        <p className="font-mono text-sm text-neutral-400">— {emptyLabel} —</p>
      </Card>
    );
  }
  return (
    <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white shadow-sm">
      {journeys.map((j) => {
        const stageCount = stageCountOf(j);
        return (
          <li key={j.id}>
            <Link href={`/journeys/${j.id}`} className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-route-50/50">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate font-medium text-ink">{j.name}</p>
                  <StatusBadge status={j.status} />
                </div>
                <p className="mt-0.5 truncate text-sm text-neutral-500">
                  {j.productType} · {stageCount} stage{stageCount === 1 ? "" : "s"}
                  {j.status === "in_review" && j.pendingReviewCount > 0
                    ? ` · ${j.pendingReviewCount} reviewer${j.pendingReviewCount === 1 ? "" : "s"} pending`
                    : ""}
                </p>
              </div>
              <span className="shrink-0 font-mono text-xs text-neutral-400">
                v{j.currentVersion?.versionNumber ?? "—"}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function ActionNeededList({ journeys, deals }: { journeys: ActionRow[]; deals: DealActionRow[] }) {
  if (journeys.length === 0 && deals.length === 0) {
    return (
      <Card className="px-8 py-14 text-center">
        <p className="font-mono text-sm text-neutral-400">— nothing needs your action right now —</p>
        <p className="mt-2 text-xs text-neutral-400">
          This fills in when a journey you own is still a draft, a review is pending for the profile type you
          logged in as, or a live deal's current stage is waiting on that profile type. No profile type set?{" "}
          <Link href="/login" className="text-route-600 hover:underline">
            Add one
          </Link>
          .
        </p>
      </Card>
    );
  }
  return (
    <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white shadow-sm">
      {journeys.map((j) => (
        <li key={`journey-${j.id}`}>
          <Link href={`/journeys/${j.id}`} className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-route-50/50">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate font-medium text-ink">{j.name}</p>
                <StatusBadge status={j.status} />
              </div>
              <p className="mt-1 text-sm text-amber-700">{j.reasons.join(" · ")}</p>
            </div>
            <span className="shrink-0 font-mono text-xs text-neutral-400">
              v{j.currentVersion?.versionNumber ?? "—"}
            </span>
          </Link>
        </li>
      ))}
      {deals.map((d) => (
        <li key={`deal-${d.dealId}`}>
          <Link href={`/deals/${d.dealId}`} className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-route-50/50">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate font-medium text-ink">{d.dealName}</p>
                <span className="rounded-full border border-route-300 bg-route-50 px-2 py-0.5 text-xs font-medium text-route-700">
                  live deal
                </span>
              </div>
              <p className="mt-0.5 truncate text-xs text-neutral-400">on {d.journeyName}</p>
              <p className="mt-1 text-sm text-amber-700">{d.reason}</p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

// Four tabs. "Action needed" is the default landing view whenever there's
// something in it — that's the whole point of a dashboard: land somewhere
// useful, not on a generic list you have to scan yourself. Falls back to
// "new" (empty state) or "drafts" otherwise, same as before.
export function JourneysTabs({
  journeys,
  actionNeeded,
  dealActionNeeded,
}: {
  journeys: JourneyRow[];
  actionNeeded: ActionRow[];
  dealActionNeeded: DealActionRow[];
}) {
  const totalActionCount = actionNeeded.length + dealActionNeeded.length;
  const defaultTab = totalActionCount > 0 ? "action" : journeys.length === 0 ? "new" : "drafts";
  const [tab, setTab] = useState<"action" | "new" | "live" | "drafts">(defaultTab);

  const live = journeys.filter((j) => j.status === "published");
  const drafts = journeys.filter((j) => j.status === "draft" || j.status === "in_review" || j.status === "archived");

  const tabs: { key: typeof tab; label: string; count?: number }[] = [
    { key: "action", label: "Action needed", count: totalActionCount },
    { key: "new", label: "New journey" },
    { key: "live", label: "Live", count: live.length },
    { key: "drafts", label: "Drafts", count: drafts.length },
  ];

  return (
    <div>
      <div className="mb-6 flex gap-1 border-b border-neutral-200">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.key
                ? "border-route-600 text-route-700"
                : "border-transparent text-neutral-500 hover:text-ink"
            }`}
          >
            {t.label}
            {typeof t.count === "number" && t.count > 0 ? (
              <span
                className={`ml-1.5 rounded-full px-1.5 text-xs ${
                  t.key === "action" ? "bg-amber-100 text-amber-800" : "text-neutral-400"
                }`}
              >
                {t.count}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {tab === "action" && <ActionNeededList journeys={actionNeeded} deals={dealActionNeeded} />}

      {tab === "new" && (
        <Card className="p-8">
          <h2 className="text-lg font-semibold text-ink">Start a new journey</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Build it stage by stage yourself, or paste a process description (or upload a .pdf/.docx/.txt) and let AI
            draft the first pass — either way you review and edit before anything goes live.
          </p>
          <div className="mt-5 flex gap-3">
            <Link
              href="/journeys/new"
              className="inline-flex items-center justify-center rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-ink hover:border-route-500 hover:text-route-700"
            >
              Start from scratch
            </Link>
            <Link
              href="/journeys/new?ai=1"
              className="inline-flex items-center justify-center rounded-md bg-route-600 px-4 py-2 text-sm font-medium text-white hover:bg-route-700"
            >
              ✦ Draft with AI
            </Link>
          </div>
        </Card>
      )}

      {tab === "live" && <JourneyList journeys={live} emptyLabel="no live journeys yet" />}
      {tab === "drafts" && <JourneyList journeys={drafts} emptyLabel="no drafts yet" />}
    </div>
  );
}
