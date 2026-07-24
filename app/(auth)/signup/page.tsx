import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";
import { signUpWithPassword } from "../actions";

export default async function SignupPage({
  searchParams,
}: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  return (
    <AuthForm
      title="Create your Astra account"
      primaryLabel="Sign up"
      primaryAction={signUpWithPassword}
      error={sp.error}
      footer={<>Already have an account? <Link className="text-fg underline" href="/login">Log in</Link></>}
    />
  );
}
