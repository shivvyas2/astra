import { IntakeForm } from "@/components/IntakeForm";
import { saveIntake } from "./actions";
import { ScreenHeader } from "@/components/ScreenHeader";
import { getI18n } from "@/lib/i18n/server";

export default async function IntakePage() {
  const { t } = await getI18n();
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex min-h-full max-w-md flex-col justify-center px-5 py-8">
        <div className="mb-8">
          <ScreenHeader
            eyebrow={t.intake.eyebrow}
            title={t.intake.title}
            arrow
            blurb={t.intake.blurb}
          />
        </div>
        <div className="brut-card p-5 sm:p-6">
          <IntakeForm action={saveIntake} />
        </div>
      </div>
    </div>
  );
}
