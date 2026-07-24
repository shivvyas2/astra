import { IntakeForm } from "@/components/IntakeForm";
import { saveIntake } from "./actions";

export default function IntakePage() {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold sm:text-3xl">Your birth details</h1>
      <IntakeForm action={saveIntake} />
    </div>
  );
}
