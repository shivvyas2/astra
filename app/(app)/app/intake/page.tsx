import { IntakeForm } from "@/components/IntakeForm";
import { saveIntake } from "./actions";

export default function IntakePage() {
  return (
    <div className="relative mx-auto flex h-full max-w-md flex-col items-center justify-center overflow-y-auto px-5 py-5">
      {/* cosmic glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-1/4 -z-10 mx-auto h-[380px] max-w-lg blur-2xl"
        style={{
          background:
            "radial-gradient(closest-side, rgba(99,91,255,0.22), rgba(232,102,61,0.06) 45%, transparent 72%)",
        }}
      />
      <div className="mb-4 text-center">
        <h1 className="text-xl font-light tracking-tight sm:text-2xl">Your birth details</h1>
        <p className="mt-1 text-xs text-muted">
          We compute your real chart from the exact moment and place you were born.
        </p>
      </div>
      <IntakeForm action={saveIntake} />
    </div>
  );
}
