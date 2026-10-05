import Link from "next/link";
import { IntakeForm } from "@/components/IntakeForm";
import { PersonFields } from "@/components/PersonFields";
import { createPersonAction } from "../actions";

export default async function NewPersonPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-md px-5 py-8">
        <Link href="/app/profiles" className="eyebrow">← People</Link>
        <h1 className="mt-2 text-3xl font-black tracking-tight">Add someone</h1>
        <p className="mt-2 text-sm text-muted">Their birth date and place build their chart. The time helps, but you can leave it out.</p>
        {error && <p role="alert" className="brut-bordered mt-4 border-accent p-3 text-sm">{error}</p>}
        <div className="brut-card mt-5 p-5">
          <IntakeForm
            action={createPersonAction}
            extra={<PersonFields />}
            photo={false}
            lastNameOptional
            someoneElse
            submitLabel="Save & build their chart"
          />
        </div>
      </div>
    </div>
  );
}
