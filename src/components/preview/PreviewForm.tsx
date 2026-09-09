import type { SchemaSnapshot, StageField } from "@/lib/types";
import { Card } from "@/components/ui";

function MockInput({ field }: { field: StageField }) {
  const base = "w-full rounded-md border border-neutral-300 bg-neutral-50 px-3 py-2 text-sm text-neutral-400";
  switch (field.type) {
    case "dropdown":
      return (
        <select disabled className={base}>
          <option>Select…</option>
          {(field.options ?? []).map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      );
    case "boolean":
      return (
        <div className="flex items-center gap-2">
          <input type="checkbox" disabled className="h-4 w-4 rounded border-neutral-300" />
          <span className="text-sm text-neutral-400">Yes / No</span>
        </div>
      );
    case "file":
      return <div className={`${base} border-dashed text-center`}>Upload file…</div>;
    case "currency":
      return (
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-neutral-400">$</span>
          <input disabled placeholder="0.00" className={`${base} pl-6`} />
        </div>
      );
    case "date":
      return <input type="date" disabled className={base} />;
    case "number":
      return <input type="number" disabled placeholder="0" className={base} />;
    default:
      return <input type="text" disabled placeholder="—" className={base} />;
  }
}

export function PreviewForm({ schema }: { schema: SchemaSnapshot }) {
  const stages = [...schema.stages].sort((a, b) => a.order - b.order);
  return (
    <div className="space-y-6">
      {stages.map((stage, i) => (
        <Card key={stage.id} className="p-6">
          <div className="mb-4 flex items-start justify-between">
            <div>
              <p className="font-mono text-xs text-neutral-400">Stage {i + 1} of {stages.length}</p>
              <h3 className="text-lg font-semibold">{stage.name}</h3>
              <p className="text-sm text-neutral-500">Owner: {stage.owner_role}</p>
            </div>
            {stage.approval_required && (
              <span className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                requires approval · {stage.approver_role}
              </span>
            )}
          </div>

          <div className="space-y-4">
            {stage.fields.map((field) => (
              <div key={field.id}>
                <label className="mb-1 block text-sm font-medium text-neutral-700">
                  {field.label}
                  {field.required && <span className="ml-1 text-red-500">*</span>}
                </label>
                <MockInput field={field} />
                {field.help_text && <p className="mt-1 text-xs text-neutral-400">{field.help_text}</p>}
              </div>
            ))}
            {stage.fields.length === 0 && <p className="text-sm text-neutral-400">No intake fields in this stage.</p>}
          </div>

          {stage.required_documents.length > 0 && (
            <div className="mt-5 border-t border-neutral-100 pt-4">
              <p className="mb-2 text-sm font-medium text-neutral-700">Required documents</p>
              <ul className="space-y-1">
                {stage.required_documents.map((doc) => (
                  <li key={doc.id} className="flex items-center justify-between rounded border border-dashed border-neutral-300 px-3 py-2 text-sm text-neutral-500">
                    <span>{doc.name}{doc.required && <span className="ml-1 text-red-500">*</span>}</span>
                    <span className="text-xs">Upload…</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {stage.approval_threshold && (
            <p className="mt-4 font-mono text-xs text-neutral-400">
              approval triggers when {stage.approval_threshold.field} {stage.approval_threshold.operator} {String(stage.approval_threshold.value)}
            </p>
          )}
        </Card>
      ))}
    </div>
  );
}
