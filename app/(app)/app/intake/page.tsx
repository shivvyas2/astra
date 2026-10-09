import { IntakeForm } from "@/components/IntakeForm";
import { saveIntake } from "./actions";
import { ScreenHeader } from "@/components/ScreenHeader";

export default function IntakePage() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex min-h-full max-w-md flex-col justify-center px-5 py-8">
        <div className="mb-8">
          <ScreenHeader
            eyebrow="Birth details"
            title="Your birth details"
            arrow
            blurb="We compute your real chart from the exact moment and place you were born."
          />
        </div>
        <div className="brut-card p-5 sm:p-6">
          <IntakeForm action={saveIntake} />
        </div>
      </div>
    </div>
  );
}
