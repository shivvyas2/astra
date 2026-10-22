import Link from "next/link";
import { IntakeForm } from "@/components/IntakeForm";
import { PersonFields } from "@/components/PersonFields";
import { createPersonAction } from "../actions";
import { Notice } from "@/components/Notice";
import { getI18n } from "@/lib/i18n/server";
import { formError } from "../errors";

export default async function NewPersonPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const i18n = await getI18n();
  const { t } = i18n;
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-md px-5 py-8">
        <Link href="/app/profiles" className="eyebrow transition-colors hover:text-fg">{t.people.back}</Link>
        <h1 className="headline headline-arrow mt-4 text-4xl sm:text-5xl">{t.people.newTitle}</h1>
        <p className="mt-2 text-sm text-muted">{t.people.newBlurb}</p>
        {error && <Notice className="mt-4">{formError(i18n, error)}</Notice>}
        <div className="brut-card mt-5 p-5">
          <IntakeForm
            action={createPersonAction}
            extra={<PersonFields />}
            photo={false}
            lastNameOptional
            someoneElse
            submitLabel={t.people.saveNew}
          />
        </div>
      </div>
    </div>
  );
}
