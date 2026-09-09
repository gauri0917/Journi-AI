import Link from "next/link";
import { prisma } from "@/lib/db";
import { Card, StatusBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function DealsPage() {
  const deals = await prisma.deal.findMany({
    orderBy: { updatedAt: "desc" },
    include: { journey: true },
  });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Deals</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Every deal currently moving through a published journey, across the whole workspace.
        </p>
      </div>

      {deals.length === 0 ? (
        <Card className="px-8 py-14 text-center">
          <p className="font-mono text-sm text-neutral-400">— no deals yet —</p>
          <p className="mt-2 text-sm text-neutral-500">
            Start one from any published journey's detail page.
          </p>
        </Card>
      ) : (
        <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white shadow-sm">
          {deals.map((d: (typeof deals)[number]) => (
            <li key={d.id}>
              <Link href={`/deals/${d.id}`} className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-route-50/50">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-medium text-ink">{d.name}</p>
                    <StatusBadge status={d.status} />
                  </div>
                  <p className="mt-0.5 truncate text-sm text-neutral-500">
                    {d.journey.name} · started by {d.createdBy}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-neutral-400">
                  {new Date(d.updatedAt).toLocaleDateString()}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
