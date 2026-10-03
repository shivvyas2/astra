import { IntakeForm } from "@/components/IntakeForm";
import { saveIntake } from "./actions";

export default function IntakePage() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex min-h-full max-w-md flex-col justify-center px-5 py-8">
        <div className="mb-5">
          <p className="eyebrow">Birth details</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight">Your birth details</h1>
          <p className="mt-2 text-sm text-muted">
            We compute your real chart from the exact moment and place you were born.
          </p>
        </div>
        <div className="brut-card p-5">
          <IntakeForm action={saveIntake} />
        </div>
      </div>
    </div>
  );
}
