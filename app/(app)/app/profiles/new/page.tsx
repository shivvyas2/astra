import Link from "next/link";
import { IntakeForm } from "@/components/IntakeForm";
import { PersonFields } from "@/components/PersonFields";
import { createPersonAction } from "../actions";
import { Notice } from "@/components/Notice";

export default async function NewPersonPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-md px-5 py-8">
        <Link href="/app/profiles" className="eyebrow transition-colors hover:text-fg">← People</Link>
        <h1 className="headline headline-arrow mt-4 text-4xl sm:text-5xl">Add someone</h1>
        <p className="mt-2 text-sm text-muted">Their birth date and place build their chart. The time helps, but you can leave it out.</p>
        {error && <Notice className="mt-4">{error}</Notice>}
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
