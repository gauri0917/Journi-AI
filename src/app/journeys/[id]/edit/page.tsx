import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { BuilderWizard } from "@/components/builder/BuilderWizard";
import { currentUserName } from "@/lib/current-user";
import type { SchemaSnapshot } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function EditJourneyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const journey = await prisma.journey.findUnique({
    where: { id: id },
    include: { currentVersion: true },
  });
  if (!journey) notFound();
  // Drafts are private to their creator — nobody else should even be able
  // to reach the editor for one via a direct URL.
  if (journey.status === "draft" && journey.createdBy !== (await currentUserName())) notFound();
  if (journey.status === "published" || journey.status === "archived") {
    redirect(`/journeys/${journey.id}`);
  }

  const schema = journey.currentVersion?.schemaSnapshot as unknown as SchemaSnapshot | undefined;

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Edit journey</h1>
      <p className="mb-6 text-sm text-neutral-500">
        Editing writes a new version on submit — the previous version is kept, never overwritten.
      </p>
      <BuilderWizard
        journeyId={journey.id}
        initialBasics={{
          name: journey.name,
          description: journey.description ?? "",
          productType: journey.productType,
        }}
        initialStages={schema?.stages ?? []}
        startStep="stages"
      />
    </div>
  );
}
