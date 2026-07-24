import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";
import { signInWithPassword, sendMagicLink } from "../actions";

export default async function LoginPage({
  searchParams,
}: { searchParams: Promise<{ error?: string; sent?: string }> }) {
  const sp = await searchParams;
  return (
    <AuthForm
      title="Welcome back"
      primaryLabel="Log in"
      primaryAction={signInWithPassword}
      magicAction={sendMagicLink}
      error={sp.error}
      notice={sp.sent ? "Check your email for a magic link." : undefined}
      footer={<>New here? <Link className="text-fg underline" href="/signup">Create an account</Link></>}
    />
  );
}
