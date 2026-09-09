import { BuilderWizard } from "@/components/builder/BuilderWizard";

export default function NewJourneyPage({
  searchParams,
}: {
  searchParams: { ai?: string };
}) {
  const autoOpenAi = searchParams?.ai === "1";

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">New journey</h1>
      <p className="mb-6 text-sm text-neutral-500">
        Define stages, fields, approvals, and required documents. Nothing is saved until you submit for review.
      </p>
      <BuilderWizard autoOpenAi={autoOpenAi} />
    </div>
  );
}
