import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { StatusBadge } from "@/components/ui";
import { PreviewForm } from "@/components/preview/PreviewForm";
import type { SchemaSnapshot } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function PreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const journey = await prisma.journey.findUnique({
    where: { id: id },
    include: { currentVersion: true },
  });
  if (!journey || !journey.currentVersion) notFound();

  const schema = journey.currentVersion.schemaSnapshot as unknown as SchemaSnapshot;

  return (
    <div>
      <Link href={`/journeys/${journey.id}`} className="text-sm text-neutral-500 hover:text-route-600">
        ← back to journey
      </Link>
      <div className="mb-6 mt-2 flex items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{journey.name}</h1>
        <StatusBadge status={journey.status} />
        <span className="font-mono text-xs text-neutral-400">v{journey.currentVersion.versionNumber} preview</span>
      </div>
      <p className="mb-6 max-w-2xl text-sm text-neutral-500">
        Read-only mock of the intake form this journey configuration produces. Nothing here is submittable — it exists
        to prove the schema round-trips correctly from builder to render.
      </p>
      <PreviewForm schema={schema} />
    </div>
  );
}
