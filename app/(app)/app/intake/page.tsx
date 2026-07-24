import { IntakeForm } from "@/components/IntakeForm";
import { saveIntake } from "./actions";

export default function IntakePage() {
  return (
    <div>
      <h1 className="mb-6 text-3xl font-bold">Your birth details</h1>
      <IntakeForm action={saveIntake} />
    </div>
  );
}
